# @overkube/storybook

overkube's addons in Storybook. In a `.storybook/main.ts`:

```ts
import { storybook } from '@overkube/storybook';

export default storybook({ stories: ['../src/**/*.stories.tsx'] });
```

overweave's Storybook config (its panel: the addons turned off and on, who says what), with overkube's packages read from their sources. A story draws the page with `KubeStory` from `@overkube/storybook/preact`:

```tsx
<KubeStory addons={[core, mine]} path="/k/pods.v1" cluster={(c) => c.add(Pod, make(Pod, { metadata: { name: 'a' } }))} />
```

the whole page at a path, over a cluster in memory with what the story gives it ([testkit](../testkit/README.md)'s `make`, re-exported). Storybook itself, `@storybook/preact-vite` and Vite are peer dependencies the host installs; the core's stories run with `make storybook` ([addons/core/.storybook](../../addons/core/.storybook)).

Built with `npm run build -w @overkube/storybook` (`dist/`); in the workspace read from `src/`.
