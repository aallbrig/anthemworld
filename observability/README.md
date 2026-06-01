# Observability stack — LGTM + raw Prometheus

Local-first telemetry for the Anthem World game backend. The six SAM Lambdas
emit OpenTelemetry **traces, metrics, and logs** over OTLP/HTTP to a standalone
OpenTelemetry Collector, which fans them out to:

| Signal  | Backend     | How                                              |
|---------|-------------|--------------------------------------------------|
| Metrics | Prometheus  | Collector exposes `:8889`; Prometheus scrapes it |
| Traces  | Tempo       | Collector → Tempo OTLP `:4317`                   |
| Logs    | Loki        | Collector → Loki OTLP `/otlp/v1/logs`            |
| View    | Grafana     | Provisioned datasources + dashboards             |

> We run **raw Prometheus** (pull model) rather than Mimir. The collector’s
> Prometheus exporter is the scrape target, so ephemeral Lambdas still push
> (OTLP) while Prometheus still pulls.

```
SAM-local Lambda ──OTLP/HTTP──▶ otel-collector ──▶ Prometheus (scrape :8889)
 (shared/telemetry.js)                          ├▶ Tempo  (OTLP :4317)
                                                └▶ Loki   (OTLP /otlp)
                                                          ▲
                                                       Grafana
```

## Run it

```bash
task obs:up          # start collector + prometheus + tempo + loki + grafana
task bootstrap       # (if not already) localstack + tables + seed + sam build
task sam:local       # SAM API on :3005, Lambdas push OTLP to the collector
# ... drive traffic (play the game, or run scripts/smoke-traffic.sh) ...
```

Then open:

- **Grafana** — http://localhost:3000 (anonymous admin) → *Dashboards → Anthem World*
  - **SRE Golden Signals** — traffic, errors, latency, saturation
  - **Product Engagement** — sessions/matchups/votes funnel, per-country wins, listening
- **Prometheus** — http://localhost:9090
- **Tempo** / **Loki** are wired as Grafana datasources (Explore view)

Useful commands: `task obs:status`, `task obs:logs`, `task obs:collector:logs`,
`task obs:down` (keep data), `task obs:clean` (wipe telemetry volumes).

## How the app is instrumented

`sam/game/functions/shared/telemetry.js`:

- `withTelemetry(route, handler)` wraps each Lambda — a SERVER span, the
  golden-signal metrics (`http.server.requests`, `http.server.duration`,
  `http.server.errors`), and a structured request log, **force-flushed every
  invocation** so a frozen execution environment can’t drop the last batch.
- `record*()` helpers emit product metrics: `anthem.votes`,
  `anthem.country.votes`, `anthem.sessions.created`, `anthem.matchups.served`,
  `anthem.listen.events`, `anthem.listen.ms`.
- AWS SDK auto-instrumentation adds DynamoDB child spans.

Telemetry is **inactive unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set** (and
`NODE_ENV != test`), so unit tests and CI stay offline with zero overhead. Local
activation is via `sam/game/env.local.json`.

### Metric naming

The collector’s Prometheus exporter runs with `add_metric_suffixes: false`, so
OTel instrument names map predictably (dots → underscores, no `_total`/unit
suffix):

| OTel instrument         | Prometheus series                          |
|-------------------------|--------------------------------------------|
| `http.server.requests`  | `http_server_requests{route,status_class}` |
| `http.server.duration`  | `http_server_duration_bucket/_sum/_count`  |
| `anthem.votes`          | `anthem_votes{vote_category}`              |
| `anthem.country.votes`  | `anthem_country_votes{country_id,result}`  |
| `anthem.listen.ms`      | `anthem_listen_ms_bucket/_sum/_count`      |

### Cardinality discipline

Only bounded values are metric labels: `route`, `method`, `status_*`,
`vote_category`, `wildcard`, and `country_id` (≤193). Unbounded values
(`session_id`, `matchup_id`, IP) are **never** labels — they live on spans/logs.

## Promoting to production (not wired here — by design)

This is local-first. The live backend (real AWS Lambda) stays untouched:
telemetry is off in prod because no OTLP endpoint is set. To turn it on later:

1. Run this stack (or Grafana Cloud) somewhere reachable from AWS.
2. Add the **ADOT Collector Lambda layer** as a freeze-safe OTLP forwarder
   (the documented Lambda pattern), or point `OTEL_EXPORTER_OTLP_ENDPOINT` at a
   collector endpoint with auth.
3. Set `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` in the SAM template’s
   `Globals.Function.Environment` for the `prod` stage.

No application code changes are required — only configuration.
