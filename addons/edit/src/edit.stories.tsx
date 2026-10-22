import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { editCluster } from './cluster.fixture.ts';
import edit from './index.tsx';

/*
 * The Edit addon on the page, over a cluster in memory (cluster.fixture):
 * a workload's view — its replicas, Restart, Edit YAML, Delete; what Flux
 * or Helm manages, locked; each dialog as a link opens it (&edit=): Edit
 * YAML (type in it: its schema's fields offered, the server's dry run as
 * it changes), Delete (its dependents, --cascade), a node drained.
 */

export default { title: 'edit/Edit addon', parameters: { controls: { disable: true } } };

const Page = ({ path }: { path: string }) => <KubeStory addons={[core, edit]} path={path} cluster={(c) => editCluster(c)} />;
const D = 'deployments.v1.apps';
const opened = (ref: string, ns: string | undefined, name: string) => `/k/${ref}?open=${ref}/${ns ? `${ns}/` : ''}${name}`;

/** A Deployment opened: its replicas in its footer (− n +; its HorizontalPodAutoscaler marked), Restart, Edit YAML, Delete. */
export const Actions = () => <Page path={opened(D, 'shop', 'api')} />;
/** What Flux applies: its replicas, Edit YAML, Delete locked — their tip saying by what; Restart not. */
export const ManagedByFlux = () => <Page path={opened(D, 'shop', 'web')} />;
/** What a Helm release made: locked the same, its tip the release’s. */
export const ManagedByHelm = () => <Page path={opened(D, 'shop', 'cache')} />;
/** Edit YAML: its manifest (no status, no managedFields), its schema’s fields offered as one types, the server’s dry run once it changes. */
export const EditYaml = () => <Page path={`${opened(D, 'shop', 'api')}&edit=yaml/${D}/shop/api`} />;
/** Delete: its dependents (a ReplicaSet, its pods), --cascade, its name typed. */
export const Delete = () => <Page path={`${opened(D, 'shop', 'api')}&edit=delete/${D}/shop/api`} />;
/** Delete a CronJob: its Jobs and their pods its dependents. */
export const DeleteCronJob = () => <Page path={`${opened('cronjobs.v1.batch', 'shop', 'nightly')}&edit=delete/cronjobs.v1.batch/shop/nightly`} />;
/** Apply YAML (the header's): any objects, kubectl apply --server-side — each checked by the server’s dry run as it is typed. */
export const ApplyYaml = () => <Page path="/k/pods.v1?edit=apply" />;
/** A node: Cordon, Drain. */
export const Node = () => <Page path={opened('nodes.v1', undefined, 'node-a')} />;
/** A cordoned node: Uncordon. */
export const Cordoned = () => <Page path={opened('nodes.v1', undefined, 'node-b')} />;
/** Drain: its pods as kubectl drain groups them — evicted, a budget’s, DaemonSet-managed, of no controller (--force), emptyDir (--delete-emptydir-data). */
export const Drain = () => <Page path={`${opened('nodes.v1', undefined, 'node-a')}&edit=drain/nodes.v1/node-a`} />;
