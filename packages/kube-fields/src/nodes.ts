import { define } from './define.ts';

/*
 * A node's: its version, whether it takes pods, its roles (as kubectl
 * tells them: node-role.kubernetes.io/<role>, kubernetes.io/role; once
 * each, in order), taints;
 * its CPU and memory, capacity and allocatable, as numbers (cores, bytes:
 * a quantity's approximate float — its int64 is none of 1.5Gi, as Go has it).
 */
const kinds = ['nodes.v1'];
const PREFIX = 'node-role.kubernetes.io/';
const quantity = (path: string) => ({ cel: `quantity(self.status.${path}).asApproximateFloat()` });

export const NODES = define({
  'nodes.v1.version': { kinds, type: 'string', value: '.status.nodeInfo.kubeletVersion' },
  'nodes.v1.unschedulable': { kinds, type: 'bool', value: { cel: 'self.?spec.?unschedulable.orValue(false)' } },
  'nodes.v1.roles': {
    kinds,
    type: 'string',
    many: true,
    value: {
      cel: `cel.bind(l, self.?metadata.?labels.orValue({}),
        l.filter(k, k.startsWith("${PREFIX}") && size(k) > ${PREFIX.length}).map(k, k.substring(${PREFIX.length}))
        + ("kubernetes.io/role" in l && l["kubernetes.io/role"] != "" ? [l["kubernetes.io/role"]] : [])).distinct().sort()`,
    },
  },
  'nodes.v1.taints': { kinds, type: 'string', many: true, value: { cel: 'self.?spec.?taints.orValue([]).map(t, t.?key.orValue("") + ":" + t.?effect.orValue(""))' } },
  'nodes.v1.cpu': { kinds, type: 'number', unit: 'cores', value: quantity('capacity.cpu') },
  'nodes.v1.cpu-allocatable': { kinds, type: 'number', unit: 'cores', value: quantity('allocatable.cpu') },
  'nodes.v1.memory': { kinds, type: 'number', unit: 'bytes', value: quantity('capacity.memory') },
  'nodes.v1.memory-allocatable': { kinds, type: 'number', unit: 'bytes', value: quantity('allocatable.memory') },
});
