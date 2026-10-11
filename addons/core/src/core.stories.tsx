import { kinds } from '@overkube/kube-types';
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
