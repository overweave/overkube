import { fieldsOf, valuesOf } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { KUBE_CEL, STATUS } from './index.ts';

/* The states worked out of a status: a workload's health through a rollout, a stateful set's partition, an autoscaler's. */

const paths = fieldsOf(STATUS, KUBE_CEL.compile).fields;
const of = (name: string, object: object) => valuesOf(object, name, paths)[0];

const deployment = (status: object, more: { replicas?: number; progressing?: string } = {}) => ({
  metadata: { generation: 2 },
  spec: { replicas: more.replicas ?? 3 },
  status: {
    observedGeneration: 2,
    ...status,
    conditions: more.progressing ? [{ type: 'Progressing', status: more.progressing === 'ProgressDeadlineExceeded' ? 'False' : 'True', reason: more.progressing }] : [],
  },
});

describe('a deployment’s health', () => {
  it.each([
    ['all up', deployment({ updatedReplicas: 3, availableReplicas: 3 }, { progressing: 'NewReplicaSetAvailable' }), 'Healthy'],
    ['its controller behind', { ...deployment({ updatedReplicas: 3, availableReplicas: 3 }), metadata: { generation: 3 } }, 'Progressing'],
    ['new pods being made', deployment({ updatedReplicas: 1, availableReplicas: 3 }, { progressing: 'ReplicaSetUpdated' }), 'Progressing'],
    // The tail of a rollout or a scale-up: all made, one not ready yet.
    ['the last one coming up', deployment({ updatedReplicas: 3, availableReplicas: 2 }, { progressing: 'ReplicaSetUpdated' }), 'Progressing'],
    // Done rolling out, then one lost: a fault.
    ['one lost after its rollout', deployment({ updatedReplicas: 3, availableReplicas: 2 }, { progressing: 'NewReplicaSetAvailable' }), 'Degraded'],
    ['stuck', deployment({ updatedReplicas: 1, availableReplicas: 2 }, { progressing: 'ProgressDeadlineExceeded' }), 'Degraded'],
    ['none wanted', deployment({}, { replicas: 0 }), 'Scaled to zero'],
  ])('%s: %s', (_, object, said) => {
    expect(of('deployments.v1.apps.health', object)).toBe(said);
  });
});

describe('a daemon set’s health', () => {
  it('has no nodes to run on, not scaled to zero; all up, healthy', () => {
    const ds = (status: object) => ({ metadata: { generation: 1 }, status: { observedGeneration: 1, ...status } });
    expect([
      of('daemonsets.v1.apps.health', ds({ desiredNumberScheduled: 0 })),
      of('daemonsets.v1.apps.health', ds({ desiredNumberScheduled: 2, numberAvailable: 2, updatedNumberScheduled: 2 })),
    ]).toEqual(['No nodes', 'Healthy']);
  });
});

describe('a stateful set’s health', () => {
  const sts = (strategy: object, status: object) => ({
    metadata: { generation: 1 },
    spec: { replicas: 3, updateStrategy: strategy },
    status: { observedGeneration: 1, ...status },
  });
  it.each([
    ['rolled out', { type: 'RollingUpdate' }, { readyReplicas: 3, updatedReplicas: 3 }, 'Healthy'],
    ['rolling', { type: 'RollingUpdate' }, { readyReplicas: 3, updatedReplicas: 1 }, 'Progressing'],
    // A partition of 2: only the pods at or past ordinal 2 are made anew — one of three, done.
    ['done up to its partition', { type: 'RollingUpdate', rollingUpdate: { partition: 2 } }, { readyReplicas: 3, updatedReplicas: 1 }, 'Healthy'],
    ['a partition past its replicas', { type: 'RollingUpdate', rollingUpdate: { partition: 5 } }, { readyReplicas: 3, updatedReplicas: 0 }, 'Healthy'],
    ['on delete: made as they go', { type: 'OnDelete' }, { readyReplicas: 3, updatedReplicas: 0 }, 'Healthy'],
    ['a pod not ready', { type: 'RollingUpdate' }, { readyReplicas: 2, updatedReplicas: 3 }, 'Progressing'],
  ])('%s', (_, strategy, status, said) => {
    expect(of('statefulsets.v1.apps.health', sts(strategy, status))).toBe(said);
  });
});

describe('an autoscaler’s state', () => {
  const hpa = (...conditions: [string, string][]) => ({ status: { conditions: conditions.map(([type, status]) => ({ type, status })) } });
  it.each([
    ['able, its metrics had', hpa(['AbleToScale', 'True'], ['ScalingActive', 'True'], ['ScalingLimited', 'False']), 'AbleToScale'],
    ['not able (no scale got)', hpa(['AbleToScale', 'False'], ['ScalingActive', 'True']), 'AbleToScale: False'],
    ['its metrics not had', hpa(['AbleToScale', 'True'], ['ScalingActive', 'False']), 'ScalingActive: False'],
    ['held at a bound', hpa(['AbleToScale', 'True'], ['ScalingActive', 'True'], ['ScalingLimited', 'True']), 'ScalingLimited'],
    ['nothing said yet', hpa(), 'Unknown'],
  ])('%s', (_, object, said) => {
    expect(of('horizontalpodautoscalers.v2.autoscaling.status', object)).toBe(said);
  });
});
