/**
 * An addon's components, drawn with Preact: the cluster (KubeProvider,
 * useCluster), a kind's objects held while drawn (useCollection), and
 * fill() typed by the dashboard's slots (overweave's, re-exported with
 * <Slot>).
 */

export { fill, Slot } from '@overweave/ui/preact';
export { KubeProvider, useCluster, useCollection } from './hooks.ts';
