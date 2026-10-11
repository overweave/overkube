import { kinds } from '@overkube/kube-types';
import { column, defineAddon, PENDING } from '@overkube/sdk';
import { KubeStory, make } from '@overkube/storybook/preact';
import core from './index.tsx';

/*
 * The core's page, as an addon's author would show theirs beside it: a
 * kind's table, an object over it, the menu instead of the tabs, a kind the
 * cluster refuses. The data is the story's own.
 */

export default { title: 'core' };

const { Pod, Namespace } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

const shop = (c: Parameters<NonNullable<Parameters<typeof KubeStory>[0]['cluster']>>[0]) => {
  c.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
  for (const name of ['web-1', 'web-2', 'db-0']) c.add(Pod, make(Pod, { metadata: { name, namespace: 'shop' }, spec: { containers: [{ name: 'a', image: 'nginx:1.27' }] } }));
  c.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { replicas: 2, selector: {}, template: {} } }));
};

export const Table = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} />;

export const AnObject = () => <KubeStory addons={[core]} path="/k/pods.v1/shop/web-1" cluster={shop} />;

export const SideMenu = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps" cluster={shop} user={(u) => u.patch('NavView', 'default', { mode: 'side' })} />;

export const Forbidden = () => (
  <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'pods is forbidden' })} />
);

export const Light = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} theme="light" />;

/** The table while its rows are on their way: as it will be, its rows waiting. */
export const Loading = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'loading')} />;

/** An addon's column whose values come later (metrics): those not there yet wait in their cells. */
const metrics = defineAddon({
  id: 'metrics',
  title: 'Metrics',
  setup: ({ contributor }) =>
    void contributor.add('Column', 'metrics.cpu', column({ kinds: [Pod], header: 'CPU', order: 20, value: (p) => (p.metadata?.name === 'db-0' ? PENDING : '12m') })),
});
export const PendingCells = () => <KubeStory addons={[core, metrics]} path="/k/pods.v1" cluster={shop} />;

/** An addon's theme, chosen by the user: the same page in its colours. */
const nord = defineAddon({
  id: 'nord',
  title: 'Nord',
  setup: ({ contributor }) =>
    void contributor.add('Theme', 'nord', {
      title: 'Nord',
      dark: { bg: '#2e3440', panel: '#3b4252', 'panel-2': '#434c5e', border: '#4c566a', text: '#eceff4', muted: '#a3abb9', accent: '#88c0d0', 'on-accent': '#2e3440' },
      light: { bg: '#eceff4', panel: '#e5e9f0', 'panel-2': '#d8dee9', border: '#c8d0dc', text: '#2e3440', muted: '#4c566a', accent: '#5e81ac', 'on-accent': '#eceff4' },
    }),
});
export const ATheme = () => <KubeStory addons={[core, nord]} path="/k/pods.v1" cluster={shop} theme="dark" user={(u) => u.patch('Appearance', 'default', { theme: 'nord' })} />;

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
