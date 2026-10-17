# overkube on this machine

The server on your own machine, against the cluster your kubeconfig points at, used as that kubeconfig may: no one signs in (`OVERKUBE_AUTH=loopback`), so it must be reachable from this machine alone. Two ways: the image, or the sources with Node 24.

## The image

```bash
docker run --rm --name overkube \
  -p 127.0.0.1:8443:8443 \
  -v "$HOME/.kube/config:/kubeconfig:ro" -e KUBECONFIG=/kubeconfig \
  -e OVERKUBE_LOCAL_NETWORK=true -e OVERKUBE_HOSTS=localhost,127.0.0.1 \
  ghcr.io/overweave/overkube:<version>
```

then open [https://localhost:8443](https://localhost:8443) — its own certificate: the browser asks once. Why each piece ([apps/server/src/config.ts](../apps/server/src/config.ts)):

- **`-p 127.0.0.1:8443:8443`** — published on this machine's loopback only. In the image the server listens on `0.0.0.0` inside its container (`OVERKUBE_HOST`), which is why the next two are needed.
- **`OVERKUBE_LOCAL_NETWORK=true`** — says that the network it listens on reaches only this machine. Without it the server refuses to start with `loopback` sign-in ("anyone who reaches it would use the cluster as its credentials"). It is a promise: publish the port on `127.0.0.1`, not on every address.
- **`OVERKUBE_HOSTS=localhost,127.0.0.1`** — the names it is reached by; listening beyond loopback it has no default, and a request by another name is refused (421). The image's entrypoint ([docker/entrypoint.sh](../docker/entrypoint.sh)) also makes its self-signed certificate for exactly these names, in `/var/lib/overkube/tls` (a volume there keeps it between runs; made anew when the names change). Plain `http://localhost:8443` is sent to HTTPS; `/healthz` and `/readyz` answer on both.
- **`KUBECONFIG=/kubeconfig`**, the file mounted read-only — the cluster; the first file of a `:`-separated list is taken, and the `current-context` in it. The file must exist, or the server does not start.
- **Port 8443** — the image's `OVERKUBE_PORT`; `-p 127.0.0.1:9443:8443` reaches it at `https://localhost:9443`.

Plain HTTP instead of its own certificate: add `-e OVERKUBE_TLS=off` (no certificate is made; `loopback` needs no HTTPS) and open `http://localhost:8443`. Its own certificate's files: `-e OVERKUBE_TLS_CERT=… -e OVERKUBE_TLS_KEY=…`, mounted. `-e OVERKUBE_READ_ONLY=true` lets nothing change the cluster, whatever the kubeconfig may.

### The kubeconfig

- **Readable by uid 1000.** The container runs as the user `node` (uid 1000, gid 1000), not root. A kubeconfig only its owner can read, owned by another uid, fails at once: `EACCES: permission denied … not readable by this process (uid 1000)`. Make a copy readable by 1000, or `--user "$(id -u)"` if your uid owns it (the server's own certificate then needs a writable `OVERKUBE_TLS_DIR`, or `OVERKUBE_TLS=off`).
- **A server at `127.0.0.1` or `localhost`** — kind, minikube, k3d, Docker Desktop's Kubernetes, Rancher Desktop — is this machine's loopback, not the container's: inside it there is nothing there. On Linux, `--network host` (then publish nothing, and set `OVERKUBE_HOST=127.0.0.1` so it listens on this machine's loopback alone — `OVERKUBE_LOCAL_NETWORK` and `OVERKUBE_HOSTS` are then not needed; without `OVERKUBE_HOSTS` no certificate is made, so it is `http://localhost:8443`). On macOS and Windows there is no host network: write a copy of the kubeconfig whose `server:` is the host's address as the container sees it (`host.docker.internal`), and the certificate must name it (kind: `--api-server-address`; or `insecure-skip-tls-verify: true` with a cluster you trust to be yours).
- **Credentials.** The kubeconfig must sign in with a token (`token`, `tokenFile`) or a client certificate (`client-certificate(-data)`, `client-key(-data)`). An `exec` credential plugin (`aws eks get-token`, `gke-gcloud-auth-plugin`, `kubelogin` for AKS or OIDC), an `auth-provider`, a username and password, or a `proxy-url` is refused with the reason in the log and in `/kube/status` — and the plugins' binaries are not in the image anyway. For such clusters, make a token (`kubectl create token`, or the provider's) and write a kubeconfig with it, or [run it in the cluster](cluster.md).
- **Paths inside it.** `client-certificate`, `client-key`, `certificate-authority` as file paths are resolved relative to the kubeconfig's own location: mount those files beside it, at the same relative places, or use the `-data` forms (what `kubectl config view --flatten --minify` writes).

### Checking it

```bash
curl -sk https://localhost:8443/healthz        # ok: the process answers
curl -sk https://localhost:8443/readyz         # ok: the cluster answers
curl -sk https://localhost:8443/kube/status    # the cluster's version, or why it is not reached
```

`docker logs overkube` says where it listens, which kubeconfig it took, and what went wrong.

## From the sources

With Node 24 (and npm), in a clone of the repository:

```bash
npm ci
npm run build -w @overkube/web                                   # the page, to apps/web/dist
OVERKUBE_UI="$PWD/apps/web/dist" npm start -w @overkube/server   # http://127.0.0.1:8080
```

`npm start` runs `apps/server/src/cli.ts` on Node directly (its TypeScript stripped, the workspace's packages read from their sources through the `overkube-source` condition): nothing of the server is built. It listens on `127.0.0.1:8080` by default, so `OVERKUBE_LOCAL_NETWORK` and `OVERKUBE_HOSTS` are not needed, and `loopback` sign-in is allowed. The cluster is `KUBECONFIG`'s first file, else `~/.kube/config`; the same rules about credentials apply, but `exec` plugins are refused here too — not for want of their binaries, but by design: give it a token.

`OVERKUBE_UI` is an absolute path (npm runs the script in `apps/server`): the folder with the built `index.html`. Without it the server is the gateway alone, no page.

Over HTTPS, with your own certificate: `OVERKUBE_TLS_CERT` and `OVERKUBE_TLS_KEY`. A port: `OVERKUBE_PORT`. Everything else: [the server's settings](../README.md#the-server). The image itself can be built from the same sources, `docker build -t overkube:dev .`, and run as above.
