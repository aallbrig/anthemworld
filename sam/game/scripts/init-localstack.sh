#!/usr/bin/env bash
# init-localstack.sh
# Creates all required DynamoDB tables in LocalStack for local development.
# Run once after `docker compose up -d` to provision the tables.
#
# Usage: ./sam/game/scripts/init-localstack.sh
set -euo pipefail

ENDPOINT="http://localhost:4566"
STAGE="${STAGE:-local}"
REGION="us-east-1"

AWS="aws --endpoint-url=$ENDPOINT --region=$REGION"

echo "==> Waiting for LocalStack to be ready..."
until curl -sf "$ENDPOINT/_localstack/health" | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get('services',{}).get('dynamodb',''); exit(0 if s in ('available','running') else 1)" 2>/dev/null; do
    sleep 2
done
echo "==> LocalStack ready."

# Helper: create a table only if it doesn't exist
create_table() {
    local name="$1"
    shift
    if $AWS dynamodb describe-table --table-name "$name" &>/dev/null; then
        echo "    $name already exists — skipping"
    else
        $AWS dynamodb create-table --table-name "$name" "$@"
        echo "    Created $name"
    fi
}

echo ""
echo "==> Creating DynamoDB tables (stage=$STAGE)..."

# anthem-rankings-<stage>
create_table "anthem-rankings-$STAGE" \
  --attribute-definitions \
    AttributeName=country_id,AttributeType=S \
  --key-schema \
    AttributeName=country_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# anthem-votes-<stage>
create_table "anthem-votes-$STAGE" \
  --attribute-definitions \
    AttributeName=vote_id,AttributeType=S \
    AttributeName=session_id,AttributeType=S \
    AttributeName=voted_at,AttributeType=S \
  --key-schema \
    AttributeName=vote_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "session-votes-index",
      "KeySchema": [
        {"AttributeName":"session_id","KeyType":"HASH"},
        {"AttributeName":"voted_at","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

# anthem-sessions-<stage>
create_table "anthem-sessions-$STAGE" \
  --attribute-definitions \
    AttributeName=session_id,AttributeType=S \
    AttributeName=ip_hash,AttributeType=S \
    AttributeName=created_date,AttributeType=S \
  --key-schema \
    AttributeName=session_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "ip-sessions-index",
      "KeySchema": [
        {"AttributeName":"ip_hash","KeyType":"HASH"},
        {"AttributeName":"created_date","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

# anthem-listen-history-<stage>
create_table "anthem-listen-history-$STAGE" \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo ""
echo "==> All tables ready. Verifying..."
$AWS dynamodb list-tables --output table

echo ""
echo "==> Done! LocalStack DynamoDB is ready for local development."
echo "    Tables have '-$STAGE' suffix (e.g. anthem-rankings-$STAGE)."
echo "    Endpoint: $ENDPOINT"
