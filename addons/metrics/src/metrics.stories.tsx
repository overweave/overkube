import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { METRICS_KINDS, metricsCluster } from './cluster.fixture.ts';
import metrics from './index.tsx';

/*
 * The metrics addon on the page, over a cluster in memory: metrics-server's
 * now in the pods' and nodes' tables, the start's capacity and the pods
 * using the most, a pod's and a node's Metrics tab — with a VictoriaMetrics
 * found (an hour of each kept), and without one (now alone).
 */

export default { title: 'metrics/Metrics addon', parameters: { controls: { disable: true } } };

const Page = ({ path, history = true }: { path: string; history?: boolean }) => (
  <KubeStory addons={[core, metrics]} kinds={METRICS_KINDS} path={path} cluster={(c) => metricsCluster(c, { history })} />
);

/** The pods' table: CPU and memory now, the last hour beside each. */
export const Pods = () => <Page path="/k/pods.v1" />;

/** The same with metrics-server alone: now, no line — narrower. */
export const PodsNowOnly = () => <Page path="/k/pods.v1" history={false} />;

/** The nodes' table: what each uses beside its capacity. */
export const Nodes = () => <Page path="/k/nodes.v1" />;

/** The start: what is used of what the nodes have (under capacity), the pods using the most. */
export const Overview = () => <Page path="/" />;

/** A pod opened: its Metrics tab — its containers now, then a range of charts. */
export const PodTab = () => <Page path="/k/pods.v1?open=pods.v1/shop/api-7f9c-x2kqp" />;

/** A node opened: its Metrics tab. */
export const NodeTab = () => <Page path="/k/nodes.v1?open=nodes.v1/kube-1" />;

/** A pod opened with metrics-server alone: what would draw the hours, said where they would be. */
export const PodTabNowOnly = () => <Page path="/k/pods.v1?open=pods.v1/shop/api-7f9c-x2kqp" history={false} />;
