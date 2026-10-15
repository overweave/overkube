import { define } from './define.ts';

/*
 * Of the kinds that hold or pick, as kubectl shows them: how many keys a
 * config map and a secret hold (its data's and its binary data's); the pods
 * a network policy and a disruption budget are for (their selector's
 * labels, key=value); the pod security level a namespace enforces (its
 * label's).
 */
const keys = (...maps: string[]) => ({ cel: maps.map((m) => `size(self.?${m}.orValue({}))`).join(' + ') });
const picks = (path: string) => ({ cel: `cel.bind(l, self.?spec.?${path}.?matchLabels.orValue({}), l.map(k, k + "=" + l[k]))` });

export const CONFIG = define({
  'configmaps.v1.keys': { kinds: ['configmaps.v1'], type: 'number', value: keys('data', 'binaryData') },
  'secrets.v1.keys': { kinds: ['secrets.v1'], type: 'number', value: keys('data') },
  'networkpolicies.v1.networking.k8s.io.pods': { kinds: ['networkpolicies.v1.networking.k8s.io'], type: 'string', many: true, value: picks('podSelector') },
  'poddisruptionbudgets.v1.policy.pods': { kinds: ['poddisruptionbudgets.v1.policy'], type: 'string', many: true, value: picks('selector') },
  'storageclasses.v1.storage.k8s.io.default': {
    kinds: ['storageclasses.v1.storage.k8s.io'],
    type: 'bool',
    value: { cel: "self.?metadata.?annotations[?'storageclass.kubernetes.io/is-default-class'].orValue('') == 'true'" },
  },
  'ingressclasses.v1.networking.k8s.io.default': {
    kinds: ['ingressclasses.v1.networking.k8s.io'],
    type: 'bool',
    value: { cel: "self.?metadata.?annotations[?'ingressclass.kubernetes.io/is-default-class'].orValue('') == 'true'" },
  },
  'namespaces.v1.podSecurity': {
    kinds: ['namespaces.v1'],
    type: 'string',
    value: { cel: "self.?metadata.?labels[?'pod-security.kubernetes.io/enforce'].orValue('')" },
  },
});
