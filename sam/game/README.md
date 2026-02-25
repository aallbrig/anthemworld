# AWS SAM Game Service

Lambda backend for the Anthem World ELO ranking game.

## Structure

```
sam/game/
├── template.yaml               # SAM CloudFormation template
├── functions/                  # All Lambda code (single CodeUri bundle)
│   ├── session/index.js        # POST /session
│   ├── matchup/index.js        # GET  /matchup
│   ├── vote/index.js           # POST /vote
│   ├── leaderboard/index.js    # GET  /leaderboard
│   ├── shared/
│   │   ├── db.js               # DynamoDB Document Client
│   │   ├── elo.js              # ELO rating helpers
│   │   └── response.js         # HTTP response builders
│   └── package.json
├── scripts/
│   └── init-localstack.sh      # Create DynamoDB tables in LocalStack
└── README.md
```

## Local Development (LocalStack + SAM)

### Prerequisites

```bash
# AWS SAM CLI
pip install aws-sam-cli       # or brew install aws-sam-cli

# LocalStack via Docker
docker --version              # Docker must be running
```

### First-time setup

```bash
# 1. Install Node dependencies
make game-install

# 2. Start LocalStack (DynamoDB in Docker)
make game-up                  # starts localstack/localstack:3 on :4566

# 3. Create DynamoDB tables
make game-init                # runs scripts/init-localstack.sh

# 4. Start SAM local API
make game-start               # API available at http://localhost:3001
```

Or run all three in one command:
```bash
make game-dev
```

### Quick manual test

```bash
# Create a session
curl -s -X POST http://localhost:3001/session | jq

# Get a matchup (use session_id from above)
curl -s "http://localhost:3001/matchup?session_id=<session_id>" | jq

# Submit a vote
curl -s -X POST http://localhost:3001/vote \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "<session_id>",
    "matchup_id": "<matchup_id>",
    "winner_id": "<country_id>",
    "loser_id":  "<country_id>",
    "listen_a_ms": 5000,
    "listen_b_ms": 5000
  }' | jq

# Leaderboard
curl -s "http://localhost:3001/leaderboard?limit=10" | jq
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/session` | Create anonymous session (rate-limited: 5/IP/day) |
| GET  | `/matchup?session_id={id}` | Get next ELO-matched anthem pair |
| POST | `/vote` | Submit vote with listen durations |
| GET  | `/leaderboard?limit={n}` | Paginated ELO leaderboard |

See `docs/game.md` for full API contract, error codes, and rate limiting rules.

## Environment Variables (set in template.yaml Globals)

| Variable | Default | Description |
|----------|---------|-------------|
| `RANKINGS_TABLE` | (from CF) | DynamoDB rankings table name |
| `VOTES_TABLE` | (from CF) | DynamoDB votes table name |
| `SESSIONS_TABLE` | (from CF) | DynamoDB sessions table name |
| `LISTEN_TABLE` | (from CF) | DynamoDB listen history table name |
| `MIN_LISTEN_MS` | `3000` | Minimum listen time in ms before voting |
| `MAX_VOTES_PER_SESSION` | `100` | Vote cap per session per day |
| `MAX_SESSIONS_PER_IP` | `5` | Session cap per IP per day |
| `LOCAL_DYNAMODB_ENDPOINT` | _(unset)_ | Set to `http://localhost:4566` for LocalStack |

## Deployment

```bash
sam build
sam deploy --guided --parameter-overrides Stage=dev
```

