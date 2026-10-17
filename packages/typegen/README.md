# @overkube/typegen

TypeScript types from a Kubernetes cluster's OpenAPI v3 schemas: the built-in kinds for [@overkube/kube-types](../kube-types/README.md), or an addon's groups (a CRD's, an aggregated API's). A CLI, `overkube-typegen` ([src/cli.ts](src/cli.ts)):

```bash
kubectl proxy &                                                   # the API at http://127.0.0.1:8001
overkube-typegen list     --url http://127.0.0.1:8001             # the groups beyond the built-in ones, with their kinds
overkube-typegen built-in --url http://127.0.0.1:8001 --out packages/kube-types/src/gen
overkube-typegen group cert-manager.io --url http://127.0.0.1:8001 --out src/gen [--types @overkube/kube-types]
```

`built-in` writes one file per group-version (`core/v1.ts`, `apps/v1.ts`, …) and `kinds.ts`, the kinds table. `group` does the same for the groups named, every version the cluster serves, importing the built-in types they use from `--types` and extending its `KindMap` with their kinds. The output folder is emptied first; one with files in it that were not generated is left alone. The URL may also be overkube's own server's gateway (`https://…/kube`, with what it needs to be let in).

As a library: `fetchGroups`, `fetchSnapshot`, `generate`, `locate`, and the schema types. Built with `npm run build -w @overkube/typegen` (`dist/`, the CLI among it).
