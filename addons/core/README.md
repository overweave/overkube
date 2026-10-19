# @overkube/addon-core

overkube's core addon: everything the page shows that is not another addon's. Every piece is a definition or a fill another addon can take the place of, at a higher priority — the core is the default, not the frame (the frame is [@overkube/shell](../../packages/shell/README.md)).

What it contributes ([src/index.tsx](src/index.tsx)):

- **kinds** — a `KindView` for every built-in kind, in categories (workloads, config, network, storage, RBAC, scaling, nodes, namespaces, the API's own), with its columns, its sections when opened, its context menu; CRDs by their columns ([src/kinds](src/kinds));
- **pages** — the overview (`page.overview`), a kind's page with its table (`page.kind`), the cluster's map (`page.map`, `/map`: each namespace a card — its workloads its dots —, each node one; a namespace zoomed into, `/map/<namespace>`, its own map), a settings page; a missing kind or resource said;
- **a kind's table** wherever it is drawn (`kind.table`: [src/CoreTable.tsx](src/CoreTable.tsx) — its columns, filter, header, the columns' menu);
- **a resource opened** over the page (`resource.view`: overview, YAML, conditions, events, owners and the owned, pod and workload logs; its Map tab, of a kind a `MapScope` takes — the core's: a namespace's objects, what each is linked to (an Ingress its Services, a Service the workloads it selects, a workload what it reads and keeps, its pods its dots; Jobs, CronJobs, pods of none), a node's what runs on it, a namespace's whole: [src/map](src/map));
- **the navigation** — tabs or a side menu, the namespaces' picker, the header's search;
- **what the user is told** — toasts, waiting states, failures;
- **appearance** — its theme (dark or light), in the kit's tokens.

Written with [@overkube/sdk](../../packages/sdk/README.md), drawn with [@overkube/uikit](../../packages/uikit/README.md). Its stories (`*.stories.tsx`) run in Storybook, `make storybook` ([.storybook](.storybook), with [@overkube/storybook](../../packages/storybook/README.md)); its tests with [@overkube/testkit](../../packages/testkit/README.md). `npm run licenses -w @overkube/addon-core` regenerates [src/licenses.generated.ts](src/licenses.generated.ts), what the settings page says of the dependencies' licenses.

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
