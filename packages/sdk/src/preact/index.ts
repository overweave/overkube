/**
 * An addon's components, drawn with Preact: the cluster (KubeProvider,
 * useCluster), queries answered live while drawn (useList, useCount,
 * useGet, useFields), the page
 * (where it is, going elsewhere, telling the user: usePage, usePageProps,
 * useNotify; the resource opened over it: useOpened; anything else opened over it as a
 * resource is: OpenedView), a kind's table wherever it is wanted
 * (KindTable: the kind.table slot's), a table of no one kind set out as the
 * user sets it (useTableView), the user's changes (UserProvider,
 * useUser: kept by the page), and
 * fill() typed by the dashboard's slots (overweave's, re-exported with
 * <Slot> and <Wrapped>).
 */

export { fill, Slot, Wrapped } from '@overweave/ui/preact';
export { AddonsProvider, useAddons } from './addons.ts';
export { KubeProvider, useCluster, useCount, useFields, useGet, useList, useLists, useLog, useOwned, useSearch, useSize } from './hooks.ts';
export { useKind, useServedKinds } from './kinds.ts';
export { useMenu } from './menu.ts';
export { OpenedView, useLayout } from './opened.tsx';
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
export { ObjectRef } from './refs.tsx';
export { useSay } from './say.ts';
export { StatusOf, statusFormat } from './status.tsx';
export { KindFilter, KindTable, useTableView } from './table.ts';
export { tipField } from './tips.ts';
export { UserProvider, useUser } from './user.ts';
