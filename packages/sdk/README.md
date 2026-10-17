# @overkube/sdk

What overkube's addons are written with: the dashboard's kinds over [overweave](https://github.com/overweave/overweave) — `KindView`, `Category`, `Column`, `Field`, `TableView`, `Page`, `Action`, `MenuItem`, `Appearance`, `Namespaces`, `Messages`, `Language`, and the UI's `Slot`, `Fill`, `Wrap` — its slots (`slots`), the usual definitions written short (`column`, `section`, `action`, `menuItem`, `tile`, `wrap`), `defineAddon`, and what an addon is given when it runs: its `Ctx` — its contributor (a priority, rights) and the cluster (`Cluster`: queries, live; `Reach`: a workload's port as data).

```ts
import { column, defineAddon } from '@overkube/sdk';
import { kinds } from '@overkube/kube-types';

export default defineAddon({
  id: 'mine',
  setup(ctx) {
    // A column of every Pod's table: its definition's name, what it shows (format over the fields it asks by, values), how it sorts.
    ctx.contributor.add('Column', 'mine.node', column({ kinds: [kinds.core.v1.Pod], header: 'Node', values: ['pods.v1.node'], sort: 'pods.v1.node' }));
  },
});
```

`ctx.contributor` is overweave's contributor for this addon (`add`, `patch`, with its priority and rights); `ctx.cluster` the cluster; `ctx.notify`, `ctx.effect`, `ctx.onDispose`, `ctx.signal` its lifetime.

`@overkube/sdk/preact` — an addon's components: the cluster (`KubeProvider`, `useCluster`), queries answered live while drawn (`useList`, `useCount`, `useGet`, `useFields`, `useLog`, `useOwned`, `useSearch`, `useSize`), the page (`usePage`, `usePageProps`, `useNotify`, `useOpened`), a kind's table wherever it is wanted (`KindTable`), the user's changes (`UserProvider`, `useUser`), and `fill()` typed by the dashboard's slots (overweave's, with `Slot` and `Wrapped`).

Who draws what: the [shell](../shell/README.md) the frame and the `Page` at the path; the [core addon](../../addons/core/README.md) the rest, each a default another addon's takes the place of. An addon's own components are drawn in the [kit](../uikit/README.md)'s tokens (`var(--uk-accent)`, …), never colours of their own, so a theme reaches them too. Tested with the [testkit](../testkit/README.md), shown with [storybook](../storybook/README.md), run by the [runtime](../runtime/README.md).

Built with `npm run build -w @overkube/sdk` (`dist/`); in the workspace read from `src/` (the `overkube-source` condition).
