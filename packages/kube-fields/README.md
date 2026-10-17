# @overkube/kube-fields

The fields Kubernetes objects are asked by before any addon adds to them — as data (paths, CEL; [@overkube/query](../query/README.md)'s `FieldDef`), so the page and a server answer by them alike. Every object's (`COMMON`: name, namespace, labels, age, …); the built-in kinds' own (`PODS`, `NODES`, `WORKLOADS`, `BATCH`, `CONFIG`, `EVENTS`, the status and health of each: `STATUS`, `HEALTH`; what kubectl prints: `PRINTERS`); a CRD's additional printer columns (`crdFields`); together, for a kind (`baseFields`, `BUILT_IN`). `define` writes them; `LIBRARY` holds the CEL functions they call (`podSummary`, …), run by [@overkube/cel](../cel/README.md).

Used by the [source](../source/README.md) as the first layer of every kind's fields. Built with `npm run build -w @overkube/kube-fields` (`dist/`); in the workspace read from `src/`.
