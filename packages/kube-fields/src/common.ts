import { define } from './define.ts';

/*
 * What every object has to ask by, whatever its kind (a CRD's too): its
 * name, namespace, uid, when it was made and when it began to go; its
 * owners (and the one that controls it), finalizers; its labels and
 * conditions as key=value, Type=Status (one field each, for groupBy and
 * selectors), its labels' keys (a selector's Exists); whether it is Ready.
 */
export const COMMON = define({
  'core.name': { type: 'string', value: '.metadata.name' },
  'core.namespace': { type: 'string', value: '.metadata.namespace' },
  'core.uid': { type: 'string', value: '.metadata.uid' },
  'core.created': { type: 'time', value: '.metadata.creationTimestamp' },
  'core.deleting': { type: 'time', value: '.metadata.deletionTimestamp' },
  'core.owner.uid': { type: 'string', many: true, value: '.metadata.ownerReferences[*].uid' },
  'core.controller.uid': { type: 'string', value: '.metadata.ownerReferences[?(@.controller==true)].uid' },
  'core.finalizers': { type: 'string', many: true, value: '.metadata.finalizers[*]' },
  'core.ready': { type: 'string', value: '.status.conditions[?(@.type=="Ready")].status' },
  'core.labels': { type: 'string', many: true, value: { cel: 'cel.bind(l, self.?metadata.?labels.orValue({}), l.map(k, k + "=" + l[k]))' } },
  'core.label.keys': { type: 'string', many: true, value: { cel: 'self.?metadata.?labels.orValue({}).map(k, k)' } },
  'core.conditions': {
    type: 'string',
    many: true,
    value: { cel: 'self.?status.?conditions.orValue([]).filter(c, c.?type.hasValue()).map(c, c.type + "=" + c.?status.orValue(""))' },
  },
});
