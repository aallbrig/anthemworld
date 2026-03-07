VERSION    ?= 0.1.0
GIT_COMMIT := $(shell git rev-parse HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
PKG        := github.com/anthemworld/cli/cmd
LDFLAGS    := -ldflags "\
	-X $(PKG).version=$(VERSION) \
	-X $(PKG).gitCommit=$(GIT_COMMIT) \
	-X $(PKG).buildDate=$(BUILD_DATE)"

BINARY     := worldanthem
CLI_DIR    := cli/worldanthem
INSTALL_DIR := $(HOME)/bin

.PHONY: build install clean dev game-install game-up game-down game-init game-start game-dev dev-reset

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

# Start SAM local API (requires Docker + LocalStack running)
game-start:
	cd sam/game && \
	sam local start-api --port 3001 \
	  --env-vars env.local.json \
	  --warm-containers LAZY

# Convenience: full local dev setup
game-dev: game-up game-init game-start

# One-command full local dev (LocalStack + SAM + Hugo)
dev:
	bash scripts/dev-local.sh

# Clear all DynamoDB session/vote/listen data from LocalStack and re-seed rankings.
# Use when rate limits accumulate across test runs (e.g. MAX_SESSIONS_PER_IP exhausted).
dev-reset:
	./sam/game/scripts/dev-reset.sh

