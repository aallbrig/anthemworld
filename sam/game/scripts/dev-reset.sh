#!/usr/bin/env bash
# dev-reset.sh
# Clears all transient DynamoDB tables (sessions, votes, listen history) from
# LocalStack and re-seeds the rankings table.
#
# Use this when test runs have exhausted the per-IP session limit or when you
# want a clean slate without restarting LocalStack.
#
# Usage: make dev-reset   (or ./sam/game/scripts/dev-reset.sh directly)
set -euo pipefail

ENDPOINT="http://localhost:4566"
AWS="aws --endpoint-url=$ENDPOINT --region us-east-1 --no-paginate"

SESSIONS_TABLE="anthem-sessions-local"
VOTES_TABLE="anthem-votes-local"
LISTEN_TABLE="anthem-listen-history-local"

echo "==> Clearing transient DynamoDB tables..."

# Scan table, extract key values, delete in parallel via xargs
clear_table() {
  local TABLE="$1"
  local KEY_FIELD="$2"

  echo "  Clearing $TABLE..."
  local COUNT
  COUNT=$($AWS dynamodb scan \
    --table-name "$TABLE" \
    --projection-expression "$KEY_FIELD" \
    --output json | \
    python3 -c "
import sys, json, subprocess, os
data = json.load(sys.stdin)
items = data.get('Items', [])
endpoint = os.environ.get('ENDPOINT', 'http://localhost:4566')
aws_base = ['aws', '--endpoint-url', endpoint, '--region', 'us-east-1', '--no-paginate', 'dynamodb', 'delete-item', '--table-name', '$TABLE', '--key']
count = 0
for item in items:
    val = list(item.values())[0]
    typ, v = list(val.items())[0]
    key = '{\"$KEY_FIELD\": {\"' + typ + '\": \"' + v + '\"}}'
    subprocess.run(aws_base + [key], capture_output=True, check=True)
    count += 1
print(count)
")
  echo "  Deleted $COUNT items from $TABLE"
}

ENDPOINT="$ENDPOINT" clear_table "$SESSIONS_TABLE" "session_id"
ENDPOINT="$ENDPOINT" clear_table "$VOTES_TABLE"    "vote_id"
ENDPOINT="$ENDPOINT" clear_table "$LISTEN_TABLE"   "pk"

echo ""
echo "==> Re-seeding rankings..."
"$(dirname "$0")/seed-rankings.sh"

echo ""
echo "✅  dev-reset complete — LocalStack is clean and rankings are re-seeded."
