import {
  type CountQuery,
  type CountResult,
  canonical,
  type FieldsResult,
  type GetQuery,
  type GetResult,
  type KindRef,
  type ListQuery,
  type ListResult,
  type Live,
} from '@overkube/query';
import { type ComponentChildren, createContext, h } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import type { Cluster } from '../cluster.ts';

/*
 * The cluster in an addon's components: given by the page (KubeProvider,
 * under overweave's OverweaveProvider), read with useCluster; what is read
 * of it, queries — answered live while the component is drawn (its result
 * read in drawing: the component drawn again as it changes, the query let
 * go of once it is not drawn). A query is data: the same query (however
 * made anew each drawing), the same answer.
 */

const ClusterContext = createContext<Cluster | null>(null);

/** The cluster the components below work with: the page's, or one in memory in a test or a story. */
export function KubeProvider({ cluster, children }: { cluster: Cluster; children?: ComponentChildren }) {
  return h(ClusterContext.Provider, { value: cluster }, children);
}
KubeProvider.displayName = 'Overkube.KubeProvider';

/** The cluster: what a component reads of it, it reads while drawn. */
export function useCluster(): Cluster {
  const cluster = useContext(ClusterContext);
  if (!cluster) throw new Error('no KubeProvider above: the cluster is given by the page');
  return cluster;
}

/** A query's live answer, read now (the component drawn again as it changes); the same query (as data, its parts in any order), the same answer. */
function useAnswer<Q, T>(query: Q, ask: (cluster: Cluster, query: Q) => Live<T>): T {
  const cluster = useCluster();
  // Its parts in any order: the same query.
  const key = canonical(query);
  const live = useMemo(() => ask(cluster, query), [cluster, key]);
  return live.value;
}

/** A window of a kind's objects: where, which, in what order, which of their fields. */
export const useList = <O = unknown>(query: ListQuery): ListResult<O> => useAnswer(query, (c, q) => c.source.list<O>(q));

/** How many of a kind's objects, in all and by a field's values. */
export const useCount = (query: CountQuery): CountResult => useAnswer(query, (c, q) => c.source.count(q));

/** One object, by its kind, namespace and name. */
export const useGet = <O = unknown>(query: GetQuery): GetResult<O> => useAnswer(query, (c, q) => c.source.get<O>(q));

/** A kind's fields (by its ref: pods.v1): what its queries may ask by, the columns its own definition says. */
export const useFields = (kind: KindRef): FieldsResult => useAnswer(kind, (c, k) => c.source.fields(k));
