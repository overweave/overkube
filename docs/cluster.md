# overkube in a cluster

The server runs as one pod, as a Deployment of one replica (its sessions are in its memory), listening on 8443 with HTTPS. People sign in — with a token of the cluster's, or with an OpenID Connect provider — and the page shows what each may see. The chart is [charts/overkube](../charts/overkube); a release ships it in a registry and drawn as plain manifests.

## Install

With Helm, from a release:

```bash
helm install overkube oci://ghcr.io/overweave/charts/overkube --version <version> -n overkube --create-namespace
```

From this repository:

```bash
helm install overkube charts/overkube -n overkube --create-namespace
```

With kubectl alone, a release's `overkube.yaml` (the chart drawn with its default values: token sign-in, its own certificate, no Ingress):

```bash
kubectl create namespace overkube
kubectl apply -n overkube -f https://github.com/overweave/overkube/releases/download/v<version>/overkube.yaml
```

Then reach it from this machine:

```bash
kubectl -n overkube port-forward svc/overkube 8443:8443
```

and open [https://localhost:8443](https://localhost:8443). With the default `tls.mode: self` the certificate is its own: the browser asks once. The server answers only the names in `hosts` (`[localhost, 127.0.0.1]` by default), any other with 421.

Helm's notes after the install say the same for the values chosen. `helm upgrade overkube … -f values.yaml` changes them; `helm uninstall overkube -n overkube` removes everything but the namespace.

## Values

Every value of [values.yaml](../charts/overkube/values.yaml); each maps onto the server's environment ([apps/server/src/config.ts](../apps/server/src/config.ts)).

| Value | Default | |
|---|---|---|
| `image.repository` | `ghcr.io/overweave/overkube` | |
| `image.tag` | `""` | None: the chart's `appVersion` |
| `image.pullPolicy` | `IfNotPresent` | |
| `auth.mode` | `token` | `token` or `oidc` — below. There is no `loopback` in a cluster |
| `auth.sessionHours` | `8` | How long one stays signed in at most; a token's or an ID token's own end, sooner |
| `auth.oidc.issuer` | `""` | The provider (`https://id.example.org/realms/main`). Required with `oidc` |
| `auth.oidc.clientId` | `""` | Its client. Required with `oidc` |
| `auth.oidc.clientSecret.secretName` | `""` | A Secret holding a confidential client's secret; none: a public client, PKCE alone |
| `auth.oidc.clientSecret.key` | `client-secret` | Its key in that Secret |
| `auth.oidc.scopes` | `openid profile email` | Asked of the provider (add `groups` where the provider wants it asked for) |
| `auth.oidc.userClaim` | `email` | The claim that names the user |
| `auth.oidc.groupsClaim` | `groups` | The claim that lists their groups |
| `auth.oidc.prefix` | `oidc:` | Put before the user and each group — what RBAC names them by. Never `system:` |
| `hosts` | `[localhost, 127.0.0.1]` | The names it is reached by; any other is refused (a DNS rebinding). The Ingress's hosts are added to them |
| `tls.mode` | `self` | `self`: a certificate of its own, made as it starts. `secret`: a `kubernetes.io/tls` Secret's. `off`: whatever is in front ends TLS — below |
| `tls.secretName` | `""` | The Secret, with `tls.mode: secret` |
| `readOnly` | `false` | Nothing that changes the cluster, whoever signs in |
| `service.type` | `ClusterIP` | |
| `service.port` | `8443` | The Service's port; the container's is always 8443 |
| `ingress.enabled` | `false` | |
| `ingress.className` | `""` | |
| `ingress.annotations` | `{}` | The controller's — below |
| `ingress.hosts` | `[]` | Its hosts, one rule each at `/`. Required when enabled |
| `ingress.tls` | `[]` | Its TLS, as an Ingress has it (`secretName`, `hosts`) |
| `resources` | 50m CPU, 128Mi requested; 512Mi limit | |
| `extraEnv` | `[]` | More of the server's environment, as a container's `env` entries (`name` with `value` or `valueFrom`): what the chart does not name — `NODE_EXTRA_CA_CERTS` for a provider of a private CA (the bundle mounted by other means), `OVERKUBE_TLS_DIR` |
| `podAnnotations`, `nodeSelector`, `tolerations`, `affinity` | empty | |

The pod runs as uid 1000, no root, a read-only root filesystem, every capability dropped; health is probed on plain HTTP at the same port (`/healthz` liveness, `/readyz` readiness: whether the cluster answers).

## Signing in with a token

`auth.mode: token`, the default. One pastes a token the API server takes, and the page uses the cluster as its bearer: the token goes to the API server in place of the server's credentials — which therefore need nothing, and the chart binds nothing to the server's ServiceAccount. The session ends when the token does, or after `auth.sessionHours`.

A token for a ServiceAccount, with its rights:

```bash
kubectl -n <namespace> create token <serviceaccount> --duration=8h
```

Any token the API server authenticates does: one of your own user's, from a provider, as well. What one sees and may do is exactly that identity's RBAC; what it may not do, the page does not show. For a reader:

```bash
kubectl create serviceaccount viewer -n overkube
kubectl create clusterrolebinding overkube-viewer --clusterrole=view --serviceaccount=overkube:viewer
kubectl -n overkube create token viewer --duration=8h
```

`view` reads most things (pod logs too) but not Secrets. A token is sent only over HTTPS (or by `localhost`), kept in the server's memory, written nowhere.

## Signing in with OpenID Connect

`auth.mode: oidc`, with `auth.oidc.issuer` and `auth.oidc.clientId`. The server sends one to the provider (the authorization code flow with PKCE; a secret from `auth.oidc.clientSecret` makes it a confidential client), takes the ID token, and from then on asks the API server **impersonating** the user: `Impersonate-User: <prefix><userClaim>`, `Impersonate-Group: <prefix><group>` for each group. An email names one only once the provider says it is verified (`email_verified`). The session ends with the ID token, or after `auth.sessionHours`.

At the provider: a client (public, or confidential with a secret) whose redirect URI is

```
https://<one of hosts>/auth/oidc/callback
```

one per name the dashboard is reached by. The provider's issuer URL must be HTTPS, and must be reachable from the pod (a private CA: `NODE_EXTRA_CA_CERTS` in `extraEnv`, the bundle mounted).

The chart then adds a ClusterRole and ClusterRoleBinding ([templates/rbac.yaml](../charts/overkube/templates/rbac.yaml)): the server's ServiceAccount may `impersonate` `users` and `groups`. This is a strong right — whoever holds that ServiceAccount's token may act as any user in the cluster (the server itself never impersonates `system:` names: the prefix may not begin with it). Keep the namespace to the cluster's admins, and the image to a release's.

Users then need RBAC under their prefixed names; the cluster does not know them otherwise:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: overkube-viewers }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: view }
subjects:
  - { kind: User, apiGroup: rbac.authorization.k8s.io, name: "oidc:alice@example.org" }
  - { kind: Group, apiGroup: rbac.authorization.k8s.io, name: "oidc:platform-team" }
```

A cluster whose API server already authenticates the same provider (`--oidc-issuer-url`) usually names users with a prefix of its own: set `auth.oidc.prefix` to it and the same bindings serve kubectl and the dashboard.

## TLS

Signing in off the machine is only over HTTPS; the chart has three ways.

- **`self`** (default) — the container makes a self-signed certificate as it starts ([docker/entrypoint.sh](../docker/entrypoint.sh)), for every name in `hosts` and the Ingress's, kept in an `emptyDir` (made anew when the pod is). Right for `kubectl port-forward`, and for an Ingress that speaks HTTPS to its backends and terminates its own certificate in front.
- **`secret`** — a `kubernetes.io/tls` Secret named by `tls.secretName` (cert-manager's, or your own), mounted at `/etc/overkube/tls`; a renewed certificate is taken at the next connection. The server then speaks HTTPS with it directly, so a Service of type `LoadBalancer` or an Ingress passing TLS through works.
- **`off`** — a proxy in front ends TLS and sets `X-Forwarded-Proto: https` (an Ingress that speaks only HTTP to its backends). The server listens on plain HTTP and trusts the header; it must not be reachable otherwise. The proxy's `X-Forwarded-For` is also taken, to count sign-ins by client.

In every mode plain HTTP answers `/healthz` and `/readyz` on the same port; anything else on plain HTTP is sent to HTTPS (modes `self` and `secret`).

## Ingress

`ingress.enabled: true` with `ingress.hosts`; those hosts are added to `OVERKUBE_HOSTS`. With ingress-nginx and the default `tls.mode: self` the backend is HTTPS, and a watch is one long response, so:

```yaml
ingress:
  enabled: true
  className: nginx
  hosts: [dash.example.org]
  tls:
    - secretName: overkube-tls   # cert-manager's, or your own
      hosts: [dash.example.org]
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: HTTPS
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
```

With `tls.mode: off` leave out `backend-protocol` (the backend is HTTP) and make sure the controller sets `X-Forwarded-Proto` — ingress-nginx does. Other controllers want the equivalents: an HTTPS (or HTTP) backend, no response buffering, a read timeout of an hour or more.

With OIDC the Ingress host is the one in the provider's redirect URI.

## Behind port-forward only

Nothing more than the install: `tls.mode: self`, `hosts: [localhost, 127.0.0.1]`, no Ingress, and

```bash
kubectl -n overkube port-forward svc/overkube 8443:8443
```

Each person forwards for themselves and signs in with their own token; the forward's identity (your kubeconfig's) is used only to reach the pod, never to read the cluster.
