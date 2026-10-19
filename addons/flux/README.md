# @overkube/addon-flux

overkube's [Flux](https://fluxcd.io) addon: what Flux delivers — its sources, Kustomizations and HelmReleases, their state, the revision applied, what each manages — in Flux's own words, as `flux get`, `flux reconcile`, `flux suspend` and its controllers say them.

Off until the user turns it on (Settings, or the start's suggestion): it answers to `source.toolkit.fluxcd.io` served ([src/index.tsx](src/index.tsx)).

What it adds:

- **its kinds** under Delivery (beside Helm), each its own table — no page of its own: Kustomizations, HelmReleases, GitRepositories, OCIRepositories, HelmRepositories, HelmCharts, Buckets, ExternalArtifacts ([src/kinds.ts](src/kinds.ts): their fields, in CEL);
- **their tables** — their state in kstatus's place, as Flux leaves it: Ready, Reconciling (how long), its Ready condition's reason, Suspended; Flux's words its tip (its CRD's Ready and Status not drawn beside it). A source's URL and ref (a Bucket's endpoint and bucket, a HelmChart's chart and version), its artifact — a fetch failing, the last one still served, marked so — and what uses it, counted (a join of each kind that names it, across namespaces: a HelmRelease's HelmChart is its HelmRepository's namespace's). A Kustomization's, a HelmRelease's source and path or chart, the revision applied → the one attempted (on its way, or failing: both), Flux's message ([src/columns.tsx](src/columns.tsx));
- **one opened** — a Kustomization's, a HelmRelease's source as it is now (failing: its last artifact still served, no newer revision applied); a source's, what uses it (their own tables); a Kustomization's Inventory, each object it applied as it is now (one query a kind, by their names) ([src/view.tsx](src/view.tsx));
- **the start** — what is not Ready, failing first, then those on their way; how many are Ready and Suspended beside ([src/overview.tsx](src/overview.tsx));
- **what Flux applied** — marked beside its name in every table (its `kustomize.toolkit.fluxcd.io` or `helm.toolkit.fluxcd.io` labels): a deployment's pods and replica sets, a stateful set's and a daemon set's pods, by their workload's; its tip names what applied it and the revision applied (asked only once the tip is open); in its view, after its title, and under Managed By: what applied it as it is now, the revision applied → attempted, its source ([src/mark.tsx](src/mark.tsx), a `NameMark` by `addNameMark`).

Its actions, as the flux CLI does them, each shown only to one who may patch the object ([src/actions.ts](src/actions.ts)):

- **Reconcile** — its `reconcile.fluxcd.io/requestedAt` annotation set to now: its controller reconciles it at once; **Reconcile with source** (a Kustomization, a HelmRelease) — its source's first, as `flux reconcile --with-source`;
- **Suspend**, **Resume** — `spec.suspend` set; unset, and reconciled at once, as `flux resume`.

What it costs: its kinds are asked only where they are shown (the start's panel, each served kind's state fields; a source's table, the kinds that use sources, joined — watched in every namespace). A pod's mark is its workload's, joined once of each workload kind by the workload it is of (`pods.v1.workload`: a deployment's pod, by its pod-template-hash — not a join through its replica set): a table of pods watches its namespaces' deployments, stateful sets and daemon sets. Revisions in the tips: asked when a tip opens.

Its stories (`make storybook`, under *flux*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts). The dev stand's seed has Flux delivering from a git server in the cluster, over SSH (`make dev-seed`: [dev/seed/95-flux.yaml](../../dev/seed/95-flux.yaml) — its keys made anew each time by [dev/seed/git.sh](../../dev/seed/git.sh), none kept in the repository).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
