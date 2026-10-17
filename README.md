# overkube

> **Experimental — 0.x.** A kind's table over a live cluster runs; the rest is coming.

A dashboard for Kubernetes clusters, built on [overweave](https://github.com/overweave/overweave): what it shows — kinds, tables, columns, pages, actions — is contributed by addons and layered over one another; the user's own changes are one more layer.

## The server

`apps/server` is overkube's own server: the gateway to the cluster (`@overkube/gateway`, under `/kube`), signing in at `/auth`, the page at `/`, `/healthz` and `/readyz`. It is configured by its environment:

| Variable | Default | |
|---|---|---|
| `OVERKUBE_HOST` | `127.0.0.1` | Where it listens |
| `OVERKUBE_PORT` | `8080` | |
| `OVERKUBE_READ_ONLY` | `false` | Nothing that changes the cluster (`true` or `false`: anything else stops it from starting). Reading still shows everything one may read, Secrets too |
| `OVERKUBE_UI` | — | The built page's folder |
| `OVERKUBE_HOSTS` | this machine's names, when it listens on it; else required | The names it is reached by (`dash.example.org,localhost`); a request by any other is refused (421) — a DNS rebinding cannot make another site's name reach it |
| `OVERKUBE_LOCAL_NETWORK` | `false` | The network it listens on reaches only this machine (a container published on `127.0.0.1`): as if it listened there |
| `OVERKUBE_AUTH` | `loopback` | Who uses the cluster — below |
| `OVERKUBE_SESSION_HOURS` | `8` | How long one stays signed in at most (a token's own end, sooner) |
| `OVERKUBE_TLS_CERT`, `OVERKUBE_TLS_KEY` | — | Its certificate and key (PEM, read again as they change): HTTPS, plain HTTP on the same port sent there (`/healthz`, `/readyz` aside) |
| `OVERKUBE_TLS` | — | `off`: a proxy in front ends TLS (its `X-Forwarded-Proto` taken) |
| `KUBECONFIG` | — | The cluster: `KUBECONFIG`'s first file, else the pod's ServiceAccount, else `~/.kube/config` |

Who uses the cluster (`OVERKUBE_AUTH`):

- **`loopback`** — no one signs in: whoever reaches it uses the cluster as its kubeconfig (or ServiceAccount) may. Only where only this machine reaches it (`127.0.0.1`, or `OVERKUBE_LOCAL_NETWORK`): elsewhere it does not start.
- **`token`** — one signs in with a token the cluster takes, `kubectl -n <namespace> create token <service-account> --duration=8h`, and uses the cluster as it: the token goes to the API server in place of the server's credentials, which then need no rights at all. Signed in until the token ends.
- **`oidc`** — one signs in with an OpenID Connect provider (the authorization code flow, PKCE) until the ID token ends, and is impersonated: its user and groups claims, prefixed — the server's credentials need only `impersonate` on them. An email names one only once the provider says it is verified (`email_verified`). `OVERKUBE_OIDC_ISSUER`, `OVERKUBE_OIDC_CLIENT_ID` (its redirect URI: `https://<a name of it>/auth/oidc/callback`), `OVERKUBE_OIDC_CLIENT_SECRET` (none: a public client), `OVERKUBE_OIDC_SCOPES` (`openid profile email`), `OVERKUBE_OIDC_USER_CLAIM` (`email`), `OVERKUBE_OIDC_GROUPS_CLAIM` (`groups`), `OVERKUBE_OIDC_PREFIX` (`oidc:`). A provider of a private CA: `NODE_EXTRA_CA_CERTS`.

Signing in is only over HTTPS — its own certificate, or a proxy's in front (`OVERKUBE_TLS=off`: it sets `X-Forwarded-Proto` and `X-Forwarded-For` itself — of a list, the last is taken: the nearest proxy's; behind several proxies, sign-ins are counted by the one before it) — or by this machine's own names (`http://localhost`; Safari keeps no session there: use HTTPS). So many sign-ins a minute from one client. A session is kept in the server's memory — a restart signs everyone out, a token is never written anywhere, and a server in a cluster runs as one replica — its id in a cookie only the page has (`HttpOnly`, `Secure`, `SameSite=Strict`). Whatever one signed in may not do, the page does not show.

With `token`, the server's own credentials may be none at all: what it still asks itself (`/readyz`: whether the cluster answers) then goes anonymous, which the API server answers only while it allows anonymous requests (`--anonymous-auth`, on by default); `/kube/status` is asked as the one signed in.

Its kubeconfig signs in with a token (or a token file) or a client certificate. One that signs in otherwise — `exec` plugins (EKS, GKE, AKS, OIDC), an `auth-provider`, a username and password — or goes through a `proxy-url` is refused with the reason (the server's log, `/kube/status` says it; `/readyz` only that the cluster is not ready): give it a token, or run it in the cluster. A kubeconfig with several contexts names the one to use (`current-context`).

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

Signing in on the stand (the seed's accounts: `make dev-seed` once — `dev/seed/70-sign-in.yaml`):

- **a token**: `OVERKUBE_AUTH=token make dev`, then `make dev-token SA=viewer` (or `admin`, `shop-dev`; `DURATION=10m`: one that ends while the page is open);
- **OIDC**: `OVERKUBE_AUTH=oidc make dev` starts Dex too (`dev/dex.yaml`): `admin@seed.test` or `viewer@seed.test`, password `password`, or *Log in with Mock* — a user of the group `authors`, who may use `seed-shop` alone (add it in the namespaces' picker). Dex is at `http://dex.localhost:5556`, a name Chrome and Firefox take for this machine (Safari does not); it sends the page back to the stand's own ports only (5173, 8080: not `WEB_PORT` or `OVERKUBE_PORT` changed);
- back to no one signing in: `make dev`.

## Checks

Only Docker is needed:

```bash
make check
```

## License

MIT — [LICENSE](LICENSE). Two packages carry others' work, said in their NOTICE: `@overkube/kube-types` the Kubernetes API's descriptions (Apache License 2.0, [NOTICE](packages/kube-types/NOTICE)), `@overkube/uikit` Tabler's icons (MIT, [NOTICE](packages/uikit/NOTICE)).

Kubernetes is a registered trademark of The Linux Foundation. overkube is not affiliated with or endorsed by it.
