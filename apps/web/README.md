# @overkube/web

overkube's page: what the browser runs. Started in order ([src/boot.ts](src/boot.ts)): signed in as its server says one signs in here (`GET /auth`; [src/session.tsx](src/session.tsx): not signed in, the sign-in screen alone); the connector to the gateway at `/kube` ([@overkube/connector](../../packages/connector/README.md)) and the source answering queries over it ([@overkube/source](../../packages/source/README.md)); overweave's registry of the dashboard's kinds ([@overkube/sdk](../../packages/sdk/README.md)); the user's changes read back ([@overkube/shell](../../packages/shell/README.md)'s `UserService`, in localStorage); the addons run in it ([src/host](src/host): their lifecycle — requirements, retries, `?safe` runs the core alone); the shell drawn into `#app` (`?debug`: the slots over it). The addons in its bundle: [src/addons.ts](src/addons.ts) — the [core](../../addons/core/README.md), [metrics](../../addons/metrics/README.md), [cert-manager](../../addons/cert-manager/README.md).

```bash
npm run dev -w @overkube/web      # Vite, with /kube and /auth passed to OVERKUBE_SERVER (http://127.0.0.1:8080)
npm run build -w @overkube/web    # dist/: what the server serves as OVERKUBE_UI
```

The dev stand (`make dev`) runs the first at [http://localhost:5173](http://localhost:5173); the image copies the second to `/app/ui`. [vite.config.ts](vite.config.ts) reads the workspace's packages and overweave from their sources (the `overkube-source` and `overweave-source` conditions), one Preact.

Private: not published.
