import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { column, defineAddon, type KindViewSpec, type Label, menuItem, section, slots } from '@overkube/sdk';
import { Age } from '@overkube/uikit';
import { signal } from '@preact/signals';
import { Home, KindPage, NameCell, TablePage } from './KindPage.tsx';
import { titleOf } from './kinds.ts';
import { Menu } from './Menu.tsx';
import { NavSide, NavTabs, type TabsKept, type TabsState } from './Nav.tsx';
import { ObjectView, YamlSection } from './ObjectView.tsx';
import { Toasts } from './Toasts.tsx';
import { T } from './texts.ts';

/*
 * The core: everything the page shows that is not another addon's, each a
 * definition another may patch, hide or put its own in place of —
 *
 *   pages      the start (/), a kind's page (/k/<kind>/*): its table (kind.page) and an object over it
 *              (object.view) — each the last in its slot: another's for a kind takes its place
 *   columns    every kind's: its objects' names (a link to each), namespaces, ages
 *   objects    their YAML, as the last section
 *   navigation as tabs across the top, or as a menu down the side (NavView: the user's to switch)
 *   kinds      the usual ones grouped (Workloads, Network, …), the most used pinned; every one served,
 *              a table's view (TableView) — all of these defaults that yield (fallback adds): another's
 *              add takes their place, the user's patches go over whichever is there
 *   looks      the kit's own theme, dark or light as the system is (Appearance: the user's to change;
 *              another addon's Theme to choose); the language, the browser's (Language) — its words by
 *              key (texts.ts), in English until a language pack says them otherwise
 *   overlay    what the user is told
 */

const { core, apps, batch, networking, storage } = kinds;

/** The usual kinds: their group, and those pinned (tabs) at first. */
const USUAL: [KindInfo, string, boolean][] = [
  [core.v1.Pod, 'workloads', true],
  [apps.v1.Deployment, 'workloads', true],
  [apps.v1.StatefulSet, 'workloads', false],
  [apps.v1.DaemonSet, 'workloads', false],
  [apps.v1.ReplicaSet, 'workloads', false],
  [batch.v1.Job, 'workloads', false],
  [batch.v1.CronJob, 'workloads', false],
  [core.v1.Service, 'network', true],
  [networking.v1.Ingress, 'network', false],
  [networking.v1.NetworkPolicy, 'network', false],
  [core.v1.ConfigMap, 'config', true],
  [core.v1.Secret, 'config', false],
  [core.v1.PersistentVolumeClaim, 'storage', false],
  [core.v1.PersistentVolume, 'storage', false],
  [storage.v1.StorageClass, 'storage', false],
  [core.v1.Node, 'cluster', true],
  [core.v1.Namespace, 'cluster', true],
  [core.v1.Event, 'cluster', false],
];

const CATEGORIES: [string, Label][] = [
  ['workloads', T.categories.workloads],
  ['network', T.categories.network],
  ['config', T.categories.config],
  ['storage', T.categories.storage],
  ['cluster', T.categories.cluster],
];

const AgeCell = ({ object }: { object: KubeObject }) => <Age since={object.metadata?.creationTimestamp} />;

export default defineAddon({
  id: 'core',
  title: 'Core',
  layer: 'core',
  setup({ contributor: c, cluster, effect }) {
    c.add('Route', 'core.home', { path: '/', render: Home });
    c.add('Route', 'core.kind', { path: '/k/:kind/*', render: KindPage });
    // The last in their slots (order 1000): another's fill for a kind is drawn in their place.
    c.add('Fill', 'core.table', { slot: slots.kind.page.name, order: 1000, render: TablePage });
    c.add('Fill', 'core.object', { slot: slots.object.view.name, order: 1000, render: ObjectView });

    c.add('Column', 'core.name', column({ header: T.columns.name, order: 0, value: (o) => o.metadata?.name, render: NameCell }));
    c.add('Column', 'core.namespace', column({ header: T.columns.namespace, order: 10, value: (o) => o.metadata?.namespace }));
    c.add('Column', 'core.age', column({ header: T.columns.age, order: 900, width: 90, value: (o) => o.metadata?.creationTimestamp, render: AgeCell }));
    c.add('Fill', 'core.yaml', section({ title: 'YAML', order: 1000, render: YamlSection }));

    // Defaults that yield: another's add of one takes its place.
    const fallback = { fallback: true };
    for (const [i, [name, title]] of CATEGORIES.entries()) c.add('Category', name, { title, order: i * 10 }, fallback);
    for (const [i, [kind, category, pinned]] of USUAL.entries()) {
      const view: KindViewSpec = { title: titleOf(kind), category, order: i * 10, ...(pinned ? { pinned } : {}) };
      c.add('KindView', kind.id, view, fallback);
    }

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
    const tabs: TabsState = { kept: signal<TabsKept>({ open: [] }) };
    c.add('Fill', 'core.nav.tabs', { slot: slots.nav.top.name, render: () => <NavTabs tabs={tabs} /> });
    // A tab's menu: pinned or not, closed (an open one).
    c.add(
      'MenuItem',
      'core.tab.pin',
      menuItem({ on: 'nav.tab', group: 'state', title: T.nav.tab.pin, icon: 'pin', when: (t) => !t.pinned, run: (t) => tabs.act?.pin(t.key, true) }),
    );
    c.add(
      'MenuItem',
      'core.tab.unpin',
      menuItem({ on: 'nav.tab', group: 'state', title: T.nav.tab.unpin, icon: 'pin-off', when: (t) => t.pinned, run: (t) => tabs.act?.pin(t.key, false) }),
    );
    c.add(
      'MenuItem',
      'core.tab.close',
      menuItem({ on: 'nav.tab', group: 'state', order: 900, title: T.nav.tab.close, icon: 'x', keys: 'delete', when: (t) => !t.pinned, run: (t) => tabs.act?.close(t.key) }),
    );
    c.add('Fill', 'core.menu', { slot: slots.menu.name, render: Menu });
    c.add('Fill', 'core.nav.side', { slot: slots.nav.side.name, render: NavSide });
    c.add('Fill', 'core.toasts', { slot: slots.notifications.name, render: Toasts });

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
export { KindPicker, NavSide, NavTabs, type TabsKept, type TabsState } from './Nav.tsx';
export { currentOf, type Nav, type NavEntry, type NavGroup, navOf, useNav } from './nav.ts';
