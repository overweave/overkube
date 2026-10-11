/**
 * An addon's components, drawn with Preact: the cluster (KubeProvider,
 * useCluster), a kind's objects held while drawn (useCollection), the page
 * (where it is, going elsewhere, telling the user: usePage, useRoute,
 * useNavigate, useNotify), and
 * fill() typed by the dashboard's slots (overweave's, re-exported with
 * <Slot>).
 */

export { fill, Slot } from '@overweave/ui/preact';
export { KubeProvider, useCluster, useCollection } from './hooks.ts';
export { useKind, useServedKinds } from './kinds.ts';
export { useMenu } from './menu.ts';
export { type OpenMenu, PageProvider, type PageValue, RouteProvider, type Shown, useNavigate, useNotify, usePage, useRoute } from './page.ts';
export { useSay } from './say.ts';
