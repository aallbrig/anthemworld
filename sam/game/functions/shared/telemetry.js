/**
 * OpenTelemetry wiring for the Anthem World game backend.
 *
 * Design goals:
 *   - Vendor-neutral: app emits OTLP/HTTP to a standalone collector (see
 *     observability/ docker-compose). No ADOT layer required locally; ADOT is
 *     the documented drop-in for real Lambda prod later.
 *   - Hermetic by default: telemetry is INACTIVE unless an OTLP endpoint is
 *     configured (and NODE_ENV !== 'test'), so unit tests and CI never touch
 *     the network and pay zero overhead. When inactive, withTelemetry() returns
 *     the handler untouched and every record*() helper is a no-op.
 *   - Lambda-safe: providers are force-flushed at the end of every invocation
 *     so a frozen/recycled execution environment can't drop the last batch.
 *
 * Enable by setting OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://otel-collector:4318).
 * Force off with OTEL_ENABLED=false.
 *
 * Cardinality rule (per project decision): only bounded values become metric
 * labels — route, method, status, vote_category, and country_id (≤193). Never
 * session_id / matchup_id / ip / raw URLs; those live on spans and logs.
 */
const otelApi = require('@opentelemetry/api');

const ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const ACTIVE =
    process.env.OTEL_ENABLED !== 'false' &&
    process.env.NODE_ENV !== 'test' &&
    !!ENDPOINT;

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'anthemworld-game';

// Providers kept for per-invocation force-flush.
let _providers = [];
let _meter = null;
let _logger = null;

// Metric instruments (created only when ACTIVE).
let mRequests, mDuration, mErrors, mVotes, mCountryVotes, mSessions, mMatchups, mListenEvents, mListenMs;

function buildResource(attrs) {
    // The Resource API surface moved between OTel JS versions; support both.
    const res = require('@opentelemetry/resources');
    if (typeof res.resourceFromAttributes === 'function') return res.resourceFromAttributes(attrs);
    if (res.Resource && typeof res.Resource === 'function') return new res.Resource(attrs);
    return undefined;
}

function initOtel() {
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
    const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
    const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');
    const { AwsInstrumentation } = require('@opentelemetry/instrumentation-aws-sdk');
    const logsApi = require('@opentelemetry/api-logs');

    const resource = buildResource({
        'service.name': SERVICE_NAME,
        'service.version': process.env.OTEL_SERVICE_VERSION || '1.0.0',
        'deployment.environment': process.env.STAGE || 'local',
    });

    // ── Traces ──────────────────────────────────────────────────────────────
    const tracerProvider = new NodeTracerProvider({
        resource,
        spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
    });
    tracerProvider.register();

    // ── Metrics ─────────────────────────────────────────────────────────────
    const meterProvider = new MeterProvider({
        resource,
        readers: [new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || 10000),
        })],
    });
    otelApi.metrics.setGlobalMeterProvider(meterProvider);

    // ── Logs ────────────────────────────────────────────────────────────────
    const loggerProvider = new LoggerProvider({
        resource,
        processors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    });
    logsApi.logs.setGlobalLoggerProvider(loggerProvider);

    // ── Auto-instrument the AWS SDK (DynamoDB spans) ─────────────────────────
    registerInstrumentations({
        tracerProvider,
        instrumentations: [new AwsInstrumentation()],
    });

    _providers = [tracerProvider, meterProvider, loggerProvider];
    _meter = otelApi.metrics.getMeter(SERVICE_NAME);
    _logger = logsApi.logs.getLogger(SERVICE_NAME);

    // ── Instruments ──────────────────────────────────────────────────────────
    // Golden signals (traffic / errors / latency); saturation comes from
    // collector & Lambda/host metrics in Prometheus.
    mRequests = _meter.createCounter('http.server.requests', {
        description: 'Count of HTTP requests handled, by route and status',
    });
    mDuration = _meter.createHistogram('http.server.duration', {
        description: 'HTTP request handler duration', unit: 'ms',
    });
    mErrors = _meter.createCounter('http.server.errors', {
        description: 'Count of failed HTTP requests (5xx or thrown)',
    });

    // Product / business metrics.
    mVotes = _meter.createCounter('anthem.votes', {
        description: 'Votes cast, by weight category',
    });
    mCountryVotes = _meter.createCounter('anthem.country.votes', {
        description: 'Per-country win/loss tally from votes',
    });
    mSessions = _meter.createCounter('anthem.sessions.created', {
        description: 'Anonymous game sessions created',
    });
    mMatchups = _meter.createCounter('anthem.matchups.served', {
        description: 'Matchup pairs served',
    });
    mListenEvents = _meter.createCounter('anthem.listen.events', {
        description: 'Listen progress events ingested, by country',
    });
    mListenMs = _meter.createHistogram('anthem.listen.ms', {
        description: 'Listen time per ingested event', unit: 'ms',
    });
}

if (ACTIVE) {
    try {
        initOtel();
    } catch (err) {
        // Never let observability break the app.
        console.error('telemetry init failed; continuing without OTel:', err);
    }
}

/** Force-flush all signal providers. Best-effort; never throws. */
async function flush() {
    await Promise.allSettled(
        _providers
            .filter(p => p && typeof p.forceFlush === 'function')
            .map(p => p.forceFlush().catch(() => {})),
    );
}

/** Sanitize a country code into a bounded label value. */
function country(code) {
    return (typeof code === 'string' && /^[A-Z]{2,3}$/.test(code)) ? code : 'ZZZ';
}

function emitLog(severityText, body, attributes) {
    if (!_logger) return;
    try {
        _logger.emit({ severityText, body, attributes });
    } catch { /* ignore */ }
}

/**
 * Wrap a Lambda handler with a server span + golden-signal metrics + a
 * structured request log, force-flushing telemetry before returning.
 * No-op passthrough when telemetry is inactive.
 */
function withTelemetry(route, handler) {
    if (!ACTIVE) return handler;
    const { SpanKind, SpanStatusCode } = otelApi;
    const tracer = otelApi.trace.getTracer(SERVICE_NAME);

    return async (event, context) => {
        const method = (event && event.httpMethod) || 'GET';
        const start = Date.now();

        return tracer.startActiveSpan(
            `${method} ${route}`,
            { kind: SpanKind.SERVER, attributes: { 'http.method': method, 'http.route': route } },
            async (span) => {
                let statusCode = 200;
                let threw = null;
                try {
                    const res = await handler(event, context);
                    statusCode = (res && res.statusCode) || 200;
                    return res;
                } catch (err) {
                    threw = err;
                    span.recordException(err);
                    throw err;
                } finally {
                    if (threw) statusCode = 500;
                    const durationMs = Date.now() - start;
                    const statusClass = `${Math.floor(statusCode / 100)}xx`;
                    const labels = { route, method, status_code: String(statusCode), status_class: statusClass };

                    mRequests.add(1, labels);
                    mDuration.record(durationMs, labels);
                    if (statusCode >= 500) {
                        mErrors.add(1, { route, type: threw ? (threw.name || 'Error') : 'http_5xx' });
                    }

                    span.setAttribute('http.status_code', statusCode);
                    span.setStatus({ code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
                    span.end();

                    emitLog(statusCode >= 500 ? 'ERROR' : 'INFO', 'request', {
                        route, 'http.method': method, 'http.status_code': statusCode, duration_ms: durationMs,
                    });

                    await flush();
                }
            },
        );
    };
}

// ── Business-metric helpers (no-ops when inactive) ───────────────────────────

function recordVote({ winnerCountry, loserCountry, voteCategory } = {}) {
    if (!ACTIVE) return;
    mVotes.add(1, { vote_category: voteCategory || 'unknown' });
    mCountryVotes.add(1, { country_id: country(winnerCountry), result: 'win' });
    mCountryVotes.add(1, { country_id: country(loserCountry), result: 'loss' });
}

function recordSessionCreated({ country: c } = {}) {
    if (!ACTIVE) return;
    mSessions.add(1, { country_id: country(c) });
}

function recordMatchupServed({ wildcard } = {}) {
    if (!ACTIVE) return;
    mMatchups.add(1, { wildcard: wildcard ? 'true' : 'false' });
}

function recordListen({ country: c, listenMs } = {}) {
    if (!ACTIVE) return;
    mListenEvents.add(1, { country_id: country(c) });
    if (typeof listenMs === 'number' && listenMs >= 0) mListenMs.record(listenMs);
}

module.exports = {
    ACTIVE,
    withTelemetry,
    recordVote,
    recordSessionCreated,
    recordMatchupServed,
    recordListen,
    flush,
};
