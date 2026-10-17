# @overkube/server

overkube's own server, for a container or a cluster: the gateway to the cluster ([@overkube/gateway](../../packages/gateway/README.md)) under `/kube`, signing in at `/auth`, the built page at `/` (any path that is not a file answers `index.html`: the page routes itself), `/healthz` (the process answers) and `/readyz` (the cluster does). Configured by its environment alone — the settings and their meaning: the header of [src/config.ts](src/config.ts), summed up in the [root README](../../README.md#the-server).

```
src/cli.ts       `overkube`: the server as its environment configures it; SIGTERM, SIGINT stop it
src/config.ts    the environment read, or why it is not a configuration
src/server.ts    the handler: the gateway, /auth, the page and its headers (a CSP of its own origin only), health
src/listen.ts    HTTPS and plain HTTP on one port, the certificate's files read again as they change
src/auth.ts      /auth: GET (how one signs in here), POST /auth/login (a token), /auth/oidc, /auth/oidc/callback, POST /auth/logout
src/oidc.ts      the OpenID Connect flow (authorization code, PKCE), the ID token checked
src/sessions.ts  sessions, in memory: a cookie's id → whom the gateway acts as
```

Private: not published. It is what the image runs ([Dockerfile](../../Dockerfile): `npm run build` makes `dist/overkube.mjs`, one file with every dependency in it, run by Node alone), and what the dev stand runs from its sources.

```bash
npm start -w @overkube/server                      # from the sources, Node 24: http://127.0.0.1:8080, the gateway alone
OVERKUBE_UI="$PWD/apps/web/dist" npm start -w @overkube/server   # with the page, built by @overkube/web
```

Running it for real: [docs/local.md](../../docs/local.md) (this machine), [docs/cluster.md](../../docs/cluster.md) (the chart).
