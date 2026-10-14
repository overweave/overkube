/**
 * What overkube's addons are written with: the dashboard's kinds over
 * overweave (KindView, Category, Column, TableView, Page, Action, MenuItem
 * and the UI's Slot, Fill, Wrap), its slots, the usual definitions (column,
 * section, action, menuItem, tile, wrap), defineAddon and what an addon is given — its
 * contributor and the cluster. Components: '@overkube/sdk/preact'.
 *
 * Who draws what: the shell (@overkube/shell) the frame — its header,
 * navigation, overlay, menu and notifications slots; the Page at the path
 * (its slot, page.<name>, empty but for what fills it; its regions; the
 * kind its :kind names; a resource opened over it, ?open=); the core addon
 * the rest, each a default another's takes the place of — the start
 * (page.overview), a kind's page (page.kind: its table among what is on it), a
 * kind's table wherever drawn (kind.table, <KindTable>: Column, TableView,
 * kind.table.*), a resource opened (resource.view and its parts, Action),
 * the navigation (KindView, Category, NavView; a Page with a title),
 * context menus (menu: MenuItem, menuOf), how it looks (Appearance: a
 * Theme, dark or light). An addon's own components are drawn in the kit's
 * tokens (var(--uk-accent), var(--uk-panel)…), never colours of their own:
 * so a theme reaches them too.
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
export type { Cluster, Discovery, ObjectChange } from './cluster.ts';
export { type FieldLayer, fieldLayers } from './fields.ts';
export { action, column, menuItem, type ObjectOfKind, section, tile, wrap } from './helpers.ts';
export {
  Action,
  type ActionSpec,
  Appearance,
  type AppearanceSpec,
  Category,
  type CategorySpec,
  type CellProps,
  type CellValue,
  Column,
  type ColumnContext,
  type ColumnSpec,
  Field,
  type FieldSpec,
  KindView,
  type KindViewSpec,
  type KubeKinds,
  kubeKinds,
  kubeOwnKinds,
  Language,
  type LanguageSpec,
  MenuItem,
  type MenuItemSpec,
  type MenuPage,
  type MenuSubject,
  type MenuSubjects,
  Messages,
  type MessagesSpec,
  type NavTabContext,
  NavView,
  type NavViewSpec,
  Page,
  type PageProps,
  type PageSpec,
  type Region,
  type ResourceContext,
  RIGHTS,
  type Right,
  TableView,
  type TableViewSpec,
  type Target,
  Theme,
  type ThemeSpec,
  ui,
} from './kinds.ts';
export { closeIn, KIND_PAGE, kindOfRef, kindPath, kindRef, kindRefIn, openedIn, openIn } from './links.ts';
export { DANGER, MENU_GROUPS, type MenuGroupOf, menuOf } from './menu.ts';
export { type MessagesOf, messagesName, type Params, type Say, sayer } from './say.ts';
export {
  type KindProps,
  type KindTableProps,
  type ListState,
  type MissingState,
  type NavPickerItemProps,
  type NavPickerPartProps,
  type NavPickerProps,
  type NavTabProps,
  type NavTabsProps,
  type ResourceConditionProps,
  type ResourceFieldProps,
  type ResourceFinalizerProps,
  type ResourceLabelProps,
  type ResourceOwnerProps,
  type ResourceProps,
  type ResourceRef,
  slots,
} from './slots.ts';
export { forKinds, kindMatcher, takes } from './target.ts';
export { canonicalLocale, isLabel, isPhrase, type Label, type LabelRef, type Phrase, type PluralForms, t } from './text.ts';
