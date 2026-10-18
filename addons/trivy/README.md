# @overkube/addon-trivy

overkube's [Trivy](https://trivy.dev) addon: what [trivy-operator](https://github.com/aquasecurity/trivy-operator) reports of the cluster — a workload's vulnerabilities, what its spec does that it should not (config audit), a role's RBAC assessment, the images the cluster runs — in Trivy's and Kubernetes' own words.

Off until the user turns it on (Settings, or the start's suggestion): it answers to `aquasecurity.github.io` served ([src/index.tsx](src/index.tsx)).

What it adds:

- **its kinds** under Security — every one of trivy-operator's reports: vulnerabilities, config audits, exposed secrets, SBOMs, RBAC and infra assessments (a namespace's and the cluster's), compliance; their tables say what each is of (its resource and container, as its labels say — an old revision's ReplicaSet its own), its worst severity in kstatus's place (a report has no status of its own; an SBOM no state at all), its counts, its image's OS — each CRD's own columns in their places, whether the CRD can be read or not ([src/columns.tsx](src/columns.tsx));
- **a report opened** — what it found: a vulnerability report its vulnerabilities (filtered by severity), a config audit's, an RBAC or infra assessment's its checks, an exposed secret report its secrets (where, what — as Trivy masks it: no secret's value is in a report), an SBOM its components, a compliance report its benchmark's controls ([src/views.tsx](src/views.tsx));
- **its fields** ([src/kinds.ts](src/kinds.ts)) — a report is of a workload by trivy-operator's labels: its key `Kind/name`, a ReplicaSet's its Deployment's too; a workload's own keys (a pod's controller's, a CronJob's Job's) — its fields joined of its reports by them: `vulnerabilities` (its worst severity: 5 critical … 1 unknown, 0 none found; no report, none), `critical_vulnerabilities`, `high_vulnerabilities` (the most of one image) — so a table sorts and filters by them (`vulnerabilities >= 4`); a Deployment's of all its ReplicaSets' reports, an old revision's too while trivy-operator keeps it (a field cannot tell which is current: its views can, and do);
- **a workload's Overview** — Vulnerabilities: a row a container (its image, its OS out of support marked EOSL), a column a severity; being scanned (trivy-operator's scan Job of it) or not scanned, said; Config Audit: its failed checks' counts, the critical and high ones a row each (opened: what is said, how to fix it), the rest when asked ([src/sections.tsx](src/sections.tsx)) — a Deployment's of its current ReplicaSet (its newest revision), not its old ones' reports kept a while;
- **a workload's Vulnerabilities tab** — an image a card (the containers running it, its OS), the worst first, each vulnerability in a table sorted as asked, all of them filtered by severity; those with nothing found, one line ([src/tab.tsx](src/tab.tsx));
- **a Role's, a ClusterRole's** RBAC Assessment, as a config audit;
- **the workloads' tables** — Vulnerabilities, not shown till turned on (the columns' More), each state as a status is drawn (its icon, its word): the worst severity found, a link to the tab; being scanned; none found; no report, not scanned;
- **the Images page** — each image once (by its digest; a Deployment's old revisions' aside: nothing runs them): its OS, each severity's count, how many workloads run it; filtered by the reports' fields (`os = alpine and critical > 0`, in its link), sorted by any column; one opened: what it is, its vulnerabilities, where it runs ([src/images.tsx](src/images.tsx));
- **the start** — the scans going on, each severity's total of the cluster's images, the most vulnerable workloads ([src/overview.tsx](src/overview.tsx)).

Its action, shown only to one who may (`delete` on `vulnerabilityreports`): **Rescan** a workload — its vulnerability reports deleted (all its ReplicaSets'), trivy-operator scans it again.

A failed scan leaves nothing in the cluster (trivy-operator deletes its Job, says why in its log alone): such a workload is *Not scanned*, its tip saying so. A `view` user reads vulnerability, config audit and exposed secret reports (trivy-operator's aggregated roles), not RBAC assessments.

Its stories (`make storybook`, under *trivy*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts). The dev stand's seed has trivy-operator and what it finds something in (`make dev-seed`: [dev/seed/85-security.yaml](../../dev/seed/85-security.yaml)).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
