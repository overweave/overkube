# One entry point for checking and building. Node runs in containers, so only
# Docker is needed on the development machine.

NODE_IMAGE ?= node:24-alpine

# overweave's packages come from GitHub's npm registry (.npmrc): its token is gh's, or the environment's
# (CI). Passed to the container by name: never on a command line.
export GITHUB_TOKEN ?= $(shell gh auth token 2>/dev/null)

# The parent folder is mounted: overweave beside this repository (../overweave) is there for link-overweave.
RUN  = docker run --rm -v "$(abspath $(CURDIR)/..)":/src -w /src/$(notdir $(CURDIR))
NODE = $(RUN) -e npm_config_update_notifier=false -e GITHUB_TOKEN -v ok-npmcache:/root/.npm $(NODE_IMAGE)

# overweave's packages, by name (node_modules/@overweave/<name>).
OVERWEAVE = core ui testkit storybook

.PHONY: help deps check lint format typecheck test coverage dev dev-down dev-logs dev-kubectl dev-reset link-overweave unlink-overweave storybook

help:
	@echo "make check      everything CI checks: lint and format, types, tests"
	@echo "make lint / format / typecheck / test / coverage   one of them; format rewrites the files"
	@echo "make dev        the dev stand: KubeSolo, the server, the page (http://localhost:5173)"
	@echo "make dev-down / dev-logs / dev-kubectl ARGS=\"get pods -A\" / dev-reset (forget the cluster)"
	@echo "make storybook  the core's stories (http://localhost:6006): the page, its addons turned off and on"
	@echo "make link-overweave     overweave from its sources beside this repository (../overweave), not the registry's"
	@echo "make unlink-overweave   the registry's again"

# Reinstall only when the lock file or a package.json changed.
deps: node_modules/.package-lock.json
node_modules/.package-lock.json: $(wildcard package-lock.json) package.json $(wildcard packages/*/package.json apps/*/package.json addons/*/package.json)
	$(NODE) npm install --no-audit --no-fund

check: deps
	$(NODE) sh -c 'npm run lint && npm run typecheck && npm test'

lint: deps
	$(NODE) npm run lint

format: deps
	$(NODE) npm run format

typecheck: deps
	$(NODE) npm run typecheck

test: deps
	$(NODE) npm test

coverage: deps
	$(NODE) npm run coverage

# The core's stories in Storybook, on this machine only (127.0.0.1:6006), reloaded as they change; Ctrl+C stops it.
# The workspace's packages from their sources, as the page reads them.
STORYBOOK_PORT ?= 6006
storybook: deps
	$(RUN) -it -p 127.0.0.1:$(STORYBOOK_PORT):6006 -e npm_config_update_notifier=false -e NODE_OPTIONS=--conditions=overkube-source -v ok-npmcache:/root/.npm $(NODE_IMAGE) \
		npx storybook dev -c addons/core/.storybook -p 6006 --host 0.0.0.0 --no-open --ci

# overweave as it is worked on: its packages linked to ../overweave's sources (read through the
# overweave-source condition), so a change there is seen here at once — the dev stand's reload too.
# Undone by unlink-overweave, or by any install (a package.json changed).
link-overweave: deps
	@test -d ../overweave/packages || { echo "no ../overweave beside this repository"; exit 1; }
	$(NODE) sh -c 'for p in $(OVERWEAVE); do rm -rf node_modules/@overweave/$$p && ln -s ../../../overweave/packages/$$p node_modules/@overweave/$$p; done'

unlink-overweave:
	$(NODE) sh -c 'rm -rf node_modules/@overweave && npm install --no-audit --no-fund'

# ── The dev stand (dev/compose.yaml) ─────────────────────────────────────────

DEV = docker compose -f dev/compose.yaml

dev: deps
	$(DEV) up -d --build
	@echo "the page: http://localhost:$${WEB_PORT:-5173}   the server: http://localhost:$${OVERKUBE_PORT:-8080}/healthz"

# Stopped; the cluster's data kept.
dev-down:
	$(DEV) down

dev-logs:
	$(DEV) logs -f --tail=100

# kubectl against the stand's cluster: make dev-kubectl ARGS="get pods -A"
dev-kubectl:
	$(DEV) exec kube kubectl $(ARGS)

# The cluster forgotten: its volume deleted, after asking.
dev-reset:
	@printf "Delete the dev cluster's data (its volume)? [y/N] " && read answer && [ "$$answer" = y ]
	$(DEV) down -v

