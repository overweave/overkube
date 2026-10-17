# One entry point for checking and building. Node runs in containers, so only
# Docker is needed on the development machine.

# Node's image with openssl (dev/node): built here, once — Docker's cache keeps it.
NODE_IMAGE ?= overkube-node:24

# The parent folder is mounted: overweave beside this repository (../overweave) is there for link-overweave.
RUN  = docker run --rm -v "$(abspath $(CURDIR)/..)":/src -w /src/$(notdir $(CURDIR))
NODE = $(RUN) -e npm_config_update_notifier=false -v ok-npmcache:/root/.npm $(NODE_IMAGE)

# overweave's packages, by name (node_modules/@overweave/<name>).
OVERWEAVE = core ui testkit storybook

.PHONY: help image deps check lint format typecheck test coverage dev dev-down dev-logs dev-kubectl dev-token dev-reset dev-seed dev-clean link-overweave unlink-overweave storybook

help:
	@echo "make check      everything CI checks: lint and format, types, tests"
	@echo "make lint / format / typecheck / test / coverage   one of them; format rewrites the files"
	@echo "make dev        the dev stand: KubeSolo, the server, the page (http://localhost:5173)"
	@echo "make dev-down / dev-logs / dev-kubectl ARGS=\"get pods -A\" / dev-reset (forget the cluster)"
	@echo "make dev-seed   the stand filled: cert-manager, then dev/seed (every usual kind, a few of each)"
	@echo "make dev-clean  all the seed made deleted (cert-manager too); the rest of the cluster kept"
	@echo "make storybook  the core's stories (http://localhost:6006): the page, its addons turned off and on"
	@echo "make link-overweave     overweave from its sources beside this repository (../overweave), not the registry's"
	@echo "make unlink-overweave   the registry's again"

# Reinstall only when the lock file or a package.json changed (the image made first, whatever).
deps: node_modules/.package-lock.json
node_modules/.package-lock.json: $(wildcard package-lock.json) package.json $(wildcard packages/*/package.json apps/*/package.json addons/*/package.json) | image
	$(NODE) npm install --no-audit --no-fund

image:
	@docker build -q -t $(NODE_IMAGE) dev/node >/dev/null

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

DEV = docker compose -f dev/compose.yaml $(if $(filter oidc,$(OVERKUBE_AUTH)),--profile oidc)

dev: deps
	$(DEV) up -d --build
	@# Dex runs only for OIDC: started without it, one left from before is stopped.
	$(if $(filter oidc,$(OVERKUBE_AUTH)),,@docker compose -f dev/compose.yaml --profile oidc rm -sf dex >/dev/null 2>&1 || true)
	@echo "the page: http://localhost:$${WEB_PORT:-5173}   the server: http://localhost:$${OVERKUBE_PORT:-8080}/healthz"

# Stopped; the cluster's data kept.
dev-down:
	docker compose -f dev/compose.yaml --profile oidc down

dev-logs:
	$(DEV) logs -f --tail=100

# kubectl against the stand's cluster: make dev-kubectl ARGS="get pods -A"
dev-kubectl:
	$(DEV) exec kube kubectl $(ARGS)

# A token to sign in with (the server started with OVERKUBE_AUTH=token make dev): the seed's admin, viewer or shop-dev,
# for so long (10m at the least: one that ends while the page is open).
SA ?= viewer
DURATION ?= 8h
dev-token:
	@$(DEV) exec -T kube kubectl -n seed-ops create token $(SA) --duration=$(DURATION)

# The seed (dev/seed): cert-manager from its release, then every usual kind, a few of each, on busybox.
# cert-manager's webhook answers a while after its deployment is available (its CA injected): asked
# with a dry run until it does, then the seed applied once.
CERT_MANAGER_VERSION ?= v1.18.2
CERT_MANAGER = https://github.com/cert-manager/cert-manager/releases/download/$(CERT_MANAGER_VERSION)/cert-manager.yaml
KUBECTL = $(DEV) exec -T kube kubectl
WEBHOOK_PROBE = apiVersion: cert-manager.io/v1\nkind: ClusterIssuer\nmetadata: {name: seed-probe}\nspec: {selfSigned: {}}\n

dev-seed:
	$(KUBECTL) apply -f $(CERT_MANAGER) >/dev/null
	$(KUBECTL) -n cert-manager wait --for=condition=Available deployment --all --timeout=300s
	@printf "waiting for cert-manager's webhook"; for i in $$(seq 90); do \
		printf '$(WEBHOOK_PROBE)' | $(KUBECTL) create --dry-run=server -f - >/dev/null 2>&1 && echo && exit 0; \
		printf .; sleep 2; \
	done; echo; echo "cert-manager's webhook did not answer"; exit 1
	for f in dev/seed/*.yaml; do cat $$f; echo ---; done | $(KUBECTL) apply -f -

# All the seed made, by its label (overkube.dev/seed=true): its namespaces, its cluster-wide objects, the
# volumes its claims kept (a retaining class's), then cert-manager.
dev-clean:
	$(KUBECTL) delete namespace -l overkube.dev/seed=true --timeout=300s
	-$(KUBECTL) delete clusterissuers.cert-manager.io -l overkube.dev/seed=true
	$(KUBECTL) delete clusterrolebinding,clusterrole,priorityclass,ingressclass,persistentvolume,storageclass,certificatesigningrequest -l overkube.dev/seed=true
	$(DEV) exec -T kube sh -c "kubectl get pv -o jsonpath='{range .items[*]}{.metadata.name} {.spec.claimRef.namespace}{\"\\n\"}{end}' | awk '\$$2 ~ /^seed-/ {print \$$1}' | xargs -r kubectl delete pv"
	$(KUBECTL) delete --ignore-not-found -f $(CERT_MANAGER)

# The cluster forgotten: its volume deleted, after asking.
dev-reset:
	@printf "Delete the dev cluster's data (its volume)? [y/N] " && read answer && [ "$$answer" = y ]
	$(DEV) down -v

