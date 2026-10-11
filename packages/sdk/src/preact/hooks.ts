import type { CollectionView, ObjectOfKind } from '@overkube/client';
import type { KindInfo } from '@overkube/kube-types';
import { type ComponentChildren, createContext, h } from 'preact';
import { useContext, useEffect, useMemo } from 'preact/hooks';
import type { ComponentCluster } from '../cluster.ts';

/*
 * The cluster in an addon's components: given by the page (KubeProvider,
 * under overweave's OverweaveProvider), read with useCluster; a kind's
 * objects held while a component is drawn (useCollection) and let go of
 * when it is not.
 */

const ClusterContext = createContext<ComponentCluster | null>(null);

/** The cluster the components below work with: the page's, or a fake's in a test or a story. */
export function KubeProvider({ cluster, children }: { cluster: ComponentCluster; children?: ComponentChildren }) {
  return h(ClusterContext.Provider, { value: cluster }, children);
}
KubeProvider.displayName = 'Overkube.KubeProvider';

/** The cluster: what a component holds of it, it holds while drawn (useCollection), never for good. */
export function useCluster(): ComponentCluster {
  const cluster = useContext(ClusterContext);
  if (!cluster) throw new Error('no KubeProvider above: the cluster is given by the page');
  return cluster;
}

/** A kind's objects, held while the component is drawn: read collection.items.value, .state.value. */
export function useCollection<K extends KindInfo>(kind: K): CollectionView<ObjectOfKind<K>> {
  const cluster = useCluster();
  // Held from the first drawing on (not only once committed): what is read now is what is kept.
  // By its id: discovery giving the same kind anew is not another kind.
  const collection = useMemo(() => cluster.peek(kind), [cluster, kind.id]);
  useEffect(() => cluster.hold(kind), [cluster, kind.id]);
  return collection;
}
