import { kinds } from '@overkube/kube-types';
import { column, defineAddon } from '@overkube/sdk';
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
  for (const name of ['web-2', 'db-0']) c.add(Pod, make(Pod, { metadata: { name, namespace: 'shop' }, spec: { containers: [{ name: 'a', image: 'nginx:1.27' }] } }));
  // One as a cluster has it: its labels, its owner, its status and conditions.
  const started = new Date(Date.now() - 50 * 60_000).toISOString();
  c.add(
    Pod,
    make(Pod, {
      metadata: {
        name: 'web-1',
        namespace: 'shop',
        labels: { app: 'web', 'pod-template-hash': '7d4b9' },
        annotations: { 'kubectl.kubernetes.io/restartedAt': started },
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-7d4b9', uid: 'rs-1', controller: true }],
      },
      spec: { nodeName: 'node-1', containers: [{ name: 'a', image: 'nginx:1.27' }] },
      status: {
        phase: 'Running',
        podIPs: [{ ip: '10.42.0.12' }],
        containerStatuses: [{ name: 'a', image: 'nginx:1.27', imageID: '', ready: true, restartCount: 0, started: true, state: { running: { startedAt: started } } }],
        conditions: [
          { type: 'PodScheduled', status: 'True', lastTransitionTime: started },
          { type: 'Initialized', status: 'True', lastTransitionTime: started },
          { type: 'ContainersReady', status: 'True', lastTransitionTime: started },
          { type: 'Ready', status: 'True', lastTransitionTime: started },
        ],
      },
    }),
  );
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'web', namespace: 'shop' },
      spec: { replicas: 2, selector: {}, template: {} },
      status: {
        readyReplicas: 1,
        updatedReplicas: 2,
        availableReplicas: 1,
        conditions: [
          { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message: 'Deployment has minimum availability.', lastTransitionTime: started },
          { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'ReplicaSet "web-7d4b9" has timed out progressing.', lastTransitionTime: started },
        ],
      },
    }),
  );
};

export const Table = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} />;

export const AnObject = () => <KubeStory addons={[core]} path="/k/pods.v1?open=pods.v1/shop/web-1" cluster={shop} />;
export const ADeployment = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps?open=deployments.v1.apps/shop/web" cluster={shop} />;

export const SideMenu = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps" cluster={shop} user={(u) => u.patch('NavView', 'default', { mode: 'side' })} />;

export const Forbidden = () => (
  <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'pods is forbidden' })} />
);

export const Light = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} theme="light" />;

/** The table while its rows are on their way: as it will be, its rows waiting. */
export const Loading = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'loading')} />;

/** An addon's own field and column: a pod's first image, its tag drawn as a badge. */
const images = defineAddon({
  id: 'images',
  title: 'Images',
  setup: ({ contributor }) => {
    contributor.add('Field', 'images.image', { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' });
    contributor.add('Column', 'images.tag', column({ kinds: [Pod], header: 'Tag', order: 20, sort: 'images.image', format: ([image]) => String(image ?? '').split(':')[1] ?? '' }));
  },
});
export const AnAddonsColumn = () => <KubeStory addons={[core, images]} path="/k/pods.v1" cluster={shop} />;

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

/** A language pack (a few of the core's keys in Polish), the user's language set to it: the rest is said in English. */
const polish = defineAddon({
  id: 'lang-pl',
  title: 'Polski',
  setup: ({ contributor }) =>
    void contributor.add('Messages', 'pl:core', {
      messages: {
        'core.column.name': 'Nazwa',
        'core.column.namespace': 'Przestrzeń nazw',
        'core.column.age': 'Wiek',
        'core.nav.kinds': 'Rodzaje',
        'core.nav.picker.all': 'Wszystkie rodzaje',
      },
    }),
});
export const InPolish = () => <KubeStory addons={[core, polish]} path="/k/pods.v1" cluster={shop} locale="pl" />;
