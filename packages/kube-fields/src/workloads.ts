import { define } from './define.ts';

/*
 * What a workload controller's replicas are, as kubectl shows them:
 * desired (its spec's; none said: 1 — a DaemonSet's, its status's: 0),
 * ready, up to date, available (its status's; none said, no status yet:
 * 0) — its pods' images; a deployment's and a replica set's revision;
 * the workload a pod or a replica set is of.
 */
const of = (path: string, none: number) => ({
  cel: `self.${path
    .split('.')
    .map((k) => `?${k}`)
    .join('.')}.orValue(${none})`,
});

/** Of its controller (o: its controlling owner reference, a list of one): this; none, "". */
const controlled = (of: string) => `cel.bind(o, self.?metadata.?ownerReferences.orValue([]).filter(r, r.?controller.orValue(false)), o.size() == 0 ? "" : ${of})`;

const replicated = ['deployments.v1.apps', 'statefulsets.v1.apps', 'replicasets.v1.apps'] as const;
const DS = ['daemonsets.v1.apps'];

export const WORKLOADS = define({
  ...Object.fromEntries(
    replicated.flatMap((kind) => [
      [`${kind}.desired`, { kinds: [kind], type: 'number' as const, value: of('spec.replicas', 1) }],
      [`${kind}.ready`, { kinds: [kind], type: 'number' as const, value: of('status.readyReplicas', 0) }],
      [`${kind}.available`, { kinds: [kind], type: 'number' as const, value: of('status.availableReplicas', 0) }],
      [`${kind}.images`, { kinds: [kind], type: 'string' as const, many: true, value: '.spec.template.spec.containers[*].image' }],
    ]),
  ),
  'deployments.v1.apps.updated': { kinds: ['deployments.v1.apps'], type: 'number', value: of('status.updatedReplicas', 0) },
  'statefulsets.v1.apps.updated': { kinds: ['statefulsets.v1.apps'], type: 'number', value: of('status.updatedReplicas', 0) },
  'daemonsets.v1.apps.desired': { kinds: DS, type: 'number', value: of('status.desiredNumberScheduled', 0) },
  'daemonsets.v1.apps.ready': { kinds: DS, type: 'number', value: of('status.numberReady', 0) },
  'daemonsets.v1.apps.updated': { kinds: DS, type: 'number', value: of('status.updatedNumberScheduled', 0) },
  'daemonsets.v1.apps.available': { kinds: DS, type: 'number', value: of('status.numberAvailable', 0) },
  'daemonsets.v1.apps.images': { kinds: DS, type: 'string', many: true, value: '.spec.template.spec.containers[*].image' },
  // The workload it is of, Kind/name: a workload itself; a replica set, its deployment; a pod, its controller — a deployment's
  // replica set's, the deployment (its name the replica set's but its pod-template-hash): what is joined to what its workload is
  // marked by (one join, of the workload, not of the replica set and then of it).
  ...Object.fromEntries(
    [
      ['deployments.v1.apps', 'Deployment'],
      ['statefulsets.v1.apps', 'StatefulSet'],
      ['daemonsets.v1.apps', 'DaemonSet'],
    ].map(([kind, name]) => [`${kind}.workload`, { kinds: [kind], type: 'string' as const, value: { cel: `"${name}/" + self.metadata.name` } }]),
  ),
  'replicasets.v1.apps.workload': { kinds: ['replicasets.v1.apps'], type: 'string', value: { cel: controlled('o[0].kind + "/" + o[0].name') } },
  'pods.v1.workload': {
    kinds: ['pods.v1'],
    type: 'string',
    value: {
      cel: controlled(`cel.bind(h, self.?metadata.?labels[?"pod-template-hash"].orValue(""),
        o[0].kind == "ReplicaSet" && h != "" && o[0].name.endsWith("-" + h) ? "Deployment/" + o[0].name.substring(0, o[0].name.size() - h.size() - 1)
        : o[0].kind + "/" + o[0].name)`),
    },
  },
  // Which rollout it is (a deployment's, and each of its replica sets'): its revision, as its controller notes it.
  ...Object.fromEntries(
    ['deployments.v1.apps', 'replicasets.v1.apps'].map((kind) => [
      `${kind}.revision`,
      { kinds: [kind], type: 'number' as const, value: { cel: "int(self.?metadata.?annotations[?'deployment.kubernetes.io/revision'].orValue('0'))" } },
    ]),
  ),
});
