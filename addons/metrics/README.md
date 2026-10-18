# @overkube/addon-metrics

overkube's metrics addon: what pods and nodes use — now, as [metrics-server](https://github.com/kubernetes-sigs/metrics-server) says it (the `metrics.k8s.io` API, what `kubectl top` reads), and over time where the cluster keeps it: a VictoriaMetrics or a Prometheus found in it. Either is enough; what only history gives (a line, a chart) is there with it.

Off until the user turns it on (Settings, or the start's suggestion once what it answers to is found here). What it answers to ([src/index.tsx](src/index.tsx)):

- **metrics-server** — the APIService `v1beta1.metrics.k8s.io` available. Pods' and nodes' use is listed (never watched: the API serves no watch), its own fields over it ([src/kinds.ts](src/kinds.ts): a pod's CPU and memory summed of its containers, in CEL) — so a list sorts by them and a count sums them — and a pod's and a node's own, joined of them (`metrics.pods.cpu`, …: the same namespace and name), so their tables sort by what is used now;
- **VictoriaMetrics** — a Service `vmsingle-*` or `*-victoria-metrics-single-server`;
- **Prometheus** — a Service `prometheus`, `prometheus-operated`, `prometheus-server`, `*-prometheus` or `*-prometheus-server`, port 9090.

History is asked of the first found, through the API server's service proxy as the one signed in (RBAC: `get` on `services/proxy` there) — the query API both have, PromQL of the kubelet's cAdvisor series ([src/history.ts](src/history.ts)): a container's `container_*` series with an image (the kubelet's resource metrics, if kept too, say the same again), a pod's network its sandbox's. An addon reaches the Services its answers find, and no other.

What it adds:

- **columns** — CPU and memory in the pods' table, CPU Usage and Memory Usage in the nodes' (beside the core's capacity): now, the last hour's line before it where history is kept, near its limit (a node's: allocatable) a warning, over it an error; requests and limits in its tip ([src/columns.tsx](src/columns.tsx)). The lines of a table are asked together, a query a namespace, again each minute while drawn;
- **the start** — CPU and memory used of what the nodes have allocatable, under capacity; Top pods — those using the most, by CPU or memory ([src/overview.tsx](src/overview.tsx));
- **a Metrics tab** of a pod and a node — now (a pod's each container), then a range of charts: CPU, memory (requests and limit marked), a pod's CPU throttled and network ([src/tab.tsx](src/tab.tsx)).

Its stories (`make storybook`, under *metrics*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts) with a VictoriaMetrics answering. The dev stand's seed has both (`make dev-seed`: [dev/seed/80-metrics.yaml](../../dev/seed/80-metrics.yaml)).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
