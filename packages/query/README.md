# @overkube/query

What overkube asks of a cluster's data, as data — pure, with no dependencies: the page answers from what it watches, a server could from its indexes, and nothing that asks has to know which.

- **fields** (`FieldDef`, `defineField`, `checkFieldDef`, `fieldsOf`): a value by a path into the object, worked out of it by CEL, or joined (`Join`: a field of another kind's object of the same namespace and name — a pod's metrics; or, keyed (`by`, `to`, `reduce`), of those of its namespace whose field `to` is its own `by`, reduced to the greatest, a sum or how many — a workload's reports); its type, unit, how it sorts;
- **queries** (`GetQuery`, `ListQuery`, `CountQuery`, `SearchQuery`, `LogQuery`): one object, a window of a list (`Where`, `Sort`, `Page`), a count by a field, a search, a log's window; checked (`checkQuery`) and bounded (`LIMITS`, `FIELD_LIMITS`);
- **results** (`Result`, `Live`, `State`): live while read, with their state and errors;
- **access** (`AccessRule`, `allowed`, `ruleAllows`): what one may do, as a SelfSubjectRulesReview tells it;
- **a scan** (`scan`, `scanCount`, `windowOf`, `matches`, `ordered`): a query answered over the objects given; a log's window picked out of its lines (`logWindow`, `entriesOf`);
- **kubectl's JSONPath** (`compilePath`, `valuesAt`, `isPath`), and canonical hashing (`canonical`, `fnv1a`).

Used by the [source](../source/README.md) (the answers), the [connector](../connector/README.md), the [gateway](../gateway/README.md), [cel](../cel/README.md) and [kube-fields](../kube-fields/README.md). `npm run stress -w @overkube/query` runs the scan's stress test.

Built with `npm run build -w @overkube/query` (`dist/`); in the workspace read from `src/`.
