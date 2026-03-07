# 🚀 Anthem World - Quick Start Guide

Get up and running with Anthem World in 5 minutes!

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Hugo (extended) | Static site generator | `sudo apt install hugo` |
| Go 1.21+ | CLI tool | `sudo apt install golang` |
| Node.js 18+ | Playwright tests + SAM lambdas | `sudo apt install nodejs npm` |
| Docker + Compose | LocalStack (DynamoDB emulation) | [docker.com](https://docs.docker.com/get-docker/) |
| AWS SAM CLI | Local Lambda execution | [aws.amazon.com/serverless/sam](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| AWS CLI | DynamoDB table creation (local only) | `sudo apt install awscli` |

> **No real AWS account required.** All backend infrastructure runs locally via LocalStack.

## 1. Full Local Stack (recommended)

One command starts everything — LocalStack, DynamoDB tables, SAM API server, and Hugo:

```bash
make dev
```

Then open:
- **http://localhost:1313** — the website
- **http://localhost:3001** — game API (SAM / Lambda functions)

**What you'll see:**
- ✅ Interactive map — click any country for flag, capital, anthem name, composer, history, and audio player
- ✅ Countries table — 239 rows, searchable/sortable, inline audio players
- ✅ Game page — ELO anthem battle (listen 3s to unlock voting)
- ✅ Homepage with project overview

## 2. Try the CLI

```bash
# Build the CLI
go build -o worldanthem ./cli/worldanthem

# Check status of all data sources
./worldanthem data sources

# Download all data (REST Countries, Wikidata, Wikimedia Commons, Factbook)
./worldanthem data download

# Export JSON files for the website
./worldanthem data format --output hugo/site/static/data

# Show version + git hash
./worldanthem version
```

**Database location:** `~/.local/share/anthemworld/data.db`

> `data download` is idempotent — re-running it safely updates existing records.  
> Rate limiting from Wikimedia Commons may cause 429s on first run; re-run to fill gaps.

## 3. Run the Tests

### Playwright (end-to-end)
```bash
cd tests/playwright
npm install        # first time only
npm test           # all 32 tests
npm test -- --headed            # visual/debug mode
npm test -- map.features.spec   # single file
```

Tests automatically start/stop a Hugo dev server. All 32 tests should pass.

### CLI unit tests
```bash
go test ./cli/worldanthem/... -v
```

### Game API unit tests
```bash
cd sam/game && npm test
```

## Project Structure at a Glance

```
anthemworld/
├── worldanthem             # CLI binary (built with `go build`)
├── hugo/site/              # Website (Hugo)
│   ├── content/            # Pages (Markdown)
│   ├── layouts/            # Templates (HTML)
│   └── static/             # Assets (JS, CSS, data JSON)
│       └── data/           # anthems.json, countries.json (generated)
├── cli/worldanthem/        # CLI source (Go)
│   └── cmd/                # Commands (data, version, status…)
├── sam/game/               # Game backend (AWS SAM / Lambda)
│   ├── functions/          # session, matchup, vote, leaderboard
│   ├── env.local.json      # LocalStack overrides (never deploy this)
│   └── template.yaml       # SAM CloudFormation template
├── scripts/
│   └── dev-local.sh        # Full local stack spinup
├── tests/playwright/       # End-to-end browser tests
├── data/schema/            # SQLite schema files
└── docs/                   # Architecture docs, game rules, research
```

## Key Files

- **README.md** — Project overview
- **CONTRIBUTING.md** — Development guide
- **TODO.md** — Feature roadmap
- **docs/research.md** — Data sources & architecture decisions
- **docs/game.md** — Game rules, rate limiting, ELO design
- **scripts/dev-local.sh** — One-command local stack spinup

## Common Commands

```bash
# === Full local stack ===
make dev                          # Start LocalStack + SAM + Hugo

# === Website only (no game) ===
hugo server -s hugo/site -D       # Hugo dev server → http://localhost:1313

# === CLI ===
go build -o worldanthem ./cli/worldanthem
./worldanthem data sources        # Check data source health
./worldanthem data download       # Download all data (idempotent)
./worldanthem data format --output hugo/site/static/data
./worldanthem version             # Show version + git hash

# === Tests ===
cd tests/playwright && npm test   # 32 Playwright tests (auto-starts Hugo)
go test ./cli/worldanthem/...     # CLI unit tests
cd sam/game && npm test           # Game API unit tests (10 tests)
```

## Troubleshooting

**`make dev` fails at LocalStack step?**
- Check Docker is running: `docker ps`
- LocalStack health: `curl http://localhost:4566/_localstack/health`
- Restart: `docker compose down && docker compose up -d`

**Game page shows no matchup / "Failed to load game"?**
- SAM must be running: check `make dev` output or run `make game-dev` separately
- Verify API: `curl -X POST http://localhost:3001/session`
- DynamoDB region mismatch: tables are always created in `us-east-1` (LocalStack scoped by region)

**Map popups show no anthem data?**
- Ensure `hugo/site/static/data/anthems.json` exists: `ls -lh hugo/site/static/data/`
- If missing: `./worldanthem data format --output hugo/site/static/data`

**Countries table shows 0 rows?**
- Same — requires `hugo/site/static/data/countries.json`

**Playwright tests fail with timeout?**
- First run may be slow (cold browser launch, large data files)
- Retry: `npm test` — budgets are 5s per page

**CLI build fails?**
- Ensure Go 1.21+: `go version`
- From repo root: `go work sync`

**Database issues?**
- Location: `~/.local/share/anthemworld/data.db`
- Reset: `rm ~/.local/share/anthemworld/data.db` then `./worldanthem data download`

## ⚠️ AWS Deployment Notes

**Nothing has been deployed to real AWS yet.** The SAM backend runs 100% locally via LocalStack.

When ready to deploy:
1. Review `sam/game/template.yaml` — resource names, IAM roles, table billing mode
2. Never commit `sam/game/env.local.json` to a deploy pipeline (it contains local overrides)
3. Run `sam deploy --guided` from `sam/game/` to create `samconfig.toml`
4. Set real environment variables via SAM parameter overrides, not `env.local.json`

## What's Working

✅ Interactive map — click any country → anthem popup with audio  
✅ Countries table — 239 rows, search/sort/filter, inline audio  
✅ Game page — ELO anthem battle, session + matchup + vote flow  
✅ Game API — 4 Lambda functions (session, matchup, vote, leaderboard) on LocalStack  
✅ CLI — data download, format/export, version, status  
✅ 32/32 Playwright tests passing  
✅ `make dev` — one-command full stack  

## What's Next

⏳ Game API integration tests (against live LocalStack)  
⏳ Playwright tests for game page UI flows  
⏳ AWS deployment (SAM deploy to real account)  
⏳ CI/CD pipeline  

---

**Status:** Full local stack working ✅  
**AWS deployed:** No — LocalStack only  

