# @overkube/gateway

The page's way to a Kubernetes cluster, as one handler over Node's request and response — for any host to serve: overkube's own [server](../../apps/server/README.md), a framework's route, a platform's plugin. It passes the API server's paths on (never what reaches past it: exec, attach, portforward, a node's proxy), carries several watches over one stream, applies changes as JSON, says its status, and reaches a workload's port as data.

```ts
import { createGateway, fromKubeconfig, inCluster } from '@overkube/gateway';

const gateway = createGateway({ upstream: fromKubeconfig(process.env.KUBECONFIG), prefix: '/kube', readOnly: false });
http.createServer((req, res) => gateway.handle(req, res) || notFound(res));
```

Under its prefix ([src/protocol.ts](src/protocol.ts), the whole of it):

```
/api/**, /apis/**, /version, /openapi/v3/**    the API server's, passed on (never PATCH)
GET  /stream                                    one line per event (NDJSON), HELLO first: watches, logs
POST /stream/<stream>                           subscriptions added and removed → 204
POST /patch                                     a patch (merge, JSON, strategic, or server-side apply) → the API server's answer
GET  /status                                    the version, whether the cluster is reached and its version
GET  /me                                        whom the cluster takes the page for
*    /proxy/services|pods/<ns>/<[scheme:]name:port>/<path>   a workload's port, as data (GET, HEAD)
```

Anything but a read carries the `x-overkube` header (any value), and no request from another site's page is taken (`Sec-Fetch-Site: cross-site`, a foreign `Origin`): `403 cross_site`. A host that signs people in gives each request an `Identity` (`actingAs`: a token of their own sent in the server's place, or a user and groups impersonated — `Impersonate-User`, `Impersonate-Group`); one it has not signed in is answered `401 unauthorized`. The gateway's own failures answer `{ error: { code, message } }` (`ErrorCode`); the API server's `Status` comes back as sent.

The upstream: `fromKubeconfig(path)` (a token, a token file, or a client certificate; `exec` plugins, `auth-provider`, basic auth and `proxy-url` refused with the reason), `inCluster()` (the pod's ServiceAccount), `readKubeconfig`; `kubeState` for a `/readyz`. Also exported: `classify` (what an API path is), `FIELD_MANAGER`, `whoAmI`, `watchTotals`.

`@overkube/gateway/protocol` — the types the page and the gateway speak, nothing of Node: both the [connector](../connector/README.md) (in the browser) and the gateway import them from here.

Built with `npm run build -w @overkube/gateway` (`dist/`); in the workspace read from `src/`.
