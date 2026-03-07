#!/usr/bin/env bash
# dev-local.sh — spin up the full Anthem World local development stack
#
# Starts: LocalStack (DynamoDB) → DynamoDB tables → SAM local API (port 3001) → Hugo dev server (port 1313)
# Stops everything cleanly on Ctrl+C.
#
# Usage:
#   bash scripts/dev-local.sh
#   make dev          (same thing via Makefile)
#
# Prerequisites: docker, aws CLI, sam CLI, hugo, node

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAM_DIR="$REPO_ROOT/sam/game"
HUGO_DIR="$REPO_ROOT/hugo/site"
SAM_PORT=3001
HUGO_PORT=1313

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[dev]${NC} $*"; }
success() { echo -e "${GREEN}[dev]${NC} $*"; }
warn()    { echo -e "${YELLOW}[dev]${NC} $*"; }
die()     { echo -e "${RED}[dev] ERROR:${NC} $*"; exit 1; }

SAM_PID=""
HUGO_PID=""

cleanup() {
  echo ""
  info "Shutting down..."
  [ -n "$SAM_PID" ]  && kill "$SAM_PID"  2>/dev/null && info "SAM stopped"
  [ -n "$HUGO_PID" ] && kill "$HUGO_PID" 2>/dev/null && info "Hugo stopped"
  info "LocalStack left running (use 'docker compose down' to stop it)"
  exit 0
}
trap cleanup INT TERM

# ── 1. LocalStack ────────────────────────────────────────────────────────────
info "Starting LocalStack..."
cd "$REPO_ROOT"
docker compose up -d 2>&1 | grep -v "^WARN"

info "Waiting for LocalStack to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:4566/_localstack/health | grep -q '"dynamodb"'; then
    success "LocalStack ready"
    break
  fi
  [ "$i" -eq 30 ] && die "LocalStack did not become healthy in time"
  sleep 2
done

# ── 2. DynamoDB tables ───────────────────────────────────────────────────────
info "Ensuring DynamoDB tables exist..."
bash "$SAM_DIR/scripts/init-localstack.sh" 2>&1 | grep -E "Creating|already|Done|Error" || true

# ── 3. Seed rankings if empty ────────────────────────────────────────────────
COUNT=$(AWS_PAGER="" aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  dynamodb scan --table-name anthem-rankings-local --select COUNT \
  --output text --query Count 2>/dev/null || echo 0)
if [ "$COUNT" -lt 10 ]; then
  info "Seeding ELO rankings (${COUNT} records found)..."
  bash "$SAM_DIR/scripts/seed-rankings.sh" 2>&1 | tail -3
  success "Rankings seeded"
else
  success "Rankings already seeded ($COUNT countries)"
fi

# ── 4. SAM local API ─────────────────────────────────────────────────────────
info "Starting SAM local API on port $SAM_PORT..."
cd "$SAM_DIR"
sam local start-api \
  --port "$SAM_PORT" \
  --warm-containers LAZY \
  --env-vars env.local.json \
  2>&1 | grep -v "^20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9] " &
SAM_PID=$!

# Wait for SAM to be ready
info "Waiting for SAM to be ready..."
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$SAM_PORT/leaderboard" >/dev/null 2>&1; then
    success "SAM ready at http://localhost:$SAM_PORT"
    break
  fi
  sleep 2
done

# ── 5. Hugo dev server ───────────────────────────────────────────────────────
info "Starting Hugo dev server on port $HUGO_PORT..."
cd "$HUGO_DIR"
hugo server -D --port "$HUGO_PORT" --bind 127.0.0.1 2>&1 &
HUGO_PID=$!
sleep 3

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Anthem World local dev stack is ready!    ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌍 Website:     ${CYAN}http://localhost:$HUGO_PORT${NC}"
echo -e "  🗺️  Map:         ${CYAN}http://localhost:$HUGO_PORT/map/${NC}"
echo -e "  📊 Countries:   ${CYAN}http://localhost:$HUGO_PORT/countries/${NC}"
echo -e "  🎵 Game:        ${CYAN}http://localhost:$HUGO_PORT/game/${NC}"
echo -e "  🏆 Leaderboard: ${CYAN}http://localhost:$HUGO_PORT/game/leaderboard/${NC}"
echo -e "  ⚡ Game API:    ${CYAN}http://localhost:$SAM_PORT${NC}"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

# Wait for child processes
wait $HUGO_PID
