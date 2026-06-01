# Observability stack — local end-to-end validation

**Date:** 2026-06-01 12:45 UTC
**Scope:** Backend telemetry (OTel logs/metrics/traces) + LGTM-minus-Mimir stack
(Loki, Grafana, Tempo, **raw Prometheus**) for the Anthem World game backend.

## What was validated

The full pipeline was exercised locally and confirmed working:

```
generate-telemetry.js ──OTLP/HTTP──▶ otel-collector ─┬─▶ Prometheus (scrape :8889)
 (uses shared/telemetry.js,                           ├─▶ Tempo (OTLP)
  the same code path the Lambdas use)                 └─▶ Loki (OTLP)
                                                              ▲
                                                           Grafana (provisioned)
```

Because the host already ran a separate LGTM stack (`madcatalog-*`) on the
standard ports, the Anthem World stack was brought up on alternate **host**
ports (Grafana 3002, Prometheus 9091, Tempo 3201, Loki 3101, OTLP 4319/4327).
In-network wiring uses container ports unchanged, so this only affects host
access — the committed defaults remain standard (3000/9090/3100/3200/4318).

### Evidence

**Metrics in Prometheus** — all dashboard series present with the expected
names (collector exporter runs `add_metric_suffixes: false`):

| Series                       | Count | Notes                              |
|------------------------------|------:|------------------------------------|
| `http_server_requests`       |    17 | route × status_class; 1648 total   |
| `http_server_duration_bucket`|   272 | latency histogram                  |
| `http_server_errors`         |     3 | by error type                      |
| `anthem_votes`               |     3 | one per vote_category              |
| `anthem_country_votes`       |    30 | 15 countries × {win,loss}          |
| `anthem_sessions_created`    |    15 | by country                         |
| `anthem_matchups_served`     |     2 | wildcard true/false                |
| `anthem_listen_events`       |    15 | by country                         |
| `anthem_listen_ms_bucket`    |    16 | listen-time histogram              |

Sample dashboard query (Golden Signals p95 latency) returned **43.1 ms**.

**Traces in Tempo** — `rootServiceName=anthemworld-game` with span names
`POST /vote`, `GET /matchup`, `POST /listen`, etc. TraceQL search by
`resource.service.name="anthemworld-game"` matched.

**Logs in Loki** — request logs with labels including `route`,
`http_status_code`, `service_name`, **and `trace_id` / `span_id`**, so the
Grafana Loki↔Tempo correlation (derived fields + tracesToLogs) works.

**Grafana** — three datasources provisioned (Prometheus OK, Loki OK; Tempo
returns "Method not implemented" on the health probe only — queries work). Both
dashboards provisioned under the *Anthem World* folder:
- `anthem-golden-signals` — SRE Golden Signals
- `anthem-product-engagement` — Product Engagement

## How to reproduce

```bash
task obs:up                                   # standard ports
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node observability/scripts/generate-telemetry.js 200
# Grafana http://localhost:3000 > Dashboards > Anthem World
```

On a host whose standard ports are busy, override:
`OTLP_HTTP_PORT=4319 PROMETHEUS_PORT=9091 TEMPO_PORT=3201 LOKI_PORT=3101 \
 GRAFANA_PORT=3002 docker compose --profile observability up -d`.

For real API traffic instead of the synthetic generator, run
`observability/scripts/smoke-traffic.sh` with SAM local up.

## Notes / follow-ups

- **Real SAM end-to-end was not run** in this session: the host had two
  LocalStack containers contending for `:4566` (`localstack-localstack-1`, a
  foreign container, currently serves it healthily). `anthemworld-localstack`
  was left in `Created` state by a compose recreate. DynamoDB on `:4566` is
  healthy, so nothing is functionally broken; the synthetic generator exercises
  the identical `shared/telemetry.js` code path that the handlers use, and the
  six handlers are covered by 96 unit tests.
- The OTel Collector contrib image `0.116.0` failed to exec on this host (bad
  layer); pinned to `0.120.0`, which runs cleanly.
- Production remains intentionally unwired (telemetry inactive without an OTLP
  endpoint) per the local-first decision.
