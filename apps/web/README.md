# @overkube/web

overkube's page: what the browser runs. Started in order ([src/boot.ts](src/boot.ts)): signed in as its server says one signs in here (`GET /auth`; [src/session.tsx](src/session.tsx): not signed in, the sign-in screen alone); the connector to the gateway at `/kube` ([@overkube/connector](../../packages/connector/README.md)) and the source answering queries over it ([@overkube/source](../../packages/source/README.md)); overweave's registry of the dashboard's kinds ([@overkube/sdk](../../packages/sdk/README.md)); the user's changes read back ([@overkube/shell](../../packages/shell/README.md)'s `UserService`, in localStorage); the addons run in it ([src/host](src/host): their lifecycle — requirements, retries, `?safe` runs the core alone); the shell drawn into `#app` (`?debug`: the slots over it). The addons in its bundle: [src/addons.ts](src/addons.ts) — the [core](../../addons/core/README.md), [metrics](../../addons/metrics/README.md), [cert-manager](../../addons/cert-manager/README.md), [trivy](../../addons/trivy/README.md), [helm](../../addons/helm/README.md), [flux](../../addons/flux/README.md), [edit](../../addons/edit/README.md); each but the core with its setup in a chunk of its own (`lazySetup`; `addon-<id>-….js`, [chunks.ts](chunks.ts)), loaded once it is turned on — one that cannot be loaded is failed at once, its reason saying to reload the page (a browser does not load a module that failed again) — what an addon turned off is (its title, what it answers to) alone in the page's.

```bash
npm run dev -w @overkube/web      # Vite, with /kube and /auth passed to OVERKUBE_SERVER (http://127.0.0.1:8080)
npm run build -w @overkube/web    # dist/: what the server serves as OVERKUBE_UI
```

The dev stand (`make dev`) runs the first at [http://localhost:5173](http://localhost:5173); the image copies the second to `/app/ui`. [vite.config.ts](vite.config.ts) reads the workspace's packages and overweave from their sources (the `overkube-source` and `overweave-source` conditions), one Preact.

For a host that draws the page into a page of its own (a platform's plugin), it is published as a library, `@overkube/web` ([src/index.ts](src/index.ts)): `boot({ element, asked, gateway, headers, signIn: false, addons })` — its gateway where the host serves it, the host's headers on every request (a CSRF token), no `/auth` asked (the host has signed the user in), the host's own addons beside the page's; it answers the registry and `close()`. Its own packages (the addons, the shell, the runtime, the source, the connector) are bundled in; those a host's addons are written with — `@overkube/sdk`, `@overkube/uikit`, `@overkube/kube-types`, `@overkube/query`, `@overkube/gateway`, overweave, Preact — are dependencies, one of each in the host's bundle. Its addons' setups are chunks of their own beside `lib/index.js` (imported from it, relatively: the host's bundler takes them in as its own chunks). `@overkube/web/styles` is the page around it (the fonts, [src/page.css](src/page.css)), for the host's bundler.

```ts
import { boot } from '@overkube/web';
import '@overkube/web/styles';

const page = await boot({ element, asked: new URLSearchParams(location.search), gateway: '/plugins/overkube/kube', signIn: false });
```

```bash
npm run build:lib -w @overkube/web   # lib/: the library (vite.lib.config.ts), its types
```
