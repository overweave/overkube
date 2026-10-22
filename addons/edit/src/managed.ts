import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { Reason } from '@overkube/sdk';
import { T } from './texts.ts';

/*
 * What manages an object, as its labels and annotations say it — Flux
 * (kustomize.toolkit.fluxcd.io, helm.toolkit.fluxcd.io), Helm
 * (app.kubernetes.io/managed-by: Helm, meta.helm.sh/release-name): a change
 * made here would be undone by it (its next reconcile, its next upgrade),
 * so what changes it is locked, its tip saying by what. So too what a
 * controller keeps (its ownerReferences' controller: a ReplicaSet's pod, a
 * Deployment's ReplicaSet) — made anew from its spec, a change here lost.
 */

export interface Manager {
  by: 'Flux' | 'Helm';
  /** Its applier's kind (Kustomization, HelmRelease) or Helm's release. */
  kind: string;
  namespace: string;
  name: string;
}

export function managerOf(o: KubeObject): Manager | undefined {
  const l = o.metadata?.labels ?? {};
  const a = o.metadata?.annotations ?? {};
  const k = l['kustomize.toolkit.fluxcd.io/name'];
  if (k) return { by: 'Flux', kind: 'Kustomization', namespace: l['kustomize.toolkit.fluxcd.io/namespace'] ?? '', name: k };
  const h = l['helm.toolkit.fluxcd.io/name'];
  if (h) return { by: 'Flux', kind: 'HelmRelease', namespace: l['helm.toolkit.fluxcd.io/namespace'] ?? '', name: h };
  if (l['app.kubernetes.io/managed-by'] === 'Helm' && a['meta.helm.sh/release-name'])
    return { by: 'Helm', kind: 'release', namespace: a['meta.helm.sh/release-namespace'] ?? o.metadata?.namespace ?? '', name: a['meta.helm.sh/release-name'] };
  return undefined;
}

/** Kinds edited whatever owns them: a StatefulSet's PersistentVolumeClaim (resized, as kubectl edit pvc does it) — kept as edited. */
const EDITED_OWNED: readonly string[] = [kinds.core.v1.PersistentVolumeClaim.id];

/** Its controller's (ownerReferences, controller: true): what keeps it as its spec says — or none. */
export function controlledBy(o: KubeObject, kind: KindInfo): Reason | undefined {
  if (EDITED_OWNED.includes(kind.id)) return undefined;
  const c = o.metadata?.ownerReferences?.find((r) => r.controller);
  return c ? { label: T.managed.controller, params: { kind: c.kind, name: c.name } } : undefined;
}

/** Why its YAML is not edited here: what manages it, else its controller. */
export const editLockedBy = (o: KubeObject, kind: KindInfo): Reason | undefined => lockedBy(o) ?? controlledBy(o, kind);

/** Why it is locked (what manages it), or none. */
export function lockedBy(o: KubeObject): Reason | undefined {
  const m = managerOf(o);
  if (!m) return undefined;
  const name = m.namespace ? `${m.namespace}/${m.name}` : m.name;
  return m.by === 'Flux' ? { label: T.managed.flux, params: { kind: m.kind, name } } : { label: T.managed.helm, params: { name } };
}
