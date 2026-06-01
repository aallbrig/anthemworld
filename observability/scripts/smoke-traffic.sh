#!/usr/bin/env bash
# Drive REAL traffic through the local game API so the instrumented Lambdas emit
# live telemetry to the collector. Use this once the full local stack is up:
#
#   task obs:up        # observability stack
#   task bootstrap     # localstack + tables + seed + sam build
#   task sam:local     # API on :3005 (Lambdas push OTLP to otel-collector:4318)
#   observability/scripts/smoke-traffic.sh [flows=30]
#
# Then watch Grafana > Dashboards > Anthem World populate.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3005}"
FLOWS="${1:-30}"

jqf() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(eval('d'+process.argv[1])??''))" "$1"; }

echo "Driving ~${FLOWS} game flows against ${BASE_URL}"
for ((i = 1; i <= FLOWS; i++)); do
  SESSION_JSON=$(curl -s -X POST "${BASE_URL}/session" -H 'Content-Type: application/json' -d '{}' || true)
  SID=$(printf '%s' "$SESSION_JSON" | jqf ".session_id" 2>/dev/null || true)
  [ -z "${SID:-}" ] && { echo "  [$i] no session (is SAM up?)"; sleep 1; continue; }

  MATCHUP_JSON=$(curl -s "${BASE_URL}/matchup" -H "X-Session-Id: ${SID}" || true)
  MID=$(printf '%s' "$MATCHUP_JSON" | jqf ".matchup_id" 2>/dev/null || true)
  CA=$(printf '%s' "$MATCHUP_JSON" | jqf ".country_a.country_id" 2>/dev/null || true)
  CB=$(printf '%s' "$MATCHUP_JSON" | jqf ".country_b.country_id" 2>/dev/null || true)
  [ -z "${MID:-}" ] && { echo "  [$i] no matchup"; continue; }

  # Report listening on both anthems
  curl -s -X POST "${BASE_URL}/listen" -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"${SID}\",\"events\":[{\"country_id\":\"${CA}\",\"total_listen_ms\":12000,\"max_position_ms\":12000},{\"country_id\":\"${CB}\",\"total_listen_ms\":9000,\"max_position_ms\":9000}]}" >/dev/null || true

  # Vote: randomly pick a winner
  if [ $((RANDOM % 2)) -eq 0 ]; then W="$CA"; L="$CB"; else W="$CB"; L="$CA"; fi
  curl -s -X POST "${BASE_URL}/vote" -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"${SID}\",\"matchup_id\":\"${MID}\",\"winner_id\":\"${W}\",\"loser_id\":\"${L}\",\"listen_a_ms\":12000,\"listen_b_ms\":9000}" >/dev/null || true

  # Occasionally read the leaderboard / weekly
  [ $((RANDOM % 3)) -eq 0 ] && curl -s "${BASE_URL}/leaderboard?limit=20" >/dev/null || true
  [ $((RANDOM % 5)) -eq 0 ] && curl -s "${BASE_URL}/weekly" >/dev/null || true

  printf '  [%d/%d] %s  %s vs %s\n' "$i" "$FLOWS" "${SID:0:8}" "$CA" "$CB"
  sleep 0.3
done
echo "Done. Open Grafana and watch the dashboards."
