/**
 * An addon's components, drawn with Preact: the cluster (KubeProvider,
 * useCluster), queries answered live while drawn (useList, useCount,
 * useGet, useFields), the page
 * (where it is, going elsewhere, telling the user: usePage, usePageProps,
 * useNotify; the resource opened over it: useOpened), a kind's table wherever it is wanted
 * (KindTable: the kind.table slot's), the user's changes (UserProvider,
 * useUser: kept by the page), and
 * fill() typed by the dashboard's slots (overweave's, re-exported with
 * <Slot> and <Wrapped>).
 */

export { fill, Slot, Wrapped } from '@overweave/ui/preact';
export { KubeProvider, useCluster, useCount, useFields, useGet, useList } from './hooks.ts';
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
  useNotify,
  useOpened,
  usePage,
  usePageProps,
} from './page.ts';
export { useSay } from './say.ts';
export { KindTable } from './table.ts';
export { UserProvider, useUser } from './user.ts';
