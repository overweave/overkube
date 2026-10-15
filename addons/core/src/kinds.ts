import type { KindInfo } from '@overkube/kube-types';

/** An API group Kubernetes serves itself (the core group, one without a dot, one of k8s.io): not an operator's (its CRDs'). */
export const builtIn = (group: string) => group === '' || !group.includes('.') || group.endsWith('.k8s.io');

/** A kind's name for people: its kind, in the plural (Deployments, ConfigMaps, NetworkPolicies, Ingresses). */
export function titleOf(kind: Pick<KindInfo, 'kind'>): string {
  const k = kind.kind;
  if (/[^aeiou]y$/.test(k)) return `${k.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(k)) return `${k}es`;
  return `${k}s`;
}
