/**
 * An addon's components, drawn with Preact: the cluster (KubeProvider,
 * useCluster), a kind's objects held while drawn (useCollection), the page
 * (where it is, going elsewhere, telling the user: usePage, usePageProps,
 * useNavigate, useNotify; the resource opened over it: useOpened), a kind's table wherever it is wanted
 * (KindTable: the kind.table slot's), and
 * fill() typed by the dashboard's slots (overweave's, re-exported with
 * <Slot> and <Wrapped>).
 */

export { fill, Slot, Wrapped } from '@overweave/ui/preact';
export { KubeProvider, useCluster, useCollection } from './hooks.ts';
export { useKind, useServedKinds } from './kinds.ts';
export { useMenu } from './menu.ts';
export {
  type Opened,
  OpenedProvider,
  type OpenMenu,
  PagePropsProvider,
  PageProvider,
  type PageValue,
  type Shown,
  useNavigate,
  useNotify,
  useOpened,
  usePage,
  usePageProps,
} from './page.ts';
export { useSay } from './say.ts';
export { KindTable } from './table.ts';
