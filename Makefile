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
	@echo "make dev-seed   the stand filled: cert-manager, trivy-operator, Flux, then dev/seed (every usual kind, a few of each; metrics-server, VictoriaMetrics)"
	@echo "make dev-clean  all the seed made deleted (cert-manager too); the rest of the cluster kept"
	@echo "make storybook  the addons' stories and the kit's (http://localhost:6006): the page, its addons turned off and on"
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

# The seed (dev/seed): cert-manager and trivy-operator from their releases (its scans: three at once, the
# stand being one node; no Java database, near a gigabyte, none of the seed's images has a jar), then every usual kind, a few of each, on busybox; the certificates
# it needs made by hand, made anew (dev/seed/tls.sh); helm releases, made by helm itself (dev/seed/90-helm.yaml);
# Flux from its release, delivering from a git server in the cluster (dev/seed/95-flux.yaml, its keys dev/seed/git.sh).
# cert-manager's webhook answers a while after its deployment is available (its CA injected): asked
# with a dry run until it does, then the seed applied once.
CERT_MANAGER_VERSION ?= v1.18.2
CERT_MANAGER = https://github.com/cert-manager/cert-manager/releases/download/$(CERT_MANAGER_VERSION)/cert-manager.yaml
TRIVY_OPERATOR_VERSION ?= v0.35.0
TRIVY_OPERATOR = https://raw.githubusercontent.com/aquasecurity/trivy-operator/$(TRIVY_OPERATOR_VERSION)/deploy/static/trivy-operator.yaml
FLUX_VERSION ?= v2.9.6
FLUX = https://github.com/fluxcd/flux2/releases/download/$(FLUX_VERSION)/install.yaml
KUBECTL = $(DEV) exec -T kube kubectl
WEBHOOK_PROBE = apiVersion: cert-manager.io/v1\nkind: ClusterIssuer\nmetadata: {name: seed-probe}\nspec: {selfSigned: {}}\n

dev-seed:
	$(KUBECTL) apply -f $(CERT_MANAGER) >/dev/null
	$(KUBECTL) -n cert-manager wait --for=condition=Available deployment --all --timeout=300s
	@printf "waiting for cert-manager's webhook"; for i in $$(seq 90); do \
		printf '$(WEBHOOK_PROBE)' | $(KUBECTL) create --dry-run=server -f - >/dev/null 2>&1 && echo && exit 0; \
		printf .; sleep 2; \
	done; echo; echo "cert-manager's webhook did not answer"; exit 1
	$(KUBECTL) apply --server-side --force-conflicts -f $(TRIVY_OPERATOR) >/dev/null
	$(KUBECTL) -n trivy-system patch configmap trivy-operator-config --type merge -p '{"data":{"OPERATOR_CONCURRENT_SCAN_JOBS_LIMIT":"3","OPERATOR_SCAN_JOB_TIMEOUT":"10m"}}'
	$(KUBECTL) -n trivy-system patch configmap trivy-operator-trivy-config --type merge -p '{"data":{"trivy.skipJavaDBUpdate":"true","trivy.resources.limits.memory":"1Gi"}}'
	$(KUBECTL) -n trivy-system rollout restart deployment trivy-operator
	$(KUBECTL) apply --server-side --force-conflicts -f $(FLUX) >/dev/null
	$(KUBECTL) -n flux-system wait --for=condition=Available deployment --all --timeout=300s
	@# helm's Job made anew (a Job's spec is not changed once made): it runs helm again.
	$(KUBECTL) -n seed-helm delete job helm-seed --ignore-not-found
	for f in dev/seed/*.yaml; do cat $$f; echo ---; done | $(KUBECTL) apply -f -
	@# The chart helm installs (dev/seed/charts), in a ConfigMap its Job reads (tar'd in the node image: no host's metadata in it).
	$(RUN) $(NODE_IMAGE) tar -C dev/seed/charts -cf - hello | $(KUBECTL) -n seed-helm create configmap helm-charts --from-file=charts.tar=/dev/stdin --dry-run=client -o yaml | $(KUBECTL) apply -f -
	@# The git server's repository (dev/seed/git, and the chart as charts/hello), its keys and Flux's made anew (ssh-keygen,
	@# in the node image: none kept in the repository); the server restarted to take them.
	$(RUN) $(NODE_IMAGE) sh -c 'r=$$(mktemp -d) && cp -R dev/seed/git/. $$r && mkdir $$r/charts && cp -R dev/seed/charts/hello $$r/charts && tar -C $$r -cf - .' \
		| $(KUBECTL) -n seed-flux create configmap git-repo --from-file=repo.tar=/dev/stdin --dry-run=client -o yaml | $(KUBECTL) apply -f -
	$(RUN) $(NODE_IMAGE) sh dev/seed/git.sh | $(KUBECTL) apply -f -
	$(KUBECTL) -n seed-flux rollout restart deployment git
	@# Certificates made anew (openssl, in the node image): none kept in the repository.
	$(RUN) $(NODE_IMAGE) sh dev/seed/tls.sh secrets | $(KUBECTL) apply -f -
	@# The pending request made anew: its spec is not changed once made, and it waits again.
	$(KUBECTL) -n seed-shop delete certificaterequest pending-1 --ignore-not-found
	$(RUN) $(NODE_IMAGE) sh dev/seed/tls.sh request | $(KUBECTL) create -f -

# All the seed made, by its label (overkube.dev/seed=true): its namespaces, its cluster-wide objects, the
# volumes its claims kept (a retaining class's), then cert-manager, trivy-operator and Flux (their reports and
# objects with their CRDs; Flux's own removed with seed-flux first, its controllers still there to let them go).
dev-clean:
	@# The seed's APIService first: one whose server is gone fails discovery, and namespaces are not deleted while it does.
	$(KUBECTL) delete apiservice -l overkube.dev/seed=true
	$(KUBECTL) delete namespace -l overkube.dev/seed=true --timeout=300s
	-$(KUBECTL) delete clusterissuers.cert-manager.io -l overkube.dev/seed=true
	$(KUBECTL) delete clusterrolebinding,clusterrole,priorityclass,ingressclass,persistentvolume,storageclass,certificatesigningrequest,customresourcedefinition -l overkube.dev/seed=true
	$(KUBECTL) -n kube-system delete rolebinding -l overkube.dev/seed=true
	$(DEV) exec -T kube sh -c "kubectl get pv -o jsonpath='{range .items[*]}{.metadata.name} {.spec.claimRef.namespace}{\"\\n\"}{end}' | awk '\$$2 ~ /^seed-/ {print \$$1}' | xargs -r kubectl delete pv"
	$(KUBECTL) delete --ignore-not-found -f $(CERT_MANAGER)
	$(KUBECTL) delete --ignore-not-found -f $(TRIVY_OPERATOR)
	$(KUBECTL) delete --ignore-not-found -f $(FLUX)

# The cluster forgotten: its volume deleted, after asking.
dev-reset:
	@printf "Delete the dev cluster's data (its volume)? [y/N] " && read answer && [ "$$answer" = y ]
	$(DEV) down -v

