# @overkube/kube-types

Kubernetes object types for overkube and its addons, generated from a cluster's OpenAPI v3 schemas by [@overkube/typegen](../typegen/README.md); one file per group and version in [src/gen](src/gen), imported as such:

```ts
import type { Pod } from '@overkube/kube-types/core/v1';
import type { Deployment } from '@overkube/kube-types/apps/v1';
import { kinds, type KubeObject, type KindInfo, type ObjectOf } from '@overkube/kube-types';
```

The root exports the kinds table (`kinds.apps.v1.Deployment`: a `KindInfo` — group, version, kind, plural, namespaced, verbs), `knownKinds` (every kind the table knows, before a cluster's discovery says), `KindMap` and `ObjectOf<K>` (the type of a kind's objects), `apiVersion`, and what any object is (`KubeObject`).

Regenerated against a cluster with `overkube-typegen built-in --url http://127.0.0.1:8001 --out packages/kube-types/src/gen` behind `kubectl proxy`. The descriptions in the generated types are the Kubernetes API's, under the Apache License 2.0 ([NOTICE](NOTICE), [APACHE-2.0.txt](APACHE-2.0.txt)).

Built with `npm run build -w @overkube/kube-types` (`dist/`); in the workspace read from `src/`.
