#!/usr/bin/env node
/**
 * Telemetry smoke generator — drives a realistic game-traffic mix through the
 * REAL shared/telemetry module (the same code path the Lambdas use) so you can
 * validate the collector -> Prometheus/Tempo/Loki -> Grafana pipeline and the
 * dashboard queries without needing DynamoDB/SAM running.
 *
 * Usage:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
 *     node observability/scripts/generate-telemetry.js [iterations=200]
 *
 * For a no-traffic real run instead, start the stack + SAM and play the game,
 * or use observability/scripts/smoke-traffic.sh against the live local API.
 */
process.env.OTEL_EXPORTER_OTLP_ENDPOINT =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'anthemworld-game';
// Export metrics quickly so the smoke run shows up without waiting.
process.env.OTEL_METRIC_EXPORT_INTERVAL_MS = process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || '2000';

const path = require('path');
const telemetry = require(path.resolve(__dirname, '../../sam/game/functions/shared/telemetry'));

if (!telemetry.ACTIVE) {
    console.error('Telemetry is INACTIVE — is OTEL_EXPORTER_OTLP_ENDPOINT set?');
    process.exit(1);
}

const ITERATIONS = parseInt(process.argv[2] || '200', 10);
const COUNTRIES = ['USA', 'FRA', 'JPN', 'BRA', 'DEU', 'IND', 'GBR', 'CAN', 'AUS', 'ZAF', 'MEX', 'KOR', 'EGY', 'NGA', 'ARG'];
const CATEGORIES = ['under_weight', 'full_weight', 'bonus'];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fake handler that simulates work + an occasional error status. */
function fakeHandler(errRate, latencyMs) {
    return async () => {
        await sleep(latencyMs);
        const roll = Math.random();
        if (roll < errRate * 0.5) return { statusCode: 400 };
        if (roll < errRate * 0.8) return { statusCode: 429 };
        if (roll < errRate) return { statusCode: 500 };
        return { statusCode: 200 };
    };
}

const session = telemetry.withTelemetry('/session', fakeHandler(0.02, 8 + rand(20)));
const matchup = telemetry.withTelemetry('/matchup', fakeHandler(0.05, 15 + rand(40)));
const vote = telemetry.withTelemetry('/vote', fakeHandler(0.06, 20 + rand(60)));
const listen = telemetry.withTelemetry('/listen', fakeHandler(0.03, 5 + rand(15)));
const leaderboard = telemetry.withTelemetry('/leaderboard', fakeHandler(0.02, 30 + rand(80)));
const weekly = telemetry.withTelemetry('/weekly', fakeHandler(0.02, 25 + rand(70)));

async function main() {
    console.log(`Generating ~${ITERATIONS} game flows -> ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
    for (let i = 0; i < ITERATIONS; i++) {
        // 1 session
        await session({ httpMethod: 'POST' });
        telemetry.recordSessionCreated({ country: pick(COUNTRIES) });

        // A few matchups, listens, and votes per session
        const rounds = 1 + rand(4);
        for (let r = 0; r < rounds; r++) {
            const wildcard = Math.random() < 0.1;
            await matchup({ httpMethod: 'GET' });
            telemetry.recordMatchupServed({ wildcard });

            const a = pick(COUNTRIES);
            let b = pick(COUNTRIES);
            while (b === a) b = pick(COUNTRIES);

            await listen({ httpMethod: 'POST' });
            telemetry.recordListen({ country: a, listenMs: 1000 + rand(60000) });
            telemetry.recordListen({ country: b, listenMs: 1000 + rand(60000) });

            if (Math.random() < 0.7) {
                await vote({ httpMethod: 'POST' });
                telemetry.recordVote({ winnerCountry: a, loserCountry: b, voteCategory: pick(CATEGORIES) });
            }
        }

        // Occasionally view leaderboard / weekly
        if (Math.random() < 0.3) await leaderboard({ httpMethod: 'GET' });
        if (Math.random() < 0.15) await weekly({ httpMethod: 'GET' });

        if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${ITERATIONS}\n`);
    }

    console.log('Flushing telemetry...');
    await telemetry.flush();
    // Give the periodic metric reader one more interval to export.
    await sleep(2500);
    await telemetry.flush();
    console.log('Done.');
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
