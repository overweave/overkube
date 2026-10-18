# Working on overkube

Everything runs in containers: only Docker (with Compose) and `make` are needed on the machine. Node, the cluster, Storybook — each is a container the [Makefile](../Makefile) starts. `make help` lists the targets.

## The dev stand

```bash
make dev
```

installs the dependencies (a Node image of the repository's, `dev/node`, built once), then starts [dev/compose.yaml](../dev/compose.yaml):

- **kube** — a single-node Kubernetes, [KubeSolo](https://github.com/portainer/kubesolo) (`dev/kube`), with `kubectl` beside it. Its data is a volume, kept between runs.
- **server** — `apps/server` from its sources (`node --watch`: started again as they, or the gateway's, change), reading the cluster's admin kubeconfig from that volume. At [http://localhost:8080](http://localhost:8080): `/healthz`, `/readyz`, the gateway at `/kube` (`/kube/status`, `/kube/me`).
- **web** — Vite serving `apps/web` from its sources, reloaded as they change, at [http://localhost:5173](http://localhost:5173); `/kube` and `/auth` passed to the server. Paths: `#/k/namespaces.v1`, `#/k/deployments.v1.apps?open=deployments.v1.apps/<namespace>/<name>`, …; `?safe` runs the core addon alone, `?debug` shows the slots over the page.

Both ports are published on `127.0.0.1` only. Other ports: `WEB_PORT=5174 OVERKUBE_PORT=8081 make dev`.

The parent folder is what the containers mount (`../..` → `/src`), so overweave beside this repository is seen too (below). No file events cross the mount: Vite and Storybook poll.

| | |
|---|---|
| `make dev-logs` | The stand's logs, followed |
| `make dev-kubectl ARGS="get pods -A"` | `kubectl` against the stand's cluster |
| `make dev-seed` | The cluster filled: cert-manager from its release, then `dev/seed` — every usual kind, a few of each, on busybox; the sign-in accounts below. Once |
| `make dev-clean` | All the seed made deleted (cert-manager too); the rest of the cluster kept |
| `make dev-down` | Stopped; the cluster's data kept |
| `make dev-reset` | The cluster forgotten (its volume deleted), after asking |

### Signing in on the stand

By default no one signs in (`OVERKUBE_AUTH=loopback`): the page uses the cluster as its admin kubeconfig. The other two modes need the seed's accounts (`make dev-seed` once; [dev/seed/70-sign-in.yaml](../dev/seed/70-sign-in.yaml)):

- **A token** — `OVERKUBE_AUTH=token make dev`, then

  ```bash
  make dev-token SA=viewer      # or admin, shop-dev; DURATION=10m for one that ends while the page is open
  ```

  and paste it into the sign-in screen. `admin` is `cluster-admin`; `viewer` has `view` on the cluster (no Secrets); `shop-dev` has `edit` in `seed-shop` alone — what the page hides from each is theirs to see.

- **OIDC** — `OVERKUBE_AUTH=oidc make dev` starts [Dex](https://dexidp.io) too ([dev/dex.yaml](../dev/dex.yaml)), at `http://dex.localhost:5556/dex`. Sign in as `admin@seed.test` or `viewer@seed.test` (password `password`; the seed binds `oidc:admin@seed.test` to `cluster-admin`, `oidc:viewer@seed.test` to `view`), or *Log in with Mock*: a user of the group `authors`, bound to `edit` in `seed-shop` alone (the namespace is not listed for them: add it in the namespaces' picker). `dex.localhost` is a name Chrome and Firefox take for this machine (Safari does not); Dex sends the page back to the stand's own ports only (5173 and 8080, not ones changed by `WEB_PORT` or `OVERKUBE_PORT`).

- Back to no one signing in: `make dev` without the variable (the server is recreated; Dex is stopped).

## Checks

```bash
make check          # everything CI checks: lint and format (biome), types (tsc, every workspace), tests (vitest)
make lint           # one of them; make format rewrites the files
make typecheck
make test
make coverage
```

The same commands run `npm run lint`, `npm run typecheck`, `npm test` in the Node container; CI ([.github/workflows/check.yml](../.github/workflows/check.yml)) runs them on a plain Node 24, and lints the Helm chart.

Tests are vitest's, beside what they test (`*.test.ts`, `*.test.tsx`; `*.node.test.ts` run on Node against the fake API server, [packages/fake-kube](../packages/fake-kube/README.md)). Workspace packages are imported from their sources through the `overkube-source` export condition, so nothing is built to test.

## Storybook

```bash
make storybook      # http://localhost:6006; Ctrl+C stops it
```

The addons' stories and the UI kit's ([addons/core/.storybook](../addons/core/.storybook)), on `127.0.0.1:6006` (`STORYBOOK_PORT` for another). A story draws the whole page at a path over a cluster in memory; overweave's panel turns its addons off and on. Writing one: [packages/storybook](../packages/storybook/README.md).

## overweave beside it

overweave's packages (`@overweave/*`) come from npmjs.org. To work on both at once, clone overweave beside this repository (`../overweave`) and

```bash
make link-overweave
```

Its four packages in `node_modules/@overweave` are then symlinks to `../overweave/packages/*`, read from their sources (the `overweave-source` condition): a change there is seen here at once — in the tests, on the dev stand, in Storybook. `make unlink-overweave` takes the registry's again; so does any install (a `package.json` changed).

## The image and the chart

What a release ships ([.github/workflows/release.yml](../.github/workflows/release.yml)) can be built here:

```bash
docker build -t overkube:dev .                 # the server (one file) and the page, on Node; no secret needed
helm lint --strict charts/overkube
helm template overkube charts/overkube -n overkube
```

Running the image against a cluster: [local.md](local.md); the chart: [cluster.md](cluster.md). A release is a tag `v<version>` matching `apps/server/package.json` and `charts/overkube/Chart.yaml` (`version` and `appVersion`).
