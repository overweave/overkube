# @overkube/source

overkube's answers to queries ([@overkube/query](../query/README.md)) from the cluster's data as the page watches it. `createSource(connector, options)` plans each query onto feeds ([@overkube/connector](../connector/README.md)) — the fewest that hold what it asks, a namespace or a name told to the API server, the namespaces one may not list denied — with the kind's fields ([@overkube/kube-fields](../kube-fields/README.md), a CRD's columns) and those addons add in layers (`options.layers`) — a joined field read of the other kind's feeds, for the queries that ask by it, again as they change — and answers by a scan whenever the result is read after its feeds changed: a `Source` ([@overkube/query](../query/README.md)'s interface), with `get`, `list`, `count`, `search`, `log`, `fields`, `size`, `owned`, `access`.

`memorySource(options)` is the same over objects in memory, no cluster: what the [testkit](../testkit/README.md) and Storybook stories answer with. A server could answer the same queries from its indexes, and nothing that asks has to know which.

Built with `npm run build -w @overkube/source` (`dist/`); in the workspace read from `src/`. Tested on Node against the [fake API server](../fake-kube/README.md).
