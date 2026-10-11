import type { ObjectOfKind } from '@overkube/client';
import { apiVersion, type KindInfo } from '@overkube/kube-types';

/*
 * Objects of a kind, as a test or a story wants them: only what matters to
 * it said, typed by the kind's own type; the rest as the API server would
 * have it — apiVersion, kind, a name, the namespace "default" (a namespaced
 * kind's), a uid, a resourceVersion, when it was made.
 */

/** Some of a type, at every depth (a list as a whole). */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** When objects are made, unless said: an hour ago (an age a page shows as such). */
const MADE = () => new Date(Date.now() - 3_600_000).toISOString();

let made = 0;

/** An object of a kind: what is given over what the API server would say of it. */
export function make<K extends KindInfo>(kind: K, partial: DeepPartial<ObjectOfKind<K>> = {} as DeepPartial<ObjectOfKind<K>>): ObjectOfKind<K> {
  made += 1;
  const given = partial as { metadata?: Record<string, unknown> } & Record<string, unknown>;
  return {
    apiVersion: apiVersion(kind),
    kind: kind.kind,
    ...given,
    metadata: {
      name: `${kind.singular}-${made}`,
      ...(kind.namespaced ? { namespace: 'default' } : {}),
      uid: `00000000-0000-4000-8000-${String(made).padStart(12, '0')}`,
      resourceVersion: '1',
      creationTimestamp: MADE(),
      ...given.metadata,
    },
  } as ObjectOfKind<K>;
}

/** Where an object is, as a collection keys it: namespace/name, or its name (a cluster-wide one). */
export function keyOf(object: { metadata?: { name?: string; namespace?: string } }): string {
  const { name = '', namespace } = object.metadata ?? {};
  return namespace ? `${namespace}/${name}` : name;
}
