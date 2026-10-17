# @overkube/cel

CEL as overkube's fields have it, the same on the page and on Node (over `@marcbachmann/cel-js`): one object as `self`, a missing value none rather than an error, integers as integers, Kubernetes' quantity (`parseQuantity`, `Quantity`) and lists functions. `createCel(options)` compiles and runs programs (`CelProgram`, `CelError`); `prepareCatalog` and `layer` make a catalog of fields' CEL ready, in layers, with a version (`versionOf`).

Also the page's filter language over it: `planFilter`, `filterParts`, `filterVariables`, `filterCaret` (what is at the caret, for suggestions), `looseFilter`, `resugar`; and label selectors as CEL (`selectorCel`, `requirementCel`, `looseCel`).

Used by [kube-fields](../kube-fields/README.md) (fields worked out by CEL) and the [core addon](../../addons/core/README.md) (its filter). Built with `npm run build -w @overkube/cel` (`dist/`); in the workspace read from `src/`.
