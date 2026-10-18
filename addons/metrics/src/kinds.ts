import type { KindInfo } from '@overkube/kube-types';
import type { FieldSpec } from '@overkube/sdk';

/*
 * What metrics-server serves (metrics.k8s.io): a pod's use (each of its
 * containers'), a node's — listed and got, never watched (the page lists
 * them again now and then). Its own fields: their CPU in cores and memory
 * in bytes, summed of a pod's containers — so a list sorts by them, a
 * count sums them; and a pod's and a node's own, joined (of its metrics
 * object, the same namespace and name) — so their tables sort by them.
 */

const group = 'metrics.k8s.io';
const version = 'v1beta1';
const verbs = ['get', 'list'];

export const PodMetrics: KindInfo = { id: `${group}/${version}/PodMetrics`, group, version, kind: 'PodMetrics', plural: 'pods', singular: 'pod', namespaced: true, verbs };
export const NodeMetrics: KindInfo = { id: `${group}/${version}/NodeMetrics`, group, version, kind: 'NodeMetrics', plural: 'nodes', singular: 'node', namespaced: false, verbs };

/** Their refs, as queries name them. */
export const POD_METRICS = `pods.${version}.${group}`;
export const NODE_METRICS = `nodes.${version}.${group}`;

/** A quantity of usage as a number (none said: 0). */
const amount = (of: string, resource: 'cpu' | 'memory') => `quantity(string(${of}.?usage.?${resource}.orValue("0"))).asApproximateFloat()`;
const ofContainers = (resource: 'cpu' | 'memory') => `self.?containers.orValue([]).map(c, ${amount('c', resource)}).sum()`;

/** The fields: a PodMetrics' (its containers' summed), a NodeMetrics'; a pod's and a node's, joined of them. */
export const F = {
  podMetricsCpu: 'metrics.podmetrics.cpu',
  podMetricsMemory: 'metrics.podmetrics.memory',
  nodeMetricsCpu: 'metrics.nodemetrics.cpu',
  nodeMetricsMemory: 'metrics.nodemetrics.memory',
  podCpu: 'metrics.pods.cpu',
  podMemory: 'metrics.pods.memory',
  nodeCpu: 'metrics.nodes.cpu',
  nodeMemory: 'metrics.nodes.memory',
} as const;

export const FIELDS: Record<string, FieldSpec> = {
  [F.podMetricsCpu]: { kinds: [POD_METRICS], type: 'number', unit: 'cores', value: { cel: ofContainers('cpu') } },
  [F.podMetricsMemory]: { kinds: [POD_METRICS], type: 'number', unit: 'bytes', value: { cel: ofContainers('memory') } },
  [F.nodeMetricsCpu]: { kinds: [NODE_METRICS], type: 'number', unit: 'cores', value: { cel: amount('self', 'cpu') } },
  [F.nodeMetricsMemory]: { kinds: [NODE_METRICS], type: 'number', unit: 'bytes', value: { cel: amount('self', 'memory') } },
  [F.podCpu]: { kinds: ['pods.v1'], type: 'number', unit: 'cores', value: { from: POD_METRICS, field: F.podMetricsCpu } },
  [F.podMemory]: { kinds: ['pods.v1'], type: 'number', unit: 'bytes', value: { from: POD_METRICS, field: F.podMetricsMemory } },
  [F.nodeCpu]: { kinds: ['nodes.v1'], type: 'number', unit: 'cores', value: { from: NODE_METRICS, field: F.nodeMetricsCpu } },
  [F.nodeMemory]: { kinds: ['nodes.v1'], type: 'number', unit: 'bytes', value: { from: NODE_METRICS, field: F.nodeMetricsMemory } },
};
