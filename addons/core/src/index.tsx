import { type KindInfo, kinds } from '@overkube/kube-types';
import {
  defineAddon,
  forKinds,
  KIND_PAGE,
  type KindTableProps,
  type KindViewSpec,
  type Label,
  type MenuPage,
  menuItem,
  openIn,
  type ResourceRef,
  section,
  slots,
} from '@overkube/sdk';
import { copyText, toYaml } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { ColumnsButton } from './ColumnsMenu.tsx';
import { CoreTable, TableEmpty } from './CoreTable.tsx';
import { addColumns } from './columns.tsx';
import {
  AllEvents,
  CONTROLLER,
  ConditionChanged,
  ConditionMessage,
  ConditionReason,
  ConditionRow,
  ConditionStatus,
  Conditions,
  ConditionType,
  conditionsOf,
  Deleting,
  EventMessage,
  EventReason,
  EventRow,
  EventSeen,
  EventType,
  FieldLabel,
  Finalizer,
  field,
  LabelChip,
  LabelLink,
  METADATA,
  Metadata,
  MetadataValue,
  OWNERS,
  Owner,
  RecentEvents,
  Related,
  RelatedValue,
  SummaryFields,
  SummaryValue,
} from './details.tsx';
import { KindFilter } from './filter.tsx';
import { Brand, KindApi, KindCount, KindHeader, KindTitle } from './headers.tsx';
import { addApi } from './kinds/api.tsx';
import { addConfig } from './kinds/config.tsx';
import { addNamespace } from './kinds/namespace.tsx';
import { addNetwork } from './kinds/network.tsx';
import { addNode } from './kinds/node.tsx';
import { addPod } from './kinds/pod.tsx';
import { addPointings } from './kinds/pointing.tsx';
import { addRbac } from './kinds/rbac.tsx';
import { addScaling } from './kinds/scaling.tsx';
import { addService } from './kinds/service.tsx';
import { addStorage } from './kinds/storage.tsx';
import { addWorkloads } from './kinds/workloads.tsx';
import { titleOf } from './kinds.ts';
import { LOGGED, PodLogs, WorkloadLogs } from './logs.tsx';
import { Menu } from './Menu.tsx';
import { addMap } from './map/map.tsx';
import { addMapPage } from './map/page.tsx';
import { addMarks } from './marks.tsx';
import { NavSide, NavTab, NavTabMark, NavTabs, PickerButton, type TabsState } from './Nav.tsx';
import { type Chosen, KindNamespaces, NamespacePicker } from './namespaces.tsx';
import { addOverview } from './overview.tsx';
import { KindMissing, Overview, PageTable } from './pages.tsx';
import { Picker, PickerContent, PickerEmpty, PickerItem, PickerItemTitle, PickerSearch, PickerSection, PickerSectionTitle, PickerSide } from './picker.tsx';
import { Actions, LayoutSwitch, ResourceMissing, ResourceOverview, ResourceTitle, ResourceView, Yaml } from './ResourceView.tsx';
import { Owned } from './relations.tsx';
import { HeaderSearch } from './search.tsx';
import { OWN_THEME, SETTINGS_PATH, SettingsButton, SettingsPage } from './settings.tsx';
import { addStatusLooks } from './statuses.tsx';
import { Toasts } from './Toasts.tsx';
import { T } from './texts.ts';
import { addTips } from './tips.tsx';

/*
 * The core: everything the page shows that is not another addon's, each a
 * definition another may patch, hide or put its own in place of —
 *
 *   pages      the start (/: page.overview — the dashboard, overview.tsx; that hidden and nothing else there, to the first pinned kind),
 *              a kind's page (/k/<kind>: page.kind) — its table among what is on it; a resource opened over any page (resource.view, the last in its slot: another's for a kind
 *              takes its place)
 *   headers    the page's (its mark and name at header.start); a kind's over its table (kind.header: the last in its
 *              slot — its title, the line under it, its actions each a slot of their own)
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
 * core.resource.view.conditions in resource.view.sections — a section named for
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

const CATEGORIES: [string, Label, string][] = [
  ['workloads', T.categories.workloads, 'cube'],
  ['network', T.categories.network, 'network'],
  ['config', T.categories.config, 'file'],
  ['storage', T.categories.storage, 'disk'],
  ['cluster', T.categories.cluster, 'server'],
  // How what runs got there (Helm's, Flux's): one category the addons that deliver share, its own here (two declaring it, one refused).
  ['delivery', T.categories.delivery, 'rocket'],
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
    // A kind's page: for one who may list it (somewhere).
    c.add('Page', 'kind', { path: KIND_PAGE, needs: [{ verb: 'list' }] });
    c.add('Fill', 'core.page.kind.table', fill(slots.page('kind'), { render: PageTable }));
    // Its kind not found (not served, not known yet): why, in the table's place.
    c.add('Fill', 'core.page.kind.missing', fill(slots.page('kind'), { when: (p) => !p.kind, render: KindMissing }));
    // The page's header: its mark and name at its start.
    c.add('Fill', 'core.header.brand', fill(slots.header.start, { order: 0, render: Brand }));
    // The namespaces the tables show (none chosen: all), chosen at its end — kept while the page runs (the user's layer's, once there is one).
    const namespaces: Chosen = signal<readonly string[]>([]);
    // A search of every kind (/, ⌘K), before the namespaces.
    c.add('Fill', 'core.header.search', fill(slots.header.end, { order: 100, render: () => <HeaderSearch chosen={namespaces} /> }));
    c.add('Fill', 'core.header.namespaces', fill(slots.header.end, { render: () => <NamespacePicker chosen={namespaces} /> }));
    // The settings: a page of its own, off the navigation — reached by the gear at the header's end, after the namespaces.
    c.add('Page', 'settings', { path: SETTINGS_PATH, title: T.page.settings.title, icon: 'gear', hidden: true });
    c.add('Fill', 'core.page.settings', fill(slots.page('settings'), { render: SettingsPage }));
    c.add('Fill', 'core.header.settings', fill(slots.header.end, { after: 'core.header.namespaces', render: SettingsButton }));
    addOverview(c, namespaces);
    // A kind's header over its table: the last in its slot (another's for a kind in its place); its title, its group and version, how many, its columns.
    const header = slots.kind.header;
    c.add('Fill', 'core.kind.header', fill(header, { order: 1000, render: KindHeader }));
    c.add('Fill', 'core.kind.header.title', fill(header.title, { render: KindTitle }));
    c.add('Fill', 'core.kind.header.api', fill(header.sub, { order: 100, render: KindApi }));
    c.add('Fill', 'core.kind.header.namespaces', fill(header.sub, { order: 150, render: (p) => <KindNamespaces {...p} chosen={namespaces} /> }));
    c.add('Fill', 'core.kind.header.count', fill(header.sub, { order: 200, render: (p) => <KindCount {...p} chosen={namespaces} /> }));
    // Its filter (?filter=, the page's): over its table, before its columns — one for each kind (one's typing not another's).
    c.add('Fill', 'core.kind.header.filter', fill(header.actions, { order: 500, render: (p) => <KindFilter key={p.kind.id} {...p} chosen={namespaces} /> }));
    c.add('Fill', 'core.kind.filter', fill(slots.kind.filter, { render: (p) => <KindFilter key={p.kind.id} {...p} chosen={namespaces} /> }), { fallback: true });
    // Its columns' settings, over its table: the user's to turn on and off.
    c.add('Fill', 'core.kind.header.columns', fill(header.actions, { order: 1000, render: ColumnsButton }));
    // At its end, last: its columns, to show or hide.
    // A kind's table, wherever drawn: the last in its slot (order 1000) — another's for a kind is drawn in its place.
    c.add('Fill', 'core.kind.table', { slot: slots.kind.table.name, order: 1000, render: (p: KindTableProps) => <CoreTable {...p} chosen={namespaces} /> });
    // Its table's parts: a column's title in its header (others beside it), no rows said (another's in its place).
    c.add('Fill', 'core.kind.table.column.title', fill(slots.kind.table.column.content, { render: ({ column }) => <>{column.header}</> }));
    c.add('Fill', 'core.kind.table.empty', fill(slots.kind.table.empty, { order: 1000, render: (p) => <TableEmpty {...p} chosen={namespaces} /> }));
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
    // How it is laid out (a side panel, a window, all the window): one for all of them, switched in its header — kept while the page runs.
    c.add('Fill', 'core.resource.view', { slot: slots.resource.view.name, order: 1000, render: (p: ResourceRef) => <ResourceView {...p} /> });
    c.add('Fill', 'core.opened.layout', fill(slots.opened.header, { order: 1000, render: () => <LayoutSwitch /> }));
    // Its tabs: the Overview (its summary, its sections), its YAML — every kind's, another's among them.
    c.add('ResourceTab', 'core.overview', { target: {}, title: T.resource.view.tabs.overview, icon: 'grid', order: 100 });
    c.add('Fill', 'core.resource.view.overview', fill(slots.resource.view.tab('core.overview'), { render: ResourceOverview }));
    // What they need of the cluster (needs): one who may not have it is not shown them (the access layer).
    c.add('ResourceTab', 'core.events', { target: {}, title: T.resource.view.tabs.events, icon: 'activity', order: 200, needs: [{ verb: 'list', resource: 'events' }] });
    c.add('Fill', 'core.resource.view.events', fill(slots.resource.view.tab('core.events'), { render: AllEvents }));
    c.add('ResourceTab', 'core.yaml', { target: {}, title: T.resource.view.tabs.yaml, icon: 'file', order: 1000 });
    c.add('Fill', 'core.resource.view.yaml', fill(slots.resource.view.tab('core.yaml'), { render: Yaml }));
    // A log's: a pod's (its containers), a workload's (its pods') — before the YAML.
    c.add('ResourceTab', 'core.logs', {
      target: forKinds(LOGGED.pod, ...LOGGED.workloads),
      title: T.resource.view.tabs.logs,
      icon: 'file-text',
      order: 900,
      needs: [{ verb: 'get', resource: 'pods', subresource: 'log' }],
    });
    c.add(
      'Fill',
      'core.resource.view.logs',
      fill(slots.resource.view.tab('core.logs'), { render: (p) => (p.kind.id === LOGGED.pod.id ? <PodLogs {...p} /> : <WorkloadLogs {...p} />) }),
    );
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
    c.add('Fill', 'core.resource.view.recent-events', section({ order: 200, render: RecentEvents }));
    const event = slots.resource.view.events.event;
    c.add('Fill', 'core.resource.view.events.event', fill(event, { order: 1000, render: EventRow }));
    c.add('Fill', 'core.resource.view.events.event.type', fill(event.type, { render: EventType }));
    c.add('Fill', 'core.resource.view.events.event.reason', fill(event.reason, { render: EventReason }));
    c.add('Fill', 'core.resource.view.events.event.message', fill(event.message, { render: EventMessage }));
    c.add('Fill', 'core.resource.view.events.event.seen', fill(event.seen, { render: EventSeen }));
    c.add('Fill', 'core.resource.view.related', section({ order: 800, render: Related }));
    const related = slots.resource.view.related;
    c.add('Fill', 'core.resource.view.related.controller', fill(related, { order: 90, render: CONTROLLER }));
    c.add('Fill', 'core.resource.view.related.owners', fill(related, { order: 100, render: OWNERS }));
    // What it owns, a line for each kind (and what those own in turn): after what points at it.
    c.add('Fill', 'core.resource.view.related.owned', fill(related, { order: 900, render: Owned }));
    c.add('Fill', 'core.resource.view.related.field', fill(related.field, { order: 1000, render: field(related.field.label, related.field.value) }));
    c.add('Fill', 'core.resource.view.related.field.label', fill(related.field.label, { render: FieldLabel }));
    c.add('Fill', 'core.resource.view.related.field.value', fill(related.field.value, { render: RelatedValue }));
    c.add('Fill', 'core.resource.view.related.owner', fill(related.owner, { order: 1000, render: Owner }));
    c.add('Fill', 'core.resource.view.metadata', section({ order: 900, render: Metadata }));
    // What manages it (its kind's NameMarks): after its title, and in full under Managed By.
    addMarks(c);
    // An object's map (its Map tab), of the kinds a scope takes.
    addMap(c);
    addMapPage(c);
    // The usual kinds' own: their sections, related fields.
    addPod(c);
    addWorkloads(c);
    addService(c);
    addNode(c);
    addNamespace(c);
    addApi(c);
    addConfig(c);
    addNetwork(c);
    addRbac(c);
    addStorage(c);
    addScaling(c);
    addPointings(c);
    const metadata = slots.resource.view.metadata;
    // Its fields, each a fill (100 to 700): another's field among them, by order or by before/after one of these.
    for (const [i, [name, render]] of METADATA.entries()) c.add('Fill', `core.resource.view.metadata.${name}`, fill(metadata, { order: (i + 1) * 100, render }));
    c.add('Fill', 'core.resource.view.metadata.field', fill(metadata.field, { order: 1000, render: field(metadata.field.label, metadata.field.value) }));
    c.add('Fill', 'core.resource.view.metadata.field.label', fill(metadata.field.label, { render: FieldLabel }));
    c.add('Fill', 'core.resource.view.metadata.field.value', fill(metadata.field.value, { render: MetadataValue }));
    c.add('Fill', 'core.resource.view.metadata.label', fill(metadata.label, { order: 1000, render: LabelLink }));
    c.add('Fill', 'core.resource.view.metadata.annotation', fill(metadata.annotation, { order: 1000, render: LabelChip }));
    c.add('Fill', 'core.resource.view.metadata.finalizer', fill(metadata.finalizer, { order: 1000, render: Finalizer }));

    // Defaults that yield: another's add of one takes its place.
    const fallback = { fallback: true };
    // The columns: every kind's (name, namespace, age), the usual kinds' own; a CRD's, as it says them (drawn by its tables).
    addColumns(c);
    addTips(c);
    // How states look (a pod's, a node's, any object's): defaults another's of a name takes the place of.
    addStatusLooks(c);

    for (const [i, [name, title, icon]] of CATEGORIES.entries()) c.add('Category', name, { title, icon, order: i * 10 }, fallback);
    for (const [i, [kind, category, icon, pinned]] of USUAL.entries()) {
      const view: KindViewSpec = { title: titleOf(kind), category, icon, order: i * 10, ...(pinned ? { pinned } : {}) };
      c.add('KindView', kind.id, view, fallback);
    }

    // The slots declared — what the user arranges in them (order, hidden) waits for that: every one the SDK names, and the core's pages'.
    for (const name of [
      ...slotNames(slots),
      slots.page('overview').name,
      slots.page('settings').name,
      slots.page('kind').name,
      slots.page('map').name,
      ...['core.overview', 'core.events', 'core.yaml', 'core.logs', 'core.map'].map((t) => slots.resource.view.tab(t).name),
    ])
      c.add('Slot', name, {}, fallback);

    // How it looks: the kit's own theme (no tokens of its own: the kit's defaults), as the system is (dark or light).
    c.add('Theme', 'default', { title: 'overkube' }, fallback);
    // One's own, bare: its tokens the user's (made in the settings).
    c.add('Theme', OWN_THEME, { title: T.page.settings.ownTheme.en as string }, fallback);
    c.add('Appearance', 'default', { theme: 'default', mode: 'system' }, fallback);
    // The language: as the browser's, until the user says otherwise; English said as given — there to reword (a patch).
    c.add('Language', 'default', { locale: 'system' }, fallback);
    c.add('Messages', 'en:core', { messages: {} }, fallback);
    c.add('Messages', 'en:shell', { messages: {} }, fallback);

    // The navigation: tabs, or the menu — as the NavView says (one setting, the user's to patch).
    c.add('NavView', 'default', { mode: 'tabs' }, fallback);
    // The namespaces one may use without listing them: the page's guess, the user's own (added in the picker).
    c.add('Namespaces', 'default', {}, fallback);
    // Which addons the user turned on, whose suggestion they put off: none, until they say (theirs to patch).
    c.add('AddonChoices', 'default', {}, fallback);
    // The tabs open (opened, closed, moved: this visit's), while the page runs; those pinned, the side rail pinned: the user's (the NavView, patched).
    const tabs: TabsState = { open: signal<string[]>([]) };
    c.add('Fill', 'core.nav.tabs', { slot: slots.nav.tabs.name, render: () => <NavTabs tabs={tabs} /> });
    // A tab: the core's the last (another's for some kinds draws it whole); in it, its title — others before or after it.
    c.add('Fill', 'core.nav.tabs.tab', fill(slots.nav.tabs.tab, { order: 1000, render: NavTab }));
    c.add('Fill', 'core.nav.tabs.tab.title', fill(slots.nav.tabs.tab.content, { render: ({ entry }) => <>{entry.title}</> }));
    c.add('Fill', 'core.nav.tabs.tab.mark', fill(slots.nav.tabs.tab.mark, { order: 1000, render: NavTabMark }));
    // After the tabs: the core's + (the kinds' picker) — others' buttons before or after it.
    c.add('Fill', 'core.nav.tabs.picker', { slot: slots.nav.tabs.actions.name, render: PickerButton });
    // The picker (nav.picker): the core's whole, the last (pinning there: the tabs'); its parts each a slot — its search, its
    // side (a section whole, the last; its title), what the chosen one shows (an entry whole, the last; its title), nothing to show.
    const picker = slots.nav.picker;
    c.add('Fill', 'core.nav.picker', fill(picker, { order: 1000, render: (p) => <Picker {...p} tabs={tabs} /> }));
    c.add('Fill', 'core.nav.picker.search', fill(picker.header, { render: PickerSearch }));
    c.add('Fill', 'core.nav.picker.side', fill(picker.side, { render: PickerSide }));
    c.add('Fill', 'core.nav.picker.section', fill(picker.section, { order: 1000, render: PickerSection }));
    c.add('Fill', 'core.nav.picker.section.title', fill(picker.section.content, { render: PickerSectionTitle }));
    c.add('Fill', 'core.nav.picker.content', fill(picker.content, { render: PickerContent }));
    c.add('Fill', 'core.nav.picker.item', fill(picker.item, { order: 1000, render: (p) => <PickerItem {...p} chosen={namespaces} /> }));
    c.add('Fill', 'core.nav.picker.item.title', fill(picker.item.content, { render: PickerItemTitle }));
    c.add('Fill', 'core.nav.picker.empty', fill(picker.empty, { order: 1000, render: PickerEmpty }));
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
export { NavSide, NavTab, NavTabMark, NavTabs, PickerButton, PickerPopover, type TabsState, useTabs } from './Nav.tsx';
export { currentOf, type Nav, type NavEntry, type NavGroup, navOf, useNav } from './nav.ts';
export { Picker, PickerContent, PickerEmpty, PickerItem, PickerItemTitle, PickerSearch, PickerSection, PickerSectionTitle, PickerSide } from './picker.tsx';
