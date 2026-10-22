# @overkube/addon-edit

overkube's Edit addon: changing the cluster from the page, as kubectl does it. Off until the user turns it on (Settings): till then the page reads, it does not write.

What it adds, each shown only to one who may (its verb on the kind, the access layer's):

- **a workload's replicas** in its view's footer (Deployment, StatefulSet, ReplicaSet) — `− n +`, the change applied there (✓: `spec.replicas` patched, as `kubectl scale`; ×: kept); its HorizontalPodAutoscaler marked (it sets them back within its range) ([src/scale.tsx](src/scale.tsx));
- **Restart** (Deployment, StatefulSet, DaemonSet) — its pod template annotated `kubectl.kubernetes.io/restartedAt`, as `kubectl rollout restart`;
- **Edit YAML** (every kind) — its manifest (no status, no managedFields) in the kit's `CodeEditor`: its YAML and its kind's schema checked as it is typed (the cluster's OpenAPI v3, a CRD's too: `cluster.schema()`), its fields offered; once it changes, the API server's **dry run** — what it refuses underlined at its field (a Status's `details.causes`); its changes reviewed (a diff); applied as a replace at the `resourceVersion` it was read at — one changed since refused (409), the latest reloaded, never overwritten ([src/edit-yaml.tsx](src/edit-yaml.tsx));
- **Delete** (every kind) — its dependents (by their ownerReferences: a Deployment's ReplicaSets and pods, a CronJob's Jobs and pods), `--cascade` (`background`, the default; `foreground`; `orphan`: the API's propagationPolicy), its name typed; deleted by its uid ([src/delete.tsx](src/delete.tsx));
- **Apply YAML** (the header's, before its search) — any objects, as `kubectl apply --server-side`: one document or many (`---`), a List's items, each its namespace (else `default`); each checked by the API server's dry run as it is typed (what it refuses at its line; one object alone, its kind's schema too), applied in turn in the addon's name (`--force-conflicts` takes over fields others manage), told as kubectl tells it (`deployment.apps/web serverside-applied`) ([src/apply.tsx](src/apply.tsx));
- **Cordon**, **Uncordon**, **Drain** (a node) — drained as `kubectl drain`: cordoned, then its pods evicted through the Eviction API, all at once, each one's PodDisruptionBudget respected (429: retried every 5s); grouped as kubectl tells them — evicted, held by a budget, DaemonSet-managed and mirror pods (ignored), of no controller (`--force`), emptyDir data (`--delete-emptydir-data`) — each group's flag in it ([src/drain.tsx](src/drain.tsx)).

What Flux or Helm manages (their labels: `kustomize.toolkit.fluxcd.io/*`, `helm.toolkit.fluxcd.io/*`, `app.kubernetes.io/managed-by: Helm`) is **locked** — its replicas, Edit YAML, Delete shown, not pressed, their tip saying by what: a change made here would be undone at its next reconcile or upgrade ([src/managed.ts](src/managed.ts), the SDK's `Action.locked`). Restart is not: its annotation is not theirs.

Its dialogs are opened over the page as everything opened is laid out (`OpenedView`: the user's side panel, window or whole window), from the `overlay` slot; each one is in the page's path, `&edit=<yaml|delete|drain>/<kind's ref>/<namespace>/<name>` (`&edit=apply`: Apply YAML) — linked to, reloaded, closed by Back ([src/links.ts](src/links.ts)). Its words are kubectl's: its commands, its flags' help, its messages ([src/texts.ts](src/texts.ts)).

What it costs: nothing until a dialog opens. A workload's view asks its namespace's HorizontalPodAutoscalers (its replicas' mark); Edit YAML asks its kind's group version's OpenAPI once (kept) and a dry run a moment after each change; Delete asks its namespace's ReplicaSets, Jobs and pods for its dependents; Drain asks the node's pods and the PodDisruptionBudgets.

Its stories (`make storybook`, under *edit*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
