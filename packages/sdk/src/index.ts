/**
 * What overkube's addons are written with: the dashboard's kinds over
 * overweave (KindView, Category, Column, TableView, Page, Action and the
 * UI's Slot, Fill, Wrap), its slots, the usual definitions (column,
 * section, action, tile), defineAddon and what an addon is given — its
 * contributor and the cluster. Components: '@overkube/sdk/preact'.
 *
 * Who draws what: the shell (@overkube/shell) the frame — its header,
 * navigation, overlay and notifications slots, the Route at the path; the
 * core addon the rest, each a default another's takes the place of — a
 * kind's page (kind.page: its table — Column, TableView, kind.bar), an
 * object over it (object.view: object.*, Action), the navigation
 * (KindView, Category, NavView). Page (its regions, tile) and the picker's
 * rows are declared, not drawn yet.
 */

export {
  type Addon,
  type AddonState,
  type Condition,
  type Ctx,
  defineAddon,
  type GuardedResult,
  type KubeContributor,
  type Layer,
  type Notification,
  PRIORITY,
  RESERVED_IDS,
  RIGHTS_OF,
  type SetupResult,
  standingOf,
} from './addon.ts';
export type { Cluster, ComponentCluster, Discovery, ObjectChange } from './cluster.ts';
export { action, column, section, tile } from './helpers.ts';
export {
  Action,
  type ActionSpec,
  Category,
  type CategorySpec,
  Column,
  type ColumnRenderProps,
  type ColumnSpec,
  type Health,
  KindView,
  type KindViewSpec,
  type KubeKinds,
  kubeKinds,
  kubeOwnKinds,
  NavView,
  type NavViewSpec,
  Page,
  type PageSpec,
  type Region,
  RIGHTS,
  type Right,
  Route,
  type RouteProps,
  type RouteSpec,
  TableView,
  type TableViewSpec,
  type Target,
  ui,
} from './kinds.ts';
export { kindOfRef, kindPath, kindRef, objectPathOf } from './links.ts';
export { type KindProps, type ListState, type ObjectProps, type ObjectRef, parseSlot, slots } from './slots.ts';
export { forKinds, kindMatcher, takes } from './target.ts';
