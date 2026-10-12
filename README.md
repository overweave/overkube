# overkube

> **Experimental — 0.x.** A kind's table over a live cluster runs; the rest is coming.

A dashboard for Kubernetes clusters, built on [overweave](https://github.com/overweave/overweave): what it shows — kinds, tables, columns, pages, actions — is contributed by addons and layered over one another; the user's own changes are one more layer.

## The server

`apps/server` is overkube's own server: the gateway to the cluster (`@overkube/gateway`, under `/kube`), the page at `/`, `/healthz` and `/readyz`. It is configured by its environment:

| Variable | Default | |
|---|---|---|
| `OVERKUBE_HOST` | `127.0.0.1` | Where it listens. It has no sign-in of its own yet: beyond this machine, put it behind a proxy that signs people in (it warns when it is not) |
| `OVERKUBE_PORT` | `8080` | |
| `OVERKUBE_READ_ONLY` | `false` | Nothing that changes the cluster (`true` or `false`: anything else stops it from starting). Reading still shows everything its credentials may read, Secrets too |
| `OVERKUBE_UI` | — | The built page's folder |
| `OVERKUBE_HOSTS` | this machine's names, when it listens on it | The names it is reached by (`dash.example.org,localhost`); a request by any other is refused (421) — a DNS rebinding cannot make another site's name reach it |
| `OVERKUBE_TRUST_NETWORK` | `false` | Its network is trusted (a container's, published on this machine only): no warning that it has no sign-in |
| `KUBECONFIG` | — | The cluster: `KUBECONFIG`'s first file, else the pod's ServiceAccount, else `~/.kube/config` |

Its kubeconfig signs in with a token (or a token file) or a client certificate. One that signs in otherwise — `exec` plugins (EKS, GKE, AKS, OIDC), an `auth-provider`, a username and password — or goes through a `proxy-url` is refused with the reason (`/readyz` and `/kube/status` say it): give it a token, or run it in the cluster. A kubeconfig with several contexts names the one to use (`current-context`).

No page of another site reaches the cluster through its visitor's browser: a request another site's page sends (`Sec-Fetch-Site: cross-site`, another `Origin`) is refused, and anything but a read carries the `x-overkube` header — which such a page cannot set. A script of its own (curl) sends it too: `-H 'x-overkube: 1'`.

From the sources, with Node 24:

```bash
npm start -w @overkube/server
```

## overweave's packages

overweave's packages (`@overweave/*`) come from GitHub's npm registry, which asks for a token even to read: a GitHub token with `read:packages`, in `GITHUB_TOKEN`. `make` takes the GitHub CLI's (`gh auth refresh -s read:packages` once, then `gh auth token`); `npm` alone reads the environment's (`.npmrc`).

To work on overweave and overkube at once, with overweave beside this repository (`../overweave`):

```bash
make link-overweave
```

Its packages are then its sources: a change there is seen here at once, in the tests and on the dev stand. `make unlink-overweave` (or any install) takes the registry's again.

## The dev stand

A cluster and overkube over it, from the sources — only Docker is needed:

```bash
make dev
```

- [http://localhost:5173](http://localhost:5173): the page, reloaded as it is changed (`#/k/namespaces.v1`, `#/k/deployments.v1.apps?open=deployments.v1.apps/<namespace>/<name>`, …)
- [http://localhost:8080](http://localhost:8080): the server — its gateway at `/kube`, `/healthz`, `/readyz`
- the cluster: KubeSolo (`dev/kube`), its data kept between runs

`make dev-logs`, `make dev-kubectl ARGS="get pods -A"`, `make dev-down` (stopped, data kept), `make dev-reset` (the cluster forgotten, after asking).

## Checks

Only Docker is needed:

```bash
make check
```

## License

MIT — [LICENSE](LICENSE). Two packages carry others' work, said in their NOTICE: `@overkube/kube-types` the Kubernetes API's descriptions (Apache License 2.0, [NOTICE](packages/kube-types/NOTICE)), `@overkube/uikit` Tabler's icons (MIT, [NOTICE](packages/uikit/NOTICE)).

Kubernetes is a registered trademark of The Linux Foundation. overkube is not affiliated with or endorsed by it.
