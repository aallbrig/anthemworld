#!/usr/bin/env bash
# seed-rankings.sh
# Seeds anthem-rankings DynamoDB table from anthems.json.
# Requires: aws CLI, LocalStack running, anthems.json built.
#
# Usage: ./sam/game/scripts/seed-rankings.sh [anthems.json path]
set -euo pipefail

ENDPOINT="http://localhost:4566"
STAGE="${STAGE:-local}"
REGION="us-east-1"
TABLE="anthem-rankings-$STAGE"
ANTHEMS="${1:-hugo/site/static/data/anthems.json}"

AWS="aws --endpoint-url=$ENDPOINT --region=$REGION"

if [[ ! -f "$ANTHEMS" ]]; then
  echo "Error: anthems.json not found at $ANTHEMS"
  echo "Run: worldanthem data format --output hugo/site/static/data"
  exit 1
fi

echo "==> Seeding $TABLE from $ANTHEMS..."

# Parse JSON with python3 and batch-write items
python3 - "$ANTHEMS" "$TABLE" "$ENDPOINT" "$REGION" << 'PYEOF'
import json, sys, subprocess

anthems_path, table, endpoint, region = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(anthems_path) as f:
    data = json.load(f)

items = []
for iso3, country in data.items():
    item = {
        "country_id": {"S": iso3},
        "name":       {"S": country.get("name") or iso3},
        "elo_score":  {"N": "1500"},
        "wins":       {"N": "0"},
        "losses":     {"N": "0"},
    }
    if country.get("flag_url"):
        item["flag_url"] = {"S": country["flag_url"]}
    anthem = country.get("anthem") or {}
    if anthem.get("name"):
        item["anthem_name"] = {"S": anthem["name"]}
    audio = country.get("audio_files") or []
    if audio:
        item["audio_url"] = {"S": audio[0]["url"]}
    items.append({"PutRequest": {"Item": item}})

# DynamoDB batch-write allows max 25 items per request
for i in range(0, len(items), 25):
    batch = items[i:i+25]
    payload = json.dumps({table: batch})
    result = subprocess.run(
        ["aws", "--endpoint-url", endpoint, "--region", region,
         "dynamodb", "batch-write-item", "--request-items", payload],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  Error at batch {i//25}: {result.stderr}", file=sys.stderr)
    else:
        print(f"  Seeded items {i+1}–{min(i+25, len(items))}")

print(f"Done. {len(items)} countries seeded into {table}.")
PYEOF

echo "==> Seeding complete."
