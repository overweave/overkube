import type { KindInfo } from '@overkube/kube-types';

/** A kind's name for people: its kind, in the plural (Deployments, ConfigMaps, NetworkPolicies, Ingresses). */
export function titleOf(kind: Pick<KindInfo, 'kind'>): string {
  const k = kind.kind;
  if (/[^aeiou]y$/.test(k)) return `${k.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(k)) return `${k}es`;
  return `${k}s`;
}
