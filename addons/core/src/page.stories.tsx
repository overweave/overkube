import { kinds } from '@overkube/kube-types';
import { column, defineAddon } from '@overkube/sdk';
import { KubeStory } from '@overkube/storybook/preact';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/*
 * A kind's page, as the core draws it: its table (its rows, on their way,
 * coming in; refused by the cluster) — and an addon's column in it.
 */

export default { title: 'core/Kind page' };

const { Pod } = kinds.core.v1;

/** Pods: the core's columns, its rows. */
export const Pods = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} />;

/** Its rows on their way: as the table will be, its rows waiting. */
export const Loading = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'loading')} />;

/** Loading, then its rows: they come in where the placeholders were, the placeholders more than them fold away. Again: reload the story. */
export const Arriving = () => (
  <KubeStory
    addons={[core]}
    path="/k/pods.v1"
    cluster={(c) => {
      c.state(Pod, 'loading');
      setTimeout(() => {
        shop(c);
        c.state(Pod, 'live');
      }, 1500);
    }}
  />
);

/** Refused by the cluster: said why. */
export const Forbidden = () => (
  <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'pods is forbidden' })} />
);

/** An addon's own field and column: a pod's first image, its tag. */
const images = defineAddon({
  id: 'images',
  title: 'Images',
  setup: ({ contributor }) => {
    contributor.add('Field', 'images.image', { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' });
    contributor.add('Column', 'images.tag', column({ kinds: [Pod], header: 'Tag', order: 20, sort: 'images.image', format: ([image]) => String(image ?? '').split(':')[1] ?? '' }));
  },
});
export const AnAddonsColumn = () => <KubeStory addons={[core, images]} path="/k/pods.v1" cluster={shop} />;

Pods.storyName = 'Pods';
Loading.storyName = 'Pods - loading';
Arriving.storyName = 'Pods - arriving';
Forbidden.storyName = 'Pods - refused';
AnAddonsColumn.storyName = 'Pods - an addon’s column';
