import { KubeStory } from '@overkube/storybook/preact';
import core from '../index.tsx';
import { mapCluster } from './cluster.fixture.ts';

/* An object's map, its view's Map tab: a Deployment's, a pod's, a node's, a namespace's. */

export default { title: 'core/Map', parameters: { controls: { disable: true } } };

const Page = ({ path }: { path: string }) => <KubeStory addons={[core]} path={path} cluster={mapCluster} />;
const open = (ref: string, at: string) => `/k/${ref}?open=${ref}/${at}&open-tab=core.map`;

/** A Deployment's: what comes in to it, what scales it, what it reads, where it runs. */
export const ADeployment = () => <Page path={open('deployments.v1.apps', 'shop/api')} />;
/** A pod's: it, its workload, its node. */
export const APod = () => <Page path={open('pods.v1', 'shop/api-7d4b9-b')} />;
/** A node's: the pods on it, a frame a namespace, their workloads. */
export const ANode = () => <Page path={open('nodes.v1', 'node-a')} />;
/** A namespace's: its objects, what is named but not there. */
export const ANamespace = () => <Page path={open('namespaces.v1', 'shop')} />;
