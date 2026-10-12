import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { column, defineAddon, KIND_PAGE, type KindViewSpec, type Label, type MenuPage, menuItem, openIn, section, slots } from '@overkube/sdk';
import { Age, copyText, Highlight, toYaml } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { CoreTable, TableEmpty } from './CoreTable.tsx';
import { titleOf } from './kinds.ts';
import { Menu } from './Menu.tsx';
import { NavSide, NavTab, NavTabMark, NavTabs, Picker, PickerButton, PickerGroups, PickerItem, PickerSearch, type TabsKept, type TabsState } from './Nav.tsx';
import { Home, KindMissing, NameCell, PageTable } from './pages.tsx';
import { Actions, ResourceMissing, ResourceTitle, ResourceView, YamlSection } from './ResourceView.tsx';
import { Toasts } from './Toasts.tsx';
import { T } from './texts.ts';

/*
 * The core: everything the page shows that is not another addon's, each a
 * definition another may patch, hide or put its own in place of —
 *
 *   pages      the start (/: page.home — to the first pinned kind, till another puts something there),
 *              a kind's page (/k/<kind>: page.kind) — its table among what is on it; a resource opened over any page (resource.view, the last in its slot: another's for a kind
 *              takes its place)
 *   tables     a kind's table, wherever drawn (kind.table: the last in its slot)
 *   columns    every kind's: its objects' names (a link to each), namespaces, ages
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
 * Its names: a fill core.<slot> when it is all of its slot's (core.page.home,
 * core.notifications), core.<slot>.<what> when it is a part — the slot named
 * without the frame part it is in (.content, .header, .footer, .actions,
 * .sections): core.nav.tabs.tab.title is in nav.tabs.tab.content,
 * core.resource.view.yaml in resource.view.sections; a menu's item
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

const AgeCell = ({ object }: { object: KubeObject }) => <Age since={object.metadata?.creationTimestamp} />;

export default defineAddon({
  id: 'core',
  title: 'Core',
  layer: 'core',
  setup({ contributor: c, cluster, effect }) {
    // Its pages: the start, a kind's — each empty but for what fills it: the core's, others' before or after it (a Wrap of it in its place).
    c.add('Page', 'home', { path: '/' });
    c.add('Fill', 'core.page.home', fill(slots.page('home'), { render: Home }));
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

    c.add('Column', 'core.name', column({ header: T.columns.name, order: 0, value: (o) => o.metadata?.name, render: NameCell }));
    c.add('Column', 'core.namespace', column({ header: T.columns.namespace, order: 10, value: (o) => o.metadata?.namespace }));
    c.add('Column', 'core.age', column({ header: T.columns.age, order: 900, width: 90, value: (o) => o.metadata?.creationTimestamp, render: AgeCell }));
    c.add('Fill', 'core.resource.view.yaml', section({ title: 'YAML', order: 1000, render: YamlSection }));

    // Defaults that yield: another's add of one takes its place.
    const fallback = { fallback: true };
    for (const [i, [name, title]] of CATEGORIES.entries()) c.add('Category', name, { title, order: i * 10 }, fallback);
    for (const [i, [kind, category, icon, pinned]] of USUAL.entries()) {
      const view: KindViewSpec = { title: titleOf(kind), category, icon, order: i * 10, ...(pinned ? { pinned } : {}) };
      c.add('KindView', kind.id, view, fallback);
    }

    // The slots declared — what the user arranges in them (order, hidden) waits for that: every one the SDK names, and the core's pages'.
    for (const name of [...slotNames(slots), slots.page('home').name, slots.page('kind').name]) c.add('Slot', name, {}, fallback);

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
        c.add('TableView', id, {}, fallback);
      }
    });
  },
});

export { Menu } from './Menu.tsx';
export { NavSide, NavTab, NavTabMark, NavTabs, Picker, PickerButton, PickerGroups, PickerItem, PickerPopover, PickerSearch, type TabsKept, type TabsState } from './Nav.tsx';
export { currentOf, type Nav, type NavEntry, type NavGroup, navOf, useNav } from './nav.ts';
