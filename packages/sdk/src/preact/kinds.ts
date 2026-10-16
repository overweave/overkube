import { type KindInfo, knownKinds } from '@overkube/kube-types';
import { kindOfRef } from '../links.ts';
import { useCluster } from './hooks.ts';

/*
 * The kinds there are, for any addon's components: those the cluster
 * serves — or, until its discovery answers, those the kinds table knows —
 * and the one a path's ref names.
 */

const KNOWN: ReadonlyMap<string, KindInfo> = new Map(knownKinds.map((k) => [k.id, k]));

/** The kinds served, by id: as discovery says, or the known ones until it has (known: false). */
export function useServedKinds(): { kinds: ReadonlyMap<string, KindInfo>; known: boolean } {
  const served = useCluster().discovery.kinds.value;
  return served ? { kinds: served, known: true } : { kinds: KNOWN, known: false };
}

/** The kind a ref names (pods.v1): served, or (until discovery answers) known; undefined: none (or not served). */
export function useKind(ref: string): KindInfo | undefined {
  const { kinds } = useServedKinds();
  return kindOfRef(kinds, ref);
}
