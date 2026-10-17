# @overkube/testkit

Testing overkube's addons without the page or a cluster. A cluster in memory (`fakeCluster`: its objects, what each one may do, writes recorded, refusals), objects made as the API server would have them (`make(kind, partial)`), and a world where addons run as on the page (`kubeWorld`: each with its contributor and its `Ctx`; `addonRun`, `addonEnv`) — with overweave's checks over it (`assertContributions`, `assertNoConflicts`, `assertNothingRefused`, `assertSays`, …).

```ts
import { kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';

const world = kubeWorld();
world.cluster.add(kinds.core.v1.Pod, make(kinds.core.v1.Pod, { metadata: { name: 'a', namespace: 'media' } }));
world.addon(core);
world.addon(mine);
const page = renderPage(world, '/k/pods.v1');
// … world.dispose()
```

`@overkube/testkit/preact` — an addon's drawing: the whole page at a path (`renderPage`: the [shell](../shell/README.md)'s frame, the addons' fills, read as its user sees it), one slot (`renderSlot`, `mount`), render counts, `act`, `cleanup`.

Used by the [core addon](../../addons/core/README.md)'s tests and by [storybook](../storybook/README.md). Built with `npm run build -w @overkube/testkit` (`dist/`); in the workspace read from `src/`.
