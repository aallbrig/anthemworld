VERSION    ?= 0.1.0
GIT_COMMIT := $(shell git rev-parse HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
PKG        := github.com/anthemworld/cli/cmd
LDFLAGS    := -ldflags "\
	-X $(PKG).version=$(VERSION) \
	-X $(PKG).gitCommit=$(GIT_COMMIT) \
	-X $(PKG).buildDate=$(BUILD_DATE)"

BINARY     := anthemworld
CLI_DIR    := cli/anthemworld
INSTALL_DIR := $(HOME)/bin

.PHONY: build install clean dev game-install game-up game-down game-init game-start game-dev dev-reset i18n-check

build:
	go build $(LDFLAGS) -o $(BINARY) ./$(CLI_DIR)

install: build
	@mkdir -p $(INSTALL_DIR)
	cp $(BINARY) $(INSTALL_DIR)/$(BINARY)
	@echo "Installed to $(INSTALL_DIR)/$(BINARY)"

clean:
	rm -f $(BINARY)

# ── Game backend (LocalStack + SAM) ───────────────────────────────────────────

game-install:
	cd sam/game/functions && npm install

# Start LocalStack container
game-up:
	docker compose up -d
	@echo "LocalStack starting at http://localhost:4566"

# Stop LocalStack container
game-down:
	docker compose down

# Create DynamoDB tables in LocalStack (run once after game-up)
game-init:
	./sam/game/scripts/init-localstack.sh

# Start SAM local API (requires Docker + LocalStack already running)
game-start:
	cd sam/game && \
	sam local start-api --port 3001 \
	  --env-vars env.local.json \
	  --warm-containers LAZY \
	  --skip-pull-image \
	  --docker-network anthemworld_default

# Convenience: full local dev setup (LocalStack + SAM, no Hugo)
game-dev: game-up game-init game-start

# One-command full local dev (LocalStack + SAM + Hugo).
# Equivalent to running ./scripts/dev-local.sh directly — the Makefile target
# is just a convenient entry point.
dev:
	bash scripts/dev-local.sh

# Restart just the SAM local API to pick up Lambda code changes.
# Use this instead of a full 'make dev' restart when you edit a Lambda function.
sam-restart:
	@echo "Restarting SAM local API on port 3001..."
	@lsof -ti :3001 | xargs -r kill 2>/dev/null || true
	@sleep 1
	cd sam/game && \
	sam local start-api --port 3001 \
	  --env-vars env.local.json \
	  --warm-containers LAZY \
	  --skip-pull-image \
	  --docker-network anthemworld_default

# Clear all DynamoDB session/vote/listen data from LocalStack and re-seed rankings.
# Use when rate limits accumulate across test runs (e.g. MAX_SESSIONS_PER_IP exhausted).
dev-reset:
	./sam/game/scripts/dev-reset.sh

# ── i18n ──────────────────────────────────────────────────────────────────────

# Check that all i18n locale files have the same keys as en.toml.
i18n-check:
	./scripts/i18n-check.sh

