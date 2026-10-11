/**
 * What overkube's addons are written with: the dashboard's kinds over
 * overweave (KindView, Category, Column, TableView, Page, Action and the
 * UI's Slot, Fill, Wrap), its slots, the usual definitions (column,
 * section, action, tile), defineAddon and what an addon is given — its
 * contributor and the cluster. Components: '@overkube/sdk/preact'.
 *
 * Declared, not all drawn yet: the page (apps/web) draws Columns, a kind's
 * TableView and the kind.bar slot. KindView, Category, Page (and its
 * regions, tile), Action, and the header, object and picker slots are the
 * contract for what is to come — accepted and layered, not drawn.
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
  PRIORITY,
  RESERVED_IDS,
  RIGHTS_OF,
  type SetupResult,
  standingOf,
} from './addon.ts';
export type { Cluster, ComponentCluster, ObjectChange } from './cluster.ts';
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
  Page,
  type PageSpec,
  type Region,
  RIGHTS,
  type Right,
  TableView,
  type TableViewSpec,
  type Target,
  ui,
} from './kinds.ts';
export { type KindProps, type ListState, type ObjectProps, parseSlot, slots } from './slots.ts';
export { forKinds, kindMatcher, takes } from './target.ts';
