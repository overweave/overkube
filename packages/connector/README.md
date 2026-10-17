# @overkube/connector

The page's side of the [gateway](../gateway/README.md): its HTTP (`Http`: lists in pages, an object, the session — `ApiError`, `Status`), its one changing stream (`WatchStream`: every watch and followed log of the page over one `GET /stream`), what the cluster serves (`Discovery`, `preferredKinds`), and **feeds** (`Feeds`, `Feed`): a collection — a kind, in a namespace or every one, by name, by labels, whole or its metadata only — listed in pages and watched, shared by the whole page, let go of a while after no one holds it. A collection listed once, nothing kept (`listOnce`, `countOnce`); a container's log followed or read a window at a time (`LogTarget`, `LogWindow`). `createConnector()` joins them.

```ts
import { createConnector } from '@overkube/connector';

const connector = createConnector({ http: { base: '/kube' } });
const hold = connector.feeds.use({ kind, namespace: 'media' });   // hold.feed: its objects and state, live (signals)
hold.release();                                                   // let go once nobody holds it for a while
```

Its state is Preact signals (`@preact/signals`, a peer dependency). What is *asked* of the data — queries, fields, their results — is not here but in [@overkube/source](../source/README.md), which plans queries onto feeds.

Tested on Node against the [fake API server](../fake-kube/README.md), through the gateway. Built with `npm run build -w @overkube/connector` (`dist/`); in the workspace read from `src/`.
