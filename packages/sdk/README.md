# @overkube/sdk

What overkube's addons are written with: the dashboard's kinds over [overweave](https://github.com/overweave/overweave) — `KindView`, `Category`, `Column`, `NameMark` (a mark beside an object's name in its kind's tables and in its view, its detail under Managed By: what manages it — `addNameMark` marks a workload's pods and replica sets too), `MapScope` (an object's map, its view's Map tab, by its kind: a hook making its graph — cards by `mapCard`), `Field`, `TableView`, `Page`, `Action`, `MenuItem`, `Appearance`, `AddonChoices`, `Namespaces`, `Messages`, `Language`, and the UI's `Slot`, `Fill`, `Wrap` — its slots (`slots`), the usual definitions written short (`column`, `section`, `action`, `menuItem`, `tile`, `wrap`), `defineAddon`, and what an addon is given when it runs: its `Ctx` — its contributor (a priority, rights) and the cluster (`Cluster`: queries, live; `Reach`: a workload's port as data).

```ts
import { column, defineAddon } from '@overkube/sdk';
import { kinds } from '@overkube/kube-types';

export default defineAddon({
  id: 'mine',
  title: 'Mine',
  setup(ctx) {
    // A column of every Pod's table: its definition's name, what it shows (format over the fields it asks by, values), how it sorts.
    ctx.contributor.add('Column', 'mine.node', column({ kinds: [kinds.core.v1.Pod], header: 'Node', values: ['pods.v1.node'], sort: 'pods.v1.node' }));
  },
});
```

`ctx.contributor` is overweave's contributor for this addon (`add`, `patch`, with its priority and rights); `ctx.cluster` the cluster; `ctx.notify`, `ctx.effect`, `ctx.onDispose`, `ctx.signal` its lifetime; `ctx.using('VictoriaMetrics over time')` what it uses now, said in Settings.

When it runs, and where it belongs: `requires` — a condition that must hold for it to run (a group served, an APIService available, a service another addon provides, a Service `found` in the cluster); `answers` — what it answers to, each a title and such a condition, checked as the one signed in sees the cluster and listed in Settings (found where, not, not known yet). An addon's or a plugin's is off until the user turns it on (`AddonChoices`, theirs, kept in their browser); off, with one of its answers found, the overview suggests it. The core's and the built-in ones are always on.

```ts
answers: [
  { title: 'metrics-server', when: { available: 'v1beta1.metrics.k8s.io' } },
  { title: 'VictoriaMetrics', when: { found: { service: ['vmsingle-*', 'vmselect-*'], port: 8428 } } },
],
```

A Service its answers look for is where it is (`ctx.cluster.found(spec)`: a target, none, not known yet — followed where read), and the addon reaches it (`ctx.cluster.proxy(target)`: the API server's service proxy, as the one signed in) beside those it says in `reaches` — no other.

What it writes, as the one signed in: `ctx.cluster.patch(kind, object, change)` (a merge, JSON, strategic patch or a server-side apply; `subresource: 'status'`), `ctx.cluster.update(kind, object, { subresource })` (the whole object, as `kubectl replace` — a status where RBAC allows `update` alone), `ctx.cluster.remove(kind, object)`. An action says what it `needs` (a verb on its kind, a subresource, another resource), and one who may not is not shown it.

What addons share of the dashboard's look: `lookOf` (a state's look, of a kind's `StatusLook`), `humanDuration` and `shortTime` (an age as kubectl says it; a time as the page's clock shows it), `parseCertificate`, `parseRequest` (an X.509 certificate's, a request's PEM read: names, dates, key); in `@overkube/sdk/preact`, `StatusOf` (a state drawn) and `ObjectRef` (an object, a link to it).

`@overkube/sdk/preact` — an addon's components: the cluster (`KubeProvider`, `useCluster`), queries answered live while drawn (`useList`, `useLists` — as many as wanted —, `useCount`, `useGet`, `useFields`, `useLog`, `useOwned`, `useSearch`, `useSize`), the page (`usePage`, `usePageProps`, `useNotify`, `useOpened`), a kind's table wherever it is wanted (`KindTable`), a table of no one kind set out as the user sets it, kept (`useTableView`), the user's changes (`UserProvider`, `useUser`), and `fill()` typed by the dashboard's slots (overweave's, with `Slot` and `Wrapped`).

Who draws what: the [shell](../shell/README.md) the frame and the `Page` at the path; the [core addon](../../addons/core/README.md) the rest, each a default another addon's takes the place of. An addon's own components are drawn in the [kit](../uikit/README.md)'s tokens (`var(--uk-accent)`, …), never colours of their own, so a theme reaches them too. Tested with the [testkit](../testkit/README.md), shown with [storybook](../storybook/README.md), run by the [runtime](../runtime/README.md).

Built with `npm run build -w @overkube/sdk` (`dist/`); in the workspace read from `src/` (the `overkube-source` condition).
