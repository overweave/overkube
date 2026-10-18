# @overkube/addon-helm

overkube's [Helm](https://helm.sh) addon: what helm deployed, as helm itself keeps it — its releases' Secrets (`sh.helm.release.v1.<name>.v<revision>`, `owner=helm`), whoever ran helm: a person, a CI job, a controller. In helm's own words, as `helm list`, `helm status`, `helm history` and `helm get` say them.

Off until the user turns it on (Settings): reading releases is reading Secrets, which a `view` role cannot.

What it adds:

- **its page**, Helm — every release once (its latest revision): its chart and version, its app version, its state (`deployed`, `failed`, `pending-upgrade`…), its revision, when it changed; those not well first; filtered, set out and sorted as the user sets it, kept ([src/page.tsx](src/page.tsx));
- **a release opened** (in the page's link: `?release=<namespace>/<name>`) — Overview: its state and why (failed: helm's words; stuck pending: what that means and the `helm rollback` that undoes it — or, its first install stuck, the `helm uninstall`), its chart, its revision, when deployed, what its manifest made as it is now, its notes; Values: those given, or with the chart's own (the chart's alone: its subcharts' defaults are not merged in, as `helm get values --all` does); Manifest: what helm applied; History: each revision, two of them compared — their values or their manifests ([src/view.tsx](src/view.tsx));
- **the start** — the releases not well, each why; all well, no panel ([src/overview.tsx](src/overview.tsx));
- **the tables** — what helm made (its `meta.helm.sh/release-name` annotation), marked beside its name: helm's mark, its release in its tip, a link to it ([src/mark.tsx](src/mark.tsx), a `NameMark`).

A release is listed by its Secrets' labels alone; only the revisions shown are decoded. The Secrets themselves are still watched whole, every one of the namespaces shown (owner=helm picked out in the browser, not by a label selector) (gzip'd JSON, base64'd twice: [src/release.ts](src/release.ts)). Nothing is done to a release (rollback, uninstall: helm's own work, client side).

Its stories (`make storybook`, under *helm*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts). The dev stand's seed has releases made by helm itself (`make dev-seed`: [dev/seed/90-helm.yaml](../../dev/seed/90-helm.yaml) — installed and upgraded, failed, uninstalled with its history kept).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
