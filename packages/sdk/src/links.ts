import type { KindInfo } from '@overkube/kube-types';

/*
 * Where things are on the page, as paths: a kind as kubectl says it
 * (<plural>.<version>[.<group>]: pods.v1, deployments.v1.apps) — one part of
 * a path, read back unambiguously — its table at /k/<kind>, an object at
 * /k/<kind>/<namespace>/<name> (/k/<kind>/<name>: one of the whole cluster).
 */

/** A kind as one part of a path: pods.v1, deployments.v1.apps. */
export function kindRef(kind: Pick<KindInfo, 'plural' | 'version' | 'group'>): string {
  return [kind.plural, kind.version, ...(kind.group ? [kind.group] : [])].join('.');
}

/** The kind a ref names, of these. */
export function kindOfRef<K extends Pick<KindInfo, 'plural' | 'version' | 'group'>>(kinds: Iterable<K>, ref: string): K | undefined {
  for (const kind of kinds) if (kindRef(kind) === ref) return kind;
  return undefined;
}

/** A kind's table. */
export function kindPath(kind: Pick<KindInfo, 'plural' | 'version' | 'group'>): string {
  return `/k/${kindRef(kind)}`;
}

/** An object's view. */
export function objectPathOf(kind: Pick<KindInfo, 'plural' | 'version' | 'group'>, object: { metadata?: { name?: string; namespace?: string } }): string {
  const { name = '', namespace } = object.metadata ?? {};
  return `${kindPath(kind)}/${namespace ? `${encodeURIComponent(namespace)}/` : ''}${encodeURIComponent(name)}`;
}
