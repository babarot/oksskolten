.PHONY: help ci test test-server test-client typecheck lint dev dev-down dev-scratch prod prod-down

COMPOSE ?= docker compose

# Embed build metadata into the server image via Docker build args.
# The server exposes these at GET /api/health for version identification.
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
GIT_TAG    := $(shell git describe --tags --exact-match 2>/dev/null || echo unknown)
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

export GIT_COMMIT GIT_TAG BUILD_DATE

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# CI
# ---------------------------------------------------------------------------

ci: typecheck lint test ## Run all CI checks (typecheck + lint + test)

test: test-server test-client ## Run all tests

test-server: ## Run server tests
	npx vitest run --project server

test-client: ## Run client tests
	npx vitest run --project client

typecheck: ## Run TypeScript type checking
	npm run typecheck

lint: ## Run ESLint
	npm run lint

# ---------------------------------------------------------------------------
# Dev  — project name: oksskolten (default), DB: ./data
# ---------------------------------------------------------------------------

dev: ## Start dev environment
	$(COMPOSE) up

dev-down: ## Stop dev environment
	$(COMPOSE) down

dev-scratch: ## Rebuild dev from scratch (removes volumes)
	$(COMPOSE) down -v
	$(COMPOSE) up --build

# ---------------------------------------------------------------------------
# Prod — project name: oksskolten-prod, DB: ./data-prod
#
# Dev and prod use separate Docker project names (-p) so that
# "make dev-down" never tears down prod containers, and vice versa.
# DB is also separated (DATA_DIR) to avoid concurrent SQLite writes.
# All external access goes through Cloudflare Tunnel (no host ports).
# ---------------------------------------------------------------------------

PROD_COMPOSE = DATA_DIR=./data-prod $(COMPOSE) -p oksskolten-prod -f compose.yaml -f compose.prod.yaml

prod: ## Start production environment
	$(PROD_COMPOSE) up -d --build

prod-down: ## Stop production environment
	$(PROD_COMPOSE) down

prod-logs: ## Show production logs
	$(PROD_COMPOSE) logs -f --tail=50

# Build the new image first (old container keeps running), then swap.
# Downtime is only the few seconds between stop and start of the server.
prod-restart: ## Rebuild and restart production server (minimal downtime)
	$(PROD_COMPOSE) build server
	$(PROD_COMPOSE) up -d --no-deps server
