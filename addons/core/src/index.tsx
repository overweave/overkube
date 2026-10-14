import { type KindInfo, kinds } from '@overkube/kube-types';
import { defineAddon, KIND_PAGE, type KindViewSpec, type Label, type MenuPage, menuItem, openIn, section, slots } from '@overkube/sdk';
import { copyText, Highlight, toYaml } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { CoreTable, TableEmpty } from './CoreTable.tsx';
import { addColumns } from './columns.tsx';
import {
  ConditionChanged,
  ConditionMessage,
  ConditionReason,
  ConditionRow,
  ConditionStatus,
  Conditions,
  ConditionType,
  conditionsOf,
  Deleting,
  FieldLabel,
  Finalizer,
  field,
  LabelChip,
  METADATA,
  Metadata,
  MetadataValue,
  Owner,
  SummaryFields,
  SummaryValue,
} from './details.tsx';
import { titleOf } from './kinds.ts';
import { Menu } from './Menu.tsx';
import { NavSide, NavTab, NavTabMark, NavTabs, Picker, PickerButton, PickerGroups, PickerItem, PickerSearch, type TabsKept, type TabsState } from './Nav.tsx';
import { KindMissing, Overview, PageTable, Welcome } from './pages.tsx';
import { Actions, ResourceMissing, ResourceTitle, ResourceView, YamlSection } from './ResourceView.tsx';
import { Toasts } from './Toasts.tsx';
import { T } from './texts.ts';

/*
 * The core: everything the page shows that is not another addon's, each a
 * definition another may patch, hide or put its own in place of —
 *
 *   pages      the start (/: page.overview — a word of welcome; that hidden and nothing else there, to the first pinned kind),
 *              a kind's page (/k/<kind>: page.kind) — its table among what is on it; a resource opened over any page (resource.view, the last in its slot: another's for a kind
 *              takes its place)
 *   tables     a kind's table, wherever drawn (kind.table: the last in its slot)
 *   columns    every kind's: its objects' names (a link to each), namespaces, ages; the usual kinds' own; a CRD's (columns.tsx)
 *   objects    their YAML, as the last section
 *   navigation as tabs across the top (each one the nav.tabs.tab slot's: its title in nav.tabs.tab.content), or the
 *              same tabs down the side in a rail — collapsed, peeking, pinned (NavView: the user's to switch)
 *   kinds      the usual ones grouped (Workloads, Network, …), the most used pinned; every one served,
 *              a table's view (TableView) — all of these defaults that yield (fallback adds): another's
 *              add takes their place, the user's patches go over whichever is there
 *   looks      the kit's own theme, dark or light as the system is (Appearance: the user's to change;
 *              another addon's Theme to choose); the language, the browser's (Language) — its words by
 *              key (texts.ts), in English until a language pack says them otherwise
 *   overlay    what the user is told
 *
 * Its names: a fill core.<slot> when it is all of its slot's (core.page.overview,
 * core.notifications), core.<slot>.<what> when it is a part — the slot named
 * without the frame part it is in (.content, .header, .footer, .actions,
 * .sections): core.nav.tabs.tab.title is in nav.tabs.tab.content,
 * core.resource.view.yaml in resource.view.sections — a section named for
 * what it draws (core.resource.view.metadata: the metadata section, in
 * resource.view.sections; its fields, core.resource.view.metadata.<field>,
 * fills of the slot resource.view.metadata; a label of them,
 * core.resource.view.metadata.label, the slot of that name's); a menu's item
 * core.<menu>.<what> (core.resource.context.open). Text keys as what says them.
 */

const { core, apps, batch, networking, storage } = kinds;

/** The usual kinds: their group, their icon (what is seen of them down a collapsed side), and those pinned (tabs) at first. */
const USUAL: [KindInfo, string, string, boolean][] = [
  [core.v1.Pod, 'workloads', 'cube', true],
  [apps.v1.Deployment, 'workloads', 'layers', true],
  [apps.v1.StatefulSet, 'workloads', 'database', false],
  [apps.v1.DaemonSet, 'workloads', 'daemon', false],
  [apps.v1.ReplicaSet, 'workloads', 'copy', false],
  [batch.v1.Job, 'workloads', 'run', false],
  [batch.v1.CronJob, 'workloads', 'clock', false],
  [core.v1.Service, 'network', 'network', true],
  [networking.v1.Ingress, 'network', 'globe', false],
  [networking.v1.NetworkPolicy, 'network', 'shield', false],
  [core.v1.ConfigMap, 'config', 'file', true],
  [core.v1.Secret, 'config', 'key', false],
  [core.v1.PersistentVolumeClaim, 'storage', 'disk', false],
  [core.v1.PersistentVolume, 'storage', 'volume', false],
  [storage.v1.StorageClass, 'storage', 'packages', false],
  [core.v1.Node, 'cluster', 'server', true],
  [core.v1.Namespace, 'cluster', 'folder', true],
  [core.v1.Event, 'cluster', 'activity', false],
];

const CATEGORIES: [string, Label][] = [
  ['workloads', T.categories.workloads],
  ['network', T.categories.network],
  ['config', T.categories.config],
  ['storage', T.categories.storage],
  ['cluster', T.categories.cluster],
];

/** The names of the slots in a tree of them (a page's, made by name, aside). */
function slotNames(tree: object): string[] {
  return Object.values(tree).flatMap((v) => (v && typeof v === 'object' ? [...(typeof v.name === 'string' ? [v.name] : []), ...slotNames(v)] : []));
}

export default defineAddon({
  id: 'core',
  title: 'Core',
  layer: 'core',
  setup({ contributor: c, cluster, effect }) {
    // Its pages: the start, a kind's — each empty but for what fills it: the core's, others' before or after it (a Wrap of it in its place).
    c.add('Page', 'overview', { path: '/', title: T.page.overview.title, icon: 'home', pinned: true, order: 0 });
    c.add('Fill', 'core.page.overview', fill(slots.page('overview'), { render: Overview }));
    // What is on it for now: a word of welcome (hidden by the user: to the first pinned kind, as before).
    c.add('Fill', 'core.page.overview.welcome', fill(slots.page('overview'), { render: Welcome }));
    c.add('Page', 'kind', { path: KIND_PAGE });
    c.add('Fill', 'core.page.kind.table', fill(slots.page('kind'), { render: PageTable }));
    // Its kind not found (not served, not known yet): why, in the table's place.
    c.add('Fill', 'core.page.kind.missing', fill(slots.page('kind'), { when: (p) => !p.kind, render: KindMissing }));
    // A kind's table, wherever drawn: the last in its slot (order 1000) — another's for a kind is drawn in its place.
    c.add('Fill', 'core.kind.table', { slot: slots.kind.table.name, order: 1000, render: CoreTable });
    // Its table's parts: a column's title in its header (others beside it), no rows said (another's in its place).
    c.add('Fill', 'core.kind.table.column.title', fill(slots.kind.table.column.content, { render: ({ column }) => <>{column.header}</> }));
    c.add('Fill', 'core.kind.table.empty', fill(slots.kind.table.empty, { order: 1000, render: TableEmpty }));
    // An object's menu (a table's row): open it, copy its name, its YAML.
    c.add(
      'MenuItem',
      'core.resource.context.open',
      menuItem({
        on: 'resource.context',
        group: 'open',
        title: T.resource.context.open,
        icon: 'enter',
        when: ({ opened }) => !opened,
        run: ({ kind, object }, page) => page.navigate(openIn(page.path, kind, object)),
      }),
    );
    const copy = (text: string, page: MenuPage) =>
      copyText(text).then((done) => done && page.notify({ level: 'ok', text: page.say(T.resource.context.copied), key: 'core.resource.context.copied' }));
    c.add(
      'MenuItem',
      'core.resource.context.copy-name',
      menuItem({ on: 'resource.context', group: 'copy', title: T.resource.context.copyName, icon: 'copy', run: ({ object }, page) => copy(object.metadata?.name ?? '', page) }),
    );
    c.add(
      'MenuItem',
      'core.resource.context.copy-yaml',
      menuItem({ on: 'resource.context', group: 'copy', title: T.resource.context.copyYaml, icon: 'copy', run: ({ object }, page) => copy(toYaml(object), page) }),
    );
    c.add('Fill', 'core.resource.view', { slot: slots.resource.view.name, order: 1000, render: ResourceView });
    // Its parts: its title, its footer's Actions, what is said when it is not there (another's in its place).
    c.add('Fill', 'core.resource.view.title', fill(slots.resource.view.title, { render: ResourceTitle }));
    c.add('Fill', 'core.resource.view.actions', fill(slots.resource.view.footer, { render: Actions }));
    c.add('Fill', 'core.resource.view.missing', fill(slots.resource.view.missing, { order: 1000, render: ResourceMissing }));
    // Its summary: being deleted, said first; its kind's columns as fields — a field, its label, its value each a slot (the core's the last).
    const summary = slots.resource.view.summary;
    c.add('Fill', 'core.resource.view.summary.deleting', fill(summary, { order: 0, render: Deleting }));
    c.add('Fill', 'core.resource.view.summary.fields', fill(summary, { render: SummaryFields }));
    c.add('Fill', 'core.resource.view.summary.field', fill(summary.field, { order: 1000, render: field(summary.field.label, summary.field.value, true) }));
    c.add('Fill', 'core.resource.view.summary.field.label', fill(summary.field.label, { render: FieldLabel }));
    c.add('Fill', 'core.resource.view.summary.field.value', fill(summary.field.value, { render: SummaryValue }));
    // Its sections: its conditions (where it has them), its metadata, its YAML (last) — their parts each a slot.
    c.add('Fill', 'core.resource.view.conditions', section({ order: 100, when: ({ object }) => conditionsOf(object).length > 0, render: Conditions }));
    const condition = slots.resource.view.conditions.condition;
    c.add('Fill', 'core.resource.view.conditions.condition', fill(condition, { order: 1000, render: ConditionRow }));
    c.add('Fill', 'core.resource.view.conditions.condition.type', fill(condition.type, { render: ConditionType }));
    c.add('Fill', 'core.resource.view.conditions.condition.status', fill(condition.status, { render: ConditionStatus }));
    c.add('Fill', 'core.resource.view.conditions.condition.reason', fill(condition.reason, { render: ConditionReason }));
    c.add('Fill', 'core.resource.view.conditions.condition.message', fill(condition.message, { render: ConditionMessage }));
    c.add('Fill', 'core.resource.view.conditions.condition.changed', fill(condition.changed, { render: ConditionChanged }));
    c.add('Fill', 'core.resource.view.metadata', section({ order: 900, render: Metadata }));
    const metadata = slots.resource.view.metadata;
    // Its fields, each a fill (100 to 700): another's field among them, by order or by before/after one of these.
    for (const [i, [name, render]] of METADATA.entries()) c.add('Fill', `core.resource.view.metadata.${name}`, fill(metadata, { order: (i + 1) * 100, render }));
    c.add('Fill', 'core.resource.view.metadata.field', fill(metadata.field, { order: 1000, render: field(metadata.field.label, metadata.field.value) }));
    c.add('Fill', 'core.resource.view.metadata.field.label', fill(metadata.field.label, { render: FieldLabel }));
    c.add('Fill', 'core.resource.view.metadata.field.value', fill(metadata.field.value, { render: MetadataValue }));
    c.add('Fill', 'core.resource.view.metadata.label', fill(metadata.label, { order: 1000, render: LabelChip }));
    c.add('Fill', 'core.resource.view.metadata.annotation', fill(metadata.annotation, { order: 1000, render: LabelChip }));
    c.add('Fill', 'core.resource.view.metadata.owner', fill(metadata.owner, { order: 1000, render: Owner }));
    c.add('Fill', 'core.resource.view.metadata.finalizer', fill(metadata.finalizer, { order: 1000, render: Finalizer }));

    // Defaults that yield: another's add of one takes its place.
    const fallback = { fallback: true };
    // The columns: every kind's (name, namespace, age), the usual kinds' own; a CRD's, as it says them (drawn by its tables).
    addColumns(c);
    c.add('Fill', 'core.resource.view.yaml', section({ title: 'YAML', order: 1000, render: YamlSection }));

    for (const [i, [name, title]] of CATEGORIES.entries()) c.add('Category', name, { title, order: i * 10 }, fallback);
    for (const [i, [kind, category, icon, pinned]] of USUAL.entries()) {
      const view: KindViewSpec = { title: titleOf(kind), category, icon, order: i * 10, ...(pinned ? { pinned } : {}) };
      c.add('KindView', kind.id, view, fallback);
    }

    // The slots declared — what the user arranges in them (order, hidden) waits for that: every one the SDK names, and the core's pages'.
    for (const name of [...slotNames(slots), slots.page('overview').name, slots.page('kind').name]) c.add('Slot', name, {}, fallback);

    // How it looks: the kit's own theme (no tokens of its own: the kit's defaults), as the system is (dark or light).
    c.add('Theme', 'default', { title: 'overkube' }, fallback);
    c.add('Appearance', 'default', { theme: 'default', mode: 'system' }, fallback);
    // The language: as the browser's, until the user says otherwise; English said as given — there to reword (a patch).
    c.add('Language', 'default', { locale: 'system' }, fallback);
    c.add('Messages', 'en:core', { messages: {} }, fallback);
    c.add('Messages', 'en:shell', { messages: {} }, fallback);

    // The navigation: tabs, or the menu — as the NavView says (one setting, the user's to patch).
    c.add('NavView', 'default', { mode: 'tabs' }, fallback);
    // The tabs as the user made them (pinned, moved, opened, closed): while the page runs — the user's layer's, once there is one.
    const tabs: TabsState = { kept: signal<TabsKept>({ open: [] }), side: signal<'collapsed' | 'pinned' | undefined>(undefined) };
    c.add('Fill', 'core.nav.tabs', { slot: slots.nav.tabs.name, render: () => <NavTabs tabs={tabs} /> });
    // A tab: the core's the last (another's for some kinds draws it whole); in it, its title — others before or after it.
    c.add('Fill', 'core.nav.tabs.tab', fill(slots.nav.tabs.tab, { order: 1000, render: NavTab }));
    c.add('Fill', 'core.nav.tabs.tab.title', fill(slots.nav.tabs.tab.content, { render: ({ entry }) => <>{entry.title}</> }));
    c.add('Fill', 'core.nav.tabs.tab.mark', fill(slots.nav.tabs.tab.mark, { order: 1000, render: NavTabMark }));
    // After the tabs: the core's + (the kinds' picker) — others' buttons before or after it.
    c.add('Fill', 'core.nav.tabs.picker', { slot: slots.nav.tabs.actions.name, render: PickerButton });
    // The picker (nav.picker): the core's whole, the last; its parts each a slot — its search, its groups, an item and its title.
    c.add('Fill', 'core.nav.picker', fill(slots.nav.picker, { order: 1000, render: Picker }));
    c.add('Fill', 'core.nav.picker.search', fill(slots.nav.picker.header, { render: PickerSearch }));
    c.add('Fill', 'core.nav.picker.groups', fill(slots.nav.picker.content, { render: PickerGroups }));
    c.add('Fill', 'core.nav.picker.item', fill(slots.nav.picker.item, { order: 1000, render: PickerItem }));
    c.add('Fill', 'core.nav.picker.item.title', fill(slots.nav.picker.item.content, { render: ({ entry, query }) => <Highlight text={entry.title} query={query} /> }));
    // A tab's menu: pinned or not, closed (an open one).
    c.add(
      'MenuItem',
      'core.nav.tabs.tab.context.pin',
      menuItem({
        on: 'nav.tabs.tab.context',
        group: 'state',
        title: T.nav.tabs.tab.context.pin,
        icon: 'pin',
        when: (t) => !t.pinned,
        run: (t) => t.pin(true),
      }),
    );
    c.add(
      'MenuItem',
      'core.nav.tabs.tab.context.unpin',
      menuItem({
        on: 'nav.tabs.tab.context',
        group: 'state',
        title: T.nav.tabs.tab.context.unpin,
        icon: 'pin-off',
        when: (t) => t.pinned,
        run: (t) => t.pin(false),
      }),
    );
    c.add(
      'MenuItem',
      'core.nav.tabs.tab.context.close',
      menuItem({
        on: 'nav.tabs.tab.context',
        group: 'state',
        order: 900,
        title: T.nav.tabs.tab.context.close,
        icon: 'x',
        keys: 'delete',
        when: (t) => !t.pinned,
        run: (t) => t.close(),
      }),
    );
    c.add('Fill', 'core.menu', { slot: slots.menu.name, render: Menu });
    c.add('Fill', 'core.nav.side', { slot: slots.nav.side.name, render: () => <NavSide tabs={tabs} /> });
    c.add('Fill', 'core.notifications', { slot: slots.notifications.name, render: Toasts });

    // Every kind served has its table's view (empty: the columns' own order), for others — the user too — to patch.
    const viewed = new Set<string>();
    effect(() => {
      for (const id of cluster.discovery.kinds.value?.keys() ?? []) {
        if (viewed.has(id)) continue;
        viewed.add(id);
        // Events, as kubectl lists them: the last seen first.
        c.add('TableView', id, id === core.v1.Event.id ? { sort: { column: `core.${id}.last-seen`, descending: true } } : {}, fallback);
      }
    });
  },
});

export { Menu } from './Menu.tsx';
export { NavSide, NavTab, NavTabMark, NavTabs, Picker, PickerButton, PickerGroups, PickerItem, PickerPopover, PickerSearch, type TabsKept, type TabsState } from './Nav.tsx';
export { currentOf, type Nav, type NavEntry, type NavGroup, navOf, useNav } from './nav.ts';
