import { kinds } from '@overkube/kube-types';
import { action, type CellProps, column, defineAddon, forKinds, menuItem, type NavTabProps, type PageProps, type ResourceProps, section, slots, t, wrap } from '@overkube/sdk';
import { KindTable, tipField, usePageProps } from '@overkube/sdk/preact';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { mount, renderPage } from '@overkube/testkit/preact';
import { LEAVE_MS, PEEK_MS, TabButton } from '@overkube/uikit';
import { fill, slotElement } from '@overweave/ui/preact';
import { fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orderOf } from './CoreTable.tsx';
import core from './index.tsx';
import { pinnedOf } from './Nav.tsx';
import { ConditionTip } from './tips.tsx';

/*
 * The page the core draws, as its user sees it — over the testkit's world,
 * as any addon's author would test theirs beside it: a kind's table (its
 * columns, as others set them out; its states; a failure its owner's), an
 * object opened over it and its actions, the navigation (tabs; the menu
 * instead), the start, another addon's page, what the user is told.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { Pod, Namespace, Node } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

/** A world with the core and some pods. */
function world(...names: string[]) {
  const w = kubeWorld();
  for (const name of names) w.cluster.add(Pod, make(Pod, { metadata: { name, namespace: 'shop' } }));
  w.addon(core);
  return w;
}

const addon = (id: string, setup: Parameters<typeof defineAddon>[0]['setup']) => defineAddon({ id, title: id, setup });

describe('a kind’s table', () => {
  it('is drawn through its slots and its columns’ Wraps: beside a column’s title, around a cell (for Pods, as it says), over the table, in place of no rows', () => {
    const w = world('web', 'db');
    w.addon(
      addon('more', ({ contributor }) => {
        contributor.add(
          'Fill',
          'more.age-hint',
          fill(slots.kind.table.column.content, { after: 'core.kind.table.column.title', when: ({ column }) => column.name === 'core.age', render: () => <i>?</i> }),
        );
        contributor.add(
          'Wrap',
          'more.web',
          wrap<CellProps>('core.name', {
            kinds: [Pod],
            when: ({ values }) => values[0] === 'web',
            render: ({ children }) => <>! {children}</>,
          }),
        );
        contributor.add(
          'Fill',
          'more.count',
          fill(slots.kind.table.toolbar, { render: ({ list }) => <p class="count">{`${list.shown}/${list.total} ${list.state}${list.error ? ` ${list.error.code}` : ''}`}</p> }),
        );
        contributor.add('Fill', 'more.empty', fill(slots.kind.table.empty, { target: forKinds(Node), render: () => <p class="none">No nodes yet — join one</p> }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age?']);
    expect(page.column('Name').sort()).toEqual(['! web', 'db']);
    expect(page.container.querySelector('.count')?.textContent).toBe('2/2 live');
    page.act(() => w.cluster.state(Pod, 'stale', { status: 0, code: 'network', message: 'lost' }));
    expect(page.container.querySelector('.count')?.textContent).toBe('2/2 stale network');
    page.navigate('/k/nodes.v1');
    expect(page.container.querySelector('.none')?.textContent).toBe('No nodes yet — join one');
    page.navigate('/k/namespaces.v1');
    expect(page.text()).toContain('No namespaces');
  });

  it('is filtered by the page’s filter (?filter=, CEL): shown as typed, its objects those it holds, how many of how many; typing stopped a while, by what is typed', () => {
    vi.useFakeTimers();
    const w = kubeWorld();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop', labels: { app: 'web' } } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'db', namespace: 'shop', labels: { app: 'db' } } }));
    w.addon(core);
    const page = renderPage(w, `/k/pods.v1?filter=${encodeURIComponent('labels[?"app"].orValue("") == "web"')}`);
    const field = page.container.querySelector<HTMLInputElement>('input[aria-label="Filter"]') as HTMLInputElement;
    expect(field.value).toBe('labels.app = web');
    expect(page.column('Name')).toEqual(['web']);
    expect(page.text()).toContain('1 of 2');
    page.act(() => {
      fireEvent.input(field, { target: { value: 'db' } });
    });
    page.act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(page.column('Name')).toEqual(['web']);
    page.act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(page.path).toBe(`/k/pods.v1?filter=${encodeURIComponent('name.lowerAscii().contains("db")')}`);
    expect(page.column('Name')).toEqual(['db']);
    // Back (the page's filter from elsewhere): its own text, not what was typed.
    page.navigate('/k/pods.v1');
    expect([field.value, page.column('Name').sort()]).toEqual(['', ['db', 'web']]);
    // Typed as it is not said back (WEB, app=web): applied, kept as typed; Back, its own again.
    page.act(() => {
      fireEvent.input(field, { target: { value: 'app=web' } });
    });
    page.act(() => {
      vi.advanceTimersByTime(700);
    });
    expect([page.path, field.value]).toEqual([`/k/pods.v1?filter=${encodeURIComponent('labels[?"app"].orValue("") == "web"')}`, 'app=web']);
    page.navigate('/k/pods.v1');
    expect(field.value).toBe('');
    // Typed, and gone to another kind before it is applied: that kind not filtered by it, its field its own.
    page.act(() => {
      fireEvent.input(field, { target: { value: 'db' } });
    });
    page.navigate('/k/namespaces.v1');
    page.act(() => {
      vi.advanceTimersByTime(700);
    });
    vi.useRealTimers();
    expect(page.path).toBe('/k/namespaces.v1');
    expect(page.container.querySelector<HTMLInputElement>('input[aria-label="Filter"]')?.value).toBe('');
  });

  it('searches every kind (/, ⌘K; not where something is typed): by kind, each opened over the page; all of them, its kind’s page filtered so', async () => {
    const w = world(...Array.from({ length: 7 }, (_, i) => `web-${i}`), 'db');
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' } }));
    const page = renderPage(w, '/k/namespaces.v1');
    const spot = () => document.querySelector('.uk-spot') as HTMLElement | null;
    // Typed in a field: not the page's.
    const filter = page.container.querySelector<HTMLInputElement>('input[aria-label="Filter"]') as HTMLInputElement;
    page.act(() => void fireEvent.keyDown(filter, { key: '/' }));
    expect(spot()).toBeNull();
    page.act(() => void fireEvent.keyDown(document.body, { key: '/' }));
    const field = spot()?.querySelector('input') as HTMLInputElement;
    page.act(() => void fireEvent.input(field, { target: { value: 'web' } }));
    await vi.waitFor(() => expect(spot()?.querySelectorAll('.uk-spot-group').length).toBe(2));
    expect([...(spot()?.querySelectorAll('.uk-spot-group') ?? [])].map((g) => g.textContent)).toEqual(['Deployments · 1', 'Pods · 7']);
    expect(spot()?.querySelector('.uk-spot-footer')?.textContent).toMatch(/^\d+ of \d+ kinds searched$/);
    // Its first: opened over the page.
    page.act(() => void fireEvent.keyDown(field, { key: 'Enter' }));
    expect(page.path).toBe('/k/namespaces.v1?open=deployments.v1.apps/shop/web');
    // All of a kind: its page filtered so.
    page.act(() => void fireEvent.keyDown(document.body, { key: 'k', metaKey: true }));
    const again = spot()?.querySelector('input') as HTMLInputElement;
    page.act(() => void fireEvent.input(again, { target: { value: 'po web' } }));
    await vi.waitFor(() => expect(spot()?.textContent).toContain('All 7 Pods'));
    // Of one kind only (its name first): said so, everywhere a choice away.
    expect([...(spot()?.querySelectorAll('.uk-spot-item') ?? [])].at(-1)?.textContent).toContain('Only Pods — search everywhere for “web”');
    page.act(() => void ([...(spot()?.querySelectorAll('.uk-spot-item') ?? [])].find((i) => i.textContent?.includes('All 7 Pods')) as HTMLElement).click());
    expect(page.path).toBe(`/k/pods.v1?filter=${encodeURIComponent('name.lowerAscii().contains("web")')}`);
    expect(page.column('Name')).toHaveLength(7);
  });

  it('has a row’s menu (the object’s): open it, copy its name, its YAML — and another’s items', async () => {
    const w = world('web');
    w.addon(
      addon(
        'logs',
        ({ contributor }) =>
          void contributor.add('MenuItem', 'logs.open', menuItem({ on: 'resource.context', title: 'Logs', when: ({ kind }) => kind.id === Pod.id, run: () => {} })),
      ),
    );
    const page = renderPage(w, '/k/pods.v1');
    const row = page.container.querySelector('[role="rowgroup"] [role="row"]') as HTMLElement;
    const ask = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    page.act(() => void row.dispatchEvent(ask));
    const items = [...document.querySelectorAll('.uk-menu [role="menuitem"] .uk-menu-label')].map((i) => i.textContent);
    expect([ask.defaultPrevented, document.querySelector('.uk-menu-title')?.textContent, items]).toEqual([true, 'Pod shop/web', ['Open', 'Copy name', 'Copy YAML', 'Logs']]);
    page.act(() => (document.querySelector('.uk-menu [role="menuitem"]') as HTMLElement).click());
    await vi.waitFor(() => expect(page.path).toBe('/k/pods.v1?open=pods.v1/shop/web'));
  });

  it('has every kind’s columns, and a built-in kind’s as kubectl has them; an object’s name links to it', () => {
    const page = renderPage(world('web', 'db'), '/k/pods.v1');
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age']);
    expect(page.column('Name').sort()).toEqual(['db', 'web']);
    expect(page.container.querySelector('a[href="#/k/pods.v1?open=pods.v1/shop/web"]')?.textContent).toBe('web');
  });

  it('has its columns’ settings over it: every column there is, grouped — kubectl’s, -o wide, each addon’s — turned on and off (a group at once), the user’s; back to the defaults', () => {
    const w = world('web-1');
    w.addon(addon('images', ({ contributor }) => void contributor.add('Column', 'images.size', column({ kinds: [Pod], header: 'Size', sort: 'core.name' }))));
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => ([...page.container.querySelectorAll('button')].find((b) => b.textContent === 'Columns') as HTMLButtonElement).click());
    const heads = () => [...document.querySelectorAll<HTMLButtonElement>('.uk-checklist-head')];
    const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.uk-checklist-item')].find((i) => i.textContent === label) as HTMLButtonElement;
    expect(heads().map((h) => h.textContent)).toEqual(['General6/6', 'Wide0/6', 'More0/4', 'images · addon1/1']);
    // The name stays.
    expect(item('Name').getAttribute('aria-disabled')).toBe('true');
    page.act(() => heads()[1].click());
    page.act(() => item('Size').click());
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'IP', 'Node', 'QoS', 'Started', 'Nominated Node', 'Readiness Gates', 'Age']);
    expect(w.user.saved().patches).toEqual([
      {
        kind: 'TableView',
        name: Pod.id,
        fields: {
          hidden: {
            'core.v1/Pod.ip': false,
            'core.v1/Pod.node': false,
            'core.v1/Pod.qos': false,
            'core.v1/Pod.started': false,
            'core.v1/Pod.nominated-node': false,
            'core.v1/Pod.readiness-gates': false,
            'images.size': true,
          },
        },
      },
    ]);
    page.act(() => ([...document.querySelectorAll('.uk-checklist-foot button')].find((b) => b.textContent === 'Reset to defaults') as HTMLButtonElement).click());
    expect([page.headers(), w.user.saved().patches]).toEqual([['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Size', 'Age'], []]);
  });

  it('takes the user’s say of a column back when it is turned back as it would be without them: by default, as another’s TableView says', () => {
    const w = world('web-1');
    w.addon(addon('quiet', ({ contributor }) => void contributor.patch('TableView', Pod.id, { hidden: { 'core.v1/Pod.restarts': true } })));
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => ([...page.container.querySelectorAll('button')].find((b) => b.textContent === 'Columns') as HTMLButtonElement).click());
    const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.uk-checklist-item')].find((i) => i.textContent === label) as HTMLButtonElement;
    const hidden = () => w.user.saved().patches.find((p) => p.kind === 'TableView')?.fields.hidden;
    page.act(() => item('Restarts').click());
    page.act(() => item('Labels').click());
    expect([hidden(), page.headers()]).toEqual([{ 'core.v1/Pod.restarts': false, 'core.labels': false }, ['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Labels', 'Age']]);
    page.act(() => item('Restarts').click());
    page.act(() => item('Labels').click());
    expect([hidden(), page.headers()]).toEqual([undefined, ['Name', 'Namespace', 'Ready', 'Status', 'Age']]);
  });

  it('has more than kubectl says, not shown till asked: labels, the controller, conditions, containers’ states', () => {
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: {
          name: 'web-1',
          namespace: 'shop',
          uid: 'p1',
          labels: { app: 'web' },
          ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-7f', uid: 'r1', controller: true }],
        },
        status: {
          conditions: [{ type: 'Ready', status: 'False' }],
          containerStatuses: [{ name: 'app', image: 'a', imageID: '', restartCount: 0, ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } } }],
        },
      }),
    );
    w.user.patch('TableView', Pod.id, {
      hidden: Object.fromEntries(['core.labels', 'core.controlled-by', 'core.conditions', 'core.v1/Pod.container-states'].map((n) => [n, false])),
    });
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers().slice(5, 9)).toEqual(['Labels', 'Controlled By', 'Conditions', 'Container States']);
    expect(['Labels', 'Controlled By'].map((c) => page.column(c)[0])).toEqual(['appweb', 'ReplicaSet/web-7f']);
    expect(page.container.querySelector('.uk-status[aria-label="Ready=False"]')?.getAttribute('data-tone')).toBe('error');
    expect(page.container.querySelector('[aria-label="app: CrashLoopBackOff"]')).not.toBeNull();
  });

  it('has a tip for each condition: the core’s title, fields, message — others’ fields among them, none in another’s place', () => {
    vi.useFakeTimers();
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'api-0', namespace: 'shop' },
        status: { conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady', message: 'not ready: [api]', lastTransitionTime: '2026-10-15T10:00:00Z' }] },
      }),
    );
    const field = (id: string, order: number, label: string) =>
      addon(id, ({ contributor }) => void contributor.add('Fill', `${id}.field`, tipField(slots.tip.condition.fields, { kinds: [Pod], order, label, value: () => id })));
    w.addon(field('probes', 250, 'Probe'));
    w.addon(field('runbooks', 900, 'Runbook'));
    w.user.patch('TableView', Pod.id, { hidden: { 'core.conditions': false } });
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => void (page.container.querySelector('.uk-table-row .uk-tip-at') as HTMLElement).dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })));
    page.act(() => void vi.advanceTimersByTime(400));
    const tip = document.querySelector('.uk-tip') as HTMLElement;
    expect([
      tip.querySelector('.uk-tip-title')?.textContent,
      [...tip.querySelectorAll('.uk-tip-field dt')].map((d) => d.textContent),
      tip.querySelector('.uk-tip-sections')?.textContent,
    ]).toEqual(['Ready · Pod api-0', ['Status', 'Reason', 'Probe', 'Last Transition', 'Runbook'], 'not ready: [api]']);
    vi.useRealTimers();
  });

  it('has a tip for each container: its state, exit code, restarts, image; its message', () => {
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'job-1', namespace: 'shop' },
        spec: { containers: [{ name: 'run', image: 'busybox:1.37' }] },
        status: {
          containerStatuses: [
            { name: 'run', image: 'busybox:1.37', imageID: '', ready: false, restartCount: 2, state: { terminated: { exitCode: 1, reason: 'Error', message: 'no such file' } } },
          ],
        },
      }),
    );
    w.user.patch('TableView', Pod.id, { hidden: { 'core.v1/Pod.container-states': false } });
    const page = renderPage(w, '/k/pods.v1');
    fireEvent.keyDown(document, { key: 'Tab' });
    page.act(() => void fireEvent.focusIn(page.container.querySelector('.uk-table-row .uk-tip-at') as HTMLElement));
    const tip = document.querySelector('.uk-tip') as HTMLElement;
    expect([
      tip.querySelector('.uk-tip-title')?.textContent,
      [...tip.querySelectorAll('.uk-tip-field')].map((f) => f.textContent),
      tip.querySelector('.uk-tip-sections')?.textContent,
    ]).toEqual(['run · Pod job-1', ['StateError', 'Exit Code1', 'Restarts2', 'Imagebusybox:1.37'], 'no such file']);
  });

  it('says in a tip what it could not read: not there, refused — no placeholder for ever', () => {
    const w = world();
    const tip = mount(w, <ConditionTip kind={Pod} namespace="shop" name="gone" type="Ready" />);
    expect(tip.container.textContent).toBe('There is no Pod gone (now).');
    tip.unmount();
    w.cluster.state(Pod, 'denied', { status: 403, code: 'Forbidden', message: 'pods is forbidden' });
    expect(mount(w, <ConditionTip kind={Pod} namespace="shop" name="gone" type="Ready" />).container.textContent).toBe('pods cannot be had: Forbidden');
  });

  it('gives a node’s more: its taints (each in its tip), whether cordoned', () => {
    const w = world();
    w.cluster.add(Node, make(Node, { metadata: { name: 'n1' }, spec: { unschedulable: true, taints: [{ key: 'gpu', effect: 'NoSchedule' }] } }));
    w.user.patch('TableView', Node.id, { hidden: Object.fromEntries(['taints', 'cordoned'].map((n) => [`core.v1/Node.${n}`, false])) });
    const page = renderPage(w, '/k/nodes.v1');
    expect(['Taints', 'Cordoned'].map((c) => page.column(c)[0])).toEqual(['1', 'Cordoned']);
    // Its taints' tip: each, its key, value and effect.
    fireEvent.keyDown(document, { key: 'Tab' });
    page.act(() => void fireEvent.focusIn(page.container.querySelector('.uk-table-row .uk-tip-at') as HTMLElement));
    const tip = document.querySelector('.uk-tip') as HTMLElement;
    expect([tip.querySelector('.uk-tip-title')?.textContent, [...tip.querySelectorAll('.uk-tip-field')].map((f) => f.textContent)]).toEqual([
      'Taints · Node n1',
      ['gpuNoSchedule'],
    ]);
  });

  it('keeps a column moved among those shown in its new place, those not shown in theirs: one turned on later comes where it is by default', () => {
    const all = ['core.name', 'core.namespace', 'ready', 'status', 'restarts', 'ip', 'node', 'core.age'];
    // Restarts moved before Ready, in one namespace (its column not shown), IP and Node not shown.
    const order = orderOf(all, ['core.name', 'restarts', 'ready', 'status', 'core.age']);
    expect(order).toEqual(['core.name', 'core.namespace', 'restarts', 'ready', 'status', 'ip', 'node', 'core.age']);
    const w = world('web-1');
    w.user.patch('TableView', Pod.id, {
      columns: orderOf(
        ['core.name', 'core.namespace', 'core.v1/Pod.ready', 'core.v1/Pod.status', 'core.v1/Pod.restarts', 'core.v1/Pod.ip', 'core.age'],
        ['core.name', 'core.namespace', 'core.v1/Pod.restarts', 'core.v1/Pod.ready', 'core.v1/Pod.status', 'core.age'],
      ),
    });
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => void w.user.patch('TableView', Pod.id, { hidden: { 'core.v1/Pod.ip': false } }));
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Restarts', 'Ready', 'Status', 'IP', 'Age']);
  });

  it('lets an event’s name, shown only when asked, be turned on and off again', () => {
    const page = renderPage(world(), '/k/events.v1');
    page.act(() => ([...page.container.querySelectorAll('button')].find((b) => b.textContent === 'Columns') as HTMLButtonElement).click());
    const name = () => [...document.querySelectorAll<HTMLButtonElement>('.uk-checklist-item')].find((i) => i.textContent === 'Name') as HTMLButtonElement;
    page.act(() => name().click());
    expect([page.headers().includes('Name'), name().getAttribute('aria-disabled')]).toEqual([true, null]);
    page.act(() => name().click());
    expect(page.headers().includes('Name')).toBe(false);
  });

  it('keeps what the user does to it as theirs (its TableView, patched): a sort, a column’s width (back to its own) — a table in another’s frame changing nothing', () => {
    const w = world();
    for (const name of ['web-1', 'web-2']) w.cluster.add(Pod, make(Pod, { metadata: { name, namespace: 'shop', labels: { app: 'web' } } }));
    w.cluster.add(
      Deployment,
      make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'web' } }, template: { metadata: { labels: { app: 'web' } } } } }),
    );
    const page = renderPage(w, '/k/pods.v1');
    const header = (label: string, within: ParentNode = page.container) => within.querySelector(`[role="columnheader"][aria-label="${label}"]`) as HTMLElement;
    const view = () => w.user.saved().patches.find((p) => p.kind === 'TableView' && p.name === Pod.id)?.fields;
    page.act(() => (header('Restarts').querySelector('button') as HTMLButtonElement).click());
    expect([view(), header('Restarts').getAttribute('aria-sort')]).toEqual([{ sort: { column: 'core.v1/Pod.restarts', descending: false } }, 'ascending']);
    page.act(() => (header('Restarts').querySelector('button') as HTMLButtonElement).click());
    expect(view()?.sort).toEqual({ column: 'core.v1/Pod.restarts', descending: true });
    // A column made wider by the keyboard (as a drag), then given back its own width.
    const edge = header('Name').querySelector('.uk-table-resize') as HTMLElement;
    page.act(() => void edge.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(view()?.widths).toEqual({ 'core.name': 48 });
    page.act(() => void edge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(view()?.widths).toBeUndefined();
    // A deployment's pods (its view's table): not the page's sort (by name, as by default), sorted there for the while it is drawn — the pods' table as the user left it.
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    const pods = document.querySelector('.uk-modal [data-part="pods"]') as HTMLElement;
    page.act(() => (header('Name', pods).querySelector('button') as HTMLButtonElement).click());
    expect([header('Name', pods).getAttribute('aria-sort'), view()?.sort]).toEqual(['descending', { column: 'core.v1/Pod.restarts', descending: true }]);
  });

  it('sorts by name when its TableView says nothing (Name shown sorted, ascending) — not as they came', () => {
    const w = world('web', 'api');
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'db', namespace: 'base' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'cache', namespace: 'shop' } }));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Name')).toEqual(['api', 'cache', 'db', 'web']);
    expect(page.container.querySelector('[role="columnheader"][aria-sort="ascending"]')?.textContent).toContain('Name');
  });

  it('draws an age as the time since — again as the clock goes, only where its text changes; a text that reads no time, once', () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T00:01:00Z') });
    const w = world();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop', creationTimestamp: '2026-01-01T00:00:00Z' } }));
    let drawn = 0;
    w.addon(
      addon('count', ({ contributor }) => {
        contributor.add(
          'Column',
          'count.c',
          column({
            kinds: [Pod],
            header: 'C',
            sort: 'core.name',
            format: () => {
              drawn++;
              return 'c';
            },
          }),
        );
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Age')).toEqual(['60s']);
    const once = drawn;
    page.act(() => void vi.advanceTimersByTime(2000));
    expect([page.column('Age'), drawn]).toEqual([['62s'], once]);
    vi.useRealTimers();
  });

  it('gives a column’s format its values and now, and a Wrap of its cell its text — live as it is', () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T00:01:00Z') });
    const w = world();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop', creationTimestamp: '2026-01-01T00:00:00Z' }, status: { phase: 'Running' } }));
    w.addon(
      addon('looks', ({ contributor }) => {
        contributor.patch('Column', 'core.age', { format: ([at], { now }) => <b>{`${Math.round((now - Number(at)) / 1000)}s`}</b> });
        contributor.add('Wrap', 'looks.status', wrap<CellProps>('core.v1/Pod.status', { order: 0, render: ({ display }) => <i>{display.toUpperCase()}</i> }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect([page.column('Age'), page.column('Status'), page.container.querySelectorAll('[role="cell"] b, [role="cell"] i').length]).toEqual([['60s'], ['RUNNING'], 2]);
    page.act(() => void vi.advanceTimersByTime(2000));
    expect(page.column('Age')).toEqual(['62s']);
    vi.useRealTimers();
  });

  it('tells a live format’s failure once, not as each second works it out again — again once another is in its place and fails', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T00:01:00Z'), toFake: ['setInterval', 'clearInterval', 'Date'] });
    const w = world('web');
    let tries = 0;
    const late = (message: string) =>
      column({
        kinds: [Pod],
        header: 'Late',
        sort: 'core.name',
        format: (_values, { now }) => {
          tries++;
          if (now) throw new Error(message);
          return '';
        },
      });
    let fix: (spec: object) => void = () => {};
    w.addon(
      addon('late', ({ contributor }) => {
        contributor.add('Column', 'late.c', late('first'));
        fix = (spec) => void contributor.patch('Column', 'late.c', spec);
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    const first = tries;
    for (let i = 0; i < 3; i++) {
      page.act(() => void vi.advanceTimersByTime(1000));
      await Promise.resolve();
    }
    await expect.poll(() => page.failures.length).toBe(1);
    // Worked out again each second, told once.
    expect([tries - first, page.failures[0]]).toEqual([3, expect.objectContaining({ definition: expect.objectContaining({ name: 'late.c' }), field: 'format' })]);
    // Fixed, then broken another way: told again.
    page.act(() => fix({ format: () => 'ok' }));
    page.act(() => fix({ format: late('second').format }));
    await expect.poll(() => page.failures.length).toBe(2);
    expect(String(page.failures[1].error)).toContain('second');
    vi.useRealTimers();
  });

  it('shows an Event’s name only when asked, as kubectl — whoever sets out its table; its columns as kubectl has them', () => {
    const w = world();
    const page = renderPage(w, '/k/events.v1');
    expect(page.headers()).toEqual(['Namespace', 'Last Seen', 'Type', 'Reason', 'Object', 'Message']);
    page.act(() => void w.addon(addon('wide', ({ contributor }) => void contributor.add('TableView', kinds.core.v1.Event.id, { widths: { 'core.v1/Event.message': 400 } }))));
    expect(page.headers()).toEqual(['Namespace', 'Last Seen', 'Type', 'Reason', 'Object', 'Message']);
    page.act(() => void w.user.patch('TableView', kinds.core.v1.Event.id, { hidden: { 'core.name': false } }));
    expect(page.headers()[0]).toBe('Name');
  });

  it('shows a cell with no value as "—" (its field’s or its format’s), a 0 as a 0', () => {
    const w = world('web');
    w.addon(
      addon('n', ({ contributor }) => {
        contributor.add('Column', 'n.zero', column({ kinds: [Pod], header: 'Zero', sort: 'core.name', format: () => 0 }));
        contributor.add('Column', 'n.none', column({ kinds: [Pod], header: 'None', sort: '.spec.nothing' }));
        contributor.add('Column', 'n.empty', column({ kinds: [Pod], header: 'Empty', sort: 'core.name', format: () => '' }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect([page.column('Zero'), page.column('None'), page.column('Empty')]).toEqual([['0'], ['—'], ['—']]);
  });
  it('gives the core’s columns as defaults: another’s of the same name takes its place, and gives it back as it goes', () => {
    const w = world('web');
    let result: unknown;
    w.addon(
      addon('restarts', ({ contributor }) => {
        result = contributor.add('Column', 'core.v1/Pod.restarts', column({ kinds: [Pod], header: 'Restarts!', order: 130, sort: 'pods.v1.restarts', format: () => 'none' }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect([result, page.column('Restarts!')]).toEqual([expect.objectContaining({ status: 'included' }), ['none']]);
    page.act(() => w.stop('restarts'));
    expect(page.column('Restarts')).toEqual(['0']);
  });

  it('sets out another addon’s columns as the kind’s TableView says, over the core’s', () => {
    const w = world('web');
    w.addon(
      addon('images', ({ contributor }) => {
        contributor.add('Column', 'images.node', column({ kinds: [Pod], header: 'Node', order: 20, sort: 'pods.v1.node', format: ([node]) => String(node ?? 'none') }));
        contributor.add('Column', 'images.replicas', column({ kinds: [Deployment], header: 'Replicas', sort: '.spec.replicas' }));
        contributor.patch('TableView', Pod.id, { columns: ['core.age'], hidden: { 'core.namespace': true } });
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers()).toEqual(['Age', 'Name', 'Node', 'Ready', 'Status', 'Restarts']);
    expect(page.column('Node')).toEqual(['none']);
  });

  it('gives a row’s menu the object whole, as the cluster has it — not only what its row shows', () => {
    const w = world();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' }, spec: { nodeName: 'n1', containers: [] } }));
    let seen: unknown;
    const node = menuItem({
      on: 'resource.context',
      title: 'Node',
      when: ({ object }) => {
        seen = object;
        return true;
      },
      run: () => {},
    });
    w.addon(addon('drain', ({ contributor }) => void contributor.add('MenuItem', 'drain.node', node)));
    const page = renderPage(w, '/k/pods.v1');
    const row = page.container.querySelector('[role="rowgroup"] [role="row"]') as HTMLElement;
    page.act(() => void row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(seen).toMatchObject({ metadata: { name: 'web' }, spec: { nodeName: 'n1' } });
  });

  it('draws what a format draws apart: one that throws, its column’s failure — the table drawn', async () => {
    const w = world('web');
    const Broken = () => {
      throw new Error('drawn wrong');
    };
    w.addon(addon('broken', ({ contributor }) => void contributor.add('Column', 'broken.c', column({ kinds: [Pod], header: 'B', sort: 'core.name', format: () => <Broken /> }))));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Name')).toEqual(['web']);
    await expect.poll(() => page.failures.map((f) => `${f.definition.kind}/${f.definition.name}`)).toContain('Column/broken.c');
  });

  it('tells a field that cannot be worked out of some objects as that field’s, its cells empty', async () => {
    const w = world('web');
    w.addon(
      addon('odd', ({ contributor }) => {
        contributor.add('Field', 'odd.n', { kinds: ['pods.v1'], type: 'number', value: { cel: '1 / 0' } });
        contributor.add('Column', 'odd.c', column({ kinds: [Pod], header: 'Odd', sort: 'odd.n' }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Odd')).toEqual(['—']);
    await expect.poll(() => page.failures.map((f) => `${f.definition.kind}/${f.definition.name}`)).toContain('Field/odd.n');
  });

  it('shows when an Event was last seen, a CronJob last ran (their times as ages); Events the last seen first', () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T01:00:00Z') });
    const w = world();
    const { Event } = kinds.core.v1;
    w.cluster.add(Event, make(Event, { metadata: { name: 'a', namespace: 'shop' }, involvedObject: {}, lastTimestamp: '2026-01-01T00:00:00Z' } as never));
    w.cluster.add(Event, make(Event, { metadata: { name: 'b', namespace: 'shop' }, involvedObject: {}, lastTimestamp: '2026-01-01T00:59:00Z' } as never));
    w.cluster.add(
      kinds.batch.v1.CronJob,
      make(kinds.batch.v1.CronJob, { metadata: { name: 'c', namespace: 'shop' }, status: { lastScheduleTime: '2026-01-01T00:30:00Z' } } as never),
    );
    expect(renderPage(w, '/k/events.v1').column('Last Seen')).toEqual(['60s', '60m']);
    expect(renderPage(w, '/k/cronjobs.v1.batch').column('Last Schedule')).toEqual(['30m']);
    vi.useRealTimers();
  });

  it('shows where a Service is reached from outside: its load balancer’s addresses, those it is given; a load balancer’s to come, pending; an external name’s, its name', () => {
    const w = world();
    const { Service } = kinds.core.v1;
    const service = (name: string, spec: object, status: object = {}) => make(Service, { metadata: { name, namespace: 'shop' }, spec, status } as never);
    w.cluster.add(Service, service('a-lb', { type: 'LoadBalancer' }, { loadBalancer: { ingress: [{ ip: '192.168.1.240' }, { hostname: 'lb.example.com' }] } }));
    w.cluster.add(Service, service('b-pending', { type: 'LoadBalancer' }));
    w.cluster.add(Service, service('c-given', { type: 'ClusterIP', externalIPs: ['203.0.113.7'] }));
    w.cluster.add(Service, service('d-inside', { type: 'ClusterIP' }));
    w.cluster.add(Service, service('e-outside', { type: 'ExternalName', externalName: 'db.example.com' }));
    expect(renderPage(w, '/k/services.v1').column('External-IP')).toEqual(['192.168.1.240,lb.example.com', '<pending>', '203.0.113.7', '—', 'db.example.com']);
  });

  it('has the columns kubectl prints that are worked out: a job’s duration (live while it runs), a cron job’s time zone and active jobs, a daemon set’s current and node selector, an ingress’s ports, a volume’s reason, a quota’s use, an account’s secrets, an autoscaler’s targets', () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T01:00:00Z') });
    const w = world();
    const { Job, CronJob } = kinds.batch.v1;
    const { DaemonSet } = kinds.apps.v1;
    const { PersistentVolume, ResourceQuota, ServiceAccount } = kinds.core.v1;
    const { Ingress } = kinds.networking.v1;
    const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
    const job = (name: string, status: object) => make(Job, { metadata: { name, namespace: 'shop' }, spec: { template: {} }, status } as never);
    w.cluster.add(Job, job('a-done', { startTime: '2026-01-01T00:00:00Z', completionTime: '2026-01-01T00:02:30Z' }));
    w.cluster.add(Job, job('b-running', { startTime: '2026-01-01T00:59:00Z' }));
    w.cluster.add(Job, job('c-waiting', {}));
    w.cluster.add(
      CronJob,
      make(CronJob, {
        metadata: { name: 'c', namespace: 'shop' },
        spec: { schedule: '0 3 * * *', timeZone: 'UTC', jobTemplate: {} },
        status: { active: [{ name: 'c-1' }] },
      } as never),
    );
    w.cluster.add(
      DaemonSet,
      make(DaemonSet, {
        metadata: { name: 'agent', namespace: 'shop' },
        spec: { selector: {}, template: { spec: { nodeSelector: { os: 'linux' }, containers: [] } } },
        status: { currentNumberScheduled: 3, desiredNumberScheduled: 3, numberMisscheduled: 0, numberReady: 3 },
      } as never),
    );
    w.cluster.add(
      Ingress,
      make(Ingress, {
        metadata: { name: 'i', namespace: 'shop' },
        spec: { tls: [{ secretName: 'x', hosts: ['*.shop.test'] }], rules: [{ host: 'www.shop.test' }, { host: 'a.b.shop.test' }] },
      } as never),
    );
    // An entry of no hosts: every host covered.
    w.cluster.add(Ingress, make(Ingress, { metadata: { name: 'j', namespace: 'shop' }, spec: { tls: [{ secretName: 'y' }], rules: [{ host: 'a.test' }] } } as never));
    w.cluster.add(PersistentVolume, make(PersistentVolume, { metadata: { name: 'pv' }, spec: {}, status: { phase: 'Failed', reason: 'ProvisioningFailed' } } as never));
    w.cluster.add(ResourceQuota, make(ResourceQuota, { metadata: { name: 'q', namespace: 'shop' }, status: { hard: { pods: '50', 'limits.cpu': '4' }, used: { pods: '3' } } }));
    w.cluster.add(ServiceAccount, make(ServiceAccount, { metadata: { name: 'sa', namespace: 'shop' }, secrets: [{ name: 't' }] }));
    w.cluster.add(
      HorizontalPodAutoscaler,
      make(HorizontalPodAutoscaler, {
        metadata: { name: 'h', namespace: 'shop' },
        spec: {
          scaleTargetRef: { kind: 'Deployment', name: 'web' },
          maxReplicas: 4,
          metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } }],
        },
        status: { currentMetrics: [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 42 } } }] },
      } as never),
    );
    const page = renderPage(w, '/k/jobs.v1.batch');
    expect(page.column('Duration')).toEqual(['2m30s', '60s', '—']);
    page.act(() => void vi.advanceTimersByTime(30_000));
    expect(page.column('Duration')).toEqual(['2m30s', '90s', '—']);
    page.navigate('/k/cronjobs.v1.batch');
    expect([page.column('Time Zone'), page.column('Active')]).toEqual([['UTC'], ['1']]);
    page.navigate('/k/daemonsets.v1.apps');
    expect([page.column('Current'), page.column('Node Selector')]).toEqual([['3'], ['os=linux']]);
    page.navigate('/k/ingresses.v1.networking.k8s.io');
    expect(page.column('Ports')).toEqual(['80, 443', '80, 443']);
    // Its TLS: its Secrets; a host its wildcard does not cover (two labels), warned — an entry of no hosts, none.
    expect(page.column('TLS')).toEqual(['x', 'y']);
    expect([...document.querySelectorAll('[role="cell"] .uk-status[data-tone="warn"]')].map((e) => e.getAttribute('aria-label'))).toEqual(['Not covered by TLS: a.b.shop.test']);
    page.navigate('/k/persistentvolumes.v1');
    expect(page.column('Reason')).toEqual(['ProvisioningFailed']);
    page.navigate('/k/resourcequotas.v1');
    expect([page.column('Request'), page.column('Limit')]).toEqual([['pods: 3/50'], ['limits.cpu: 0/4']]);
    page.navigate('/k/serviceaccounts.v1');
    expect(page.column('Secrets')).toEqual(['1']);
    page.navigate('/k/horizontalpodautoscalers.v2.autoscaling');
    expect(page.column('Targets')).toEqual(['cpu: 42%/70%']);
    // A kind late in the core's list: its columns before the age all the same, in kubectl's order.
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Reference', 'Targets', 'MinPods', 'MaxPods', 'Replicas', 'Status', 'Age']);
    vi.useRealTimers();
  });

  it('has the API’s kinds’ columns as kubectl has them: a webhook configuration’s hooks counted, an API service’s service (none: Local)', () => {
    const w = world();
    const { ValidatingWebhookConfiguration } = kinds.admissionregistration.v1;
    const { APIService } = kinds.apiregistration.v1;
    const hook = (name: string) => ({ name, admissionReviewVersions: ['v1'], sideEffects: 'None' as const, clientConfig: {} });
    w.cluster.add(ValidatingWebhookConfiguration, make(ValidatingWebhookConfiguration, { metadata: { name: 'two' }, webhooks: [hook('a'), hook('b')] }));
    w.cluster.add(APIService, make(APIService, { metadata: { name: 'v1.apps' }, spec: { groupPriorityMinimum: 1, versionPriority: 1 } }));
    w.cluster.add(
      APIService,
      make(APIService, {
        metadata: { name: 'v1beta1.metrics.k8s.io' },
        spec: { groupPriorityMinimum: 1, versionPriority: 1, service: { name: 'metrics-server', namespace: 'kube-system' } },
      }),
    );
    expect(renderPage(w, '/k/validatingwebhookconfigurations.v1.admissionregistration.k8s.io').column('Webhooks')).toEqual(['2']);
    expect(renderPage(w, '/k/apiservices.v1.apiregistration.k8s.io').column('Service')).toEqual(['Local', 'kube-system/metrics-server']);
  });

  it('shows when a CronJob runs next, in its time zone (none: UTC); suspended or not a schedule, not at all', () => {
    vi.useFakeTimers({ now: Date.parse('2026-01-01T01:00:00Z') });
    const w = world();
    const { CronJob } = kinds.batch.v1;
    const cron = (name: string, spec: object) => make(CronJob, { metadata: { name, namespace: 'shop' }, spec: { jobTemplate: {}, ...spec } } as never);
    w.cluster.add(CronJob, cron('a-utc', { schedule: '0 3 * * *' }));
    w.cluster.add(CronJob, cron('b-berlin', { schedule: '0 3 * * *', timeZone: 'Europe/Berlin' }));
    w.cluster.add(CronJob, cron('c-suspended', { schedule: '0 3 * * *', suspend: true }));
    w.cluster.add(CronJob, cron('d-odd', { schedule: 'every day' }));
    expect(renderPage(w, '/k/cronjobs.v1.batch').column('Next')).toEqual(['in 120m', 'in 60m', '—', '—']);
    vi.useRealTimers();
  });

  it('says what its answer is: loading (and why), refused, stale (still shown)', () => {
    const w = world('web');
    w.cluster.state(Pod, 'loading', { status: 0, code: 'network', message: 'waiting for room on a watch stream' });
    const page = renderPage(w, '/k/pods.v1');
    expect(page.text()).toContain('waiting for room on a watch stream');
    page.act(() => w.cluster.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'no' }));
    expect(page.text()).toContain('pods cannot be had: Forbidden');
    page.act(() => w.cluster.state(Pod, 'stale'));
    expect(page.text()).toContain('Not current');
    expect(page.column('Name')).toEqual(['web']);
  });

  it('tells a column’s failure as its own, once a drawing however many cells, and draws the rest', async () => {
    const w = world('a', 'b', 'c');
    w.addon(addon('big', ({ contributor }) => void contributor.add('Column', 'big.n', column({ header: 'Big', sort: 'core.name', format: () => JSON.stringify({ n: 1n }) }))));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Name').sort()).toEqual(['a', 'b', 'c']);
    await expect.poll(() => page.failures.length).toBe(1);
    expect(page.failures[0]).toMatchObject({ definition: { kind: 'Column', name: 'big.n' }, field: 'format' });
  });

  it('says a kind the cluster does not serve, and what discovery cannot have', () => {
    expect(renderPage(world(), '/k/things.v1.example.com').text()).toContain('The cluster serves no kind things.v1.example.com');
    const w = world();
    w.cluster.discover('error', { status: 403, code: 'Forbidden', message: 'no' });
    const page = renderPage(w, '/k/things.v1.example.com');
    expect(page.text()).toContain('What the cluster serves cannot be had: Forbidden');
  });
});

describe('waiting', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the table as it will be while its rows are slow: its columns (another’s too), then rows waiting; the rows in their place', () => {
    vi.useFakeTimers();
    const w = world();
    w.addon(
      addon('images', ({ contributor }) => void contributor.add('Column', 'images.image', column({ kinds: [Pod], header: 'Image', order: 20, sort: '.spec.containers[0].image' }))),
    );
    w.cluster.state(Pod, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    const table = page.container.querySelector('[role="table"]');
    expect([page.headers(), table?.getAttribute('aria-busy'), page.container.querySelectorAll('[data-skeleton]').length]).toEqual([
      ['Name', 'Namespace', 'Image', 'Ready', 'Status', 'Restarts', 'Age'],
      'true',
      0,
    ]);
    page.act(() => vi.advanceTimersByTime(200));
    expect(page.container.querySelectorAll('[data-skeleton]')).toHaveLength(5);
    expect(page.text()).toContain('Loading pods');
    page.act(() => {
      w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' } }));
      w.cluster.state(Pod, 'live');
    });
    // Its placeholders kept a while (no flash), then the same table's rows in their place — not as rows new to it.
    expect(page.container.querySelectorAll('[data-skeleton]:not([data-leaving])')).toHaveLength(5);
    page.act(() => vi.advanceTimersByTime(400));
    expect(page.container.querySelector('[role="table"]')).toBe(table);
    expect(page.column('Name')).toEqual(['web']);
    expect(page.container.querySelector('[role="row"][data-key]')?.hasAttribute('data-enter')).toBe(false);
    expect(page.container.querySelectorAll('[data-skeleton][data-leaving]')).toHaveLength(4);
    expect([table?.getAttribute('aria-busy'), page.text()]).toEqual([null, expect.stringContaining('1 pods')]);
  });

  it('shows rows that come soon at once: no placeholders flashed before them', () => {
    vi.useFakeTimers();
    const w = world();
    w.cluster.state(Pod, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => vi.advanceTimersByTime(150));
    page.act(() => {
      w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' } }));
      w.cluster.state(Pod, 'live');
    });
    page.act(() => vi.advanceTimersByTime(1000));
    expect([page.column('Name'), page.container.querySelectorAll('[data-skeleton]').length]).toEqual([['web'], 0]);
  });
});

describe('going from one kind to another', () => {
  afterEach(() => vi.useRealTimers());
  const tables = (page: ReturnType<typeof renderPage>) => page.column('Name');

  it('keeps the last kind’s table while the next one’s objects come, then shows the next as it is', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    expect([page.current('Kinds'), tables(page)]).toEqual(['Deployments', ['web']]);
    page.act(() => {
      w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'shop', namespace: 'shop' }, spec: { selector: {}, template: {} } }));
      w.cluster.state(Deployment, 'live');
    });
    expect([tables(page), page.container.querySelectorAll('[data-skeleton]').length]).toEqual([['shop'], 0]);
  });

  it('shows the next kind with its placeholders at once when its objects are slow; one gone to again waits anew', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    page.act(() => vi.advanceTimersByTime(200));
    expect(page.container.querySelectorAll('[data-skeleton]')).toHaveLength(5);
    page.navigate('/k/pods.v1');
    expect(tables(page)).toEqual(['web']);
    page.navigate('/k/deployments.v1.apps');
    expect(tables(page)).toEqual(['web']);
  });

  it('never shows a kind gone past before its objects came (A → B → C)', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    page.navigate('/k/nodes.v1');
    expect([page.current('Kinds'), page.text().includes('No nodes'), page.container.querySelectorAll('[data-skeleton]').length]).toEqual(['Nodes', true, 0]);
  });

  it('shows at once a next kind that cannot be had, and opens an object over its own kind, not the last one', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'error', { status: 403, code: 'Forbidden', message: 'no' });
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    expect(page.text()).toContain('deployments cannot be had: Forbidden');
    w.cluster.state(Deployment, 'loading');
    page.navigate('/k/pods.v1');
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(page.text()).toContain('Deployment web shop');
    expect(page.text()).not.toContain('Pod web shop');
  });
});

describe('putting one’s own in the core’s place', () => {
  it('draws another’s on a kind’s page after the core’s table, and in its place (a Wrap of it) — for that kind only', () => {
    const w = world('web');
    const Mine = () => <p>my pods page</p>;
    w.addon(
      addon('pods', ({ contributor }) => {
        contributor.add('Fill', 'pods.note', { slot: slots.page('kind').name, after: 'core.page.kind.table', target: { kinds: [Deployment.id] }, render: () => <p>a note</p> });
        contributor.add('Wrap', 'pods.page', wrap<PageProps>('core.page.kind.table', { kinds: [Pod], order: 0, render: Mine }));
      }),
    );
    const pods = renderPage(w, '/k/pods.v1');
    expect([pods.text().includes('my pods page'), pods.container.querySelector('[role="table"]')]).toEqual([true, null]);
    const deployments = renderPage(w, '/k/deployments.v1.apps');
    expect([deployments.text().includes('my pods page'), deployments.headers()]).toEqual([false, ['Name', 'Namespace', 'Status', 'Ready', 'Up-to-date', 'Available', 'Age']]);
    expect(deployments.container.querySelector('main')?.textContent?.endsWith('a note')).toBe(true);
  });

  it('shows the objects a KindTable’s own where takes, the TableView’s with it', () => {
    const w = world('web', 'db', 'api');
    w.addon(
      addon('pods', ({ contributor }) => {
        contributor.add('Wrap', 'pods.page', { wraps: 'core.page.kind.table', render: () => <KindTable kind={Pod} where={{ field: 'core.name', op: 'ne', value: 'db' }} /> });
        contributor.patch('TableView', Pod.id, { where: { field: 'core.name', op: 'ne', value: 'api' } });
      }),
    );
    expect(renderPage(w, '/k/pods.v1').column('Name')).toEqual(['web']);
  });
  it('lets the user put first what they want in a slot the core declared', () => {
    const w = world();
    w.addon(
      addon('more', ({ contributor }) => void contributor.add('Fill', 'more.find', fill(slots.nav.tabs.actions, { render: () => <TabButton icon="search" label="Find" /> }))),
    );
    const labels = (page: ReturnType<typeof renderPage>) => [...page.container.querySelectorAll('nav button[aria-label]')].map((b) => b.getAttribute('aria-label'));
    expect(labels(renderPage(w, '/k/pods.v1'))).toEqual(['All kinds', 'Find']);
    w.user.patch('Slot', slots.nav.tabs.actions.name, { arrangement: ['more.find'] });
    expect(labels(renderPage(w, '/k/pods.v1'))).toEqual(['Find', 'All kinds']);
  });

  it('declares every slot the SDK names (and its pages’): what the user arranges in them waits for nothing', () => {
    const w = world();
    const named = (tree: object): string[] =>
      Object.values(tree).flatMap((v) => (v && typeof v === 'object' ? [...(typeof v.name === 'string' ? [v.name] : []), ...named(v)] : []));
    const all = [...named(slots), slots.page('overview').name, slots.page('kind').name];
    expect(all.filter((name) => !w.get('Slot', name))).toEqual([]);
    expect(all.length).toBeGreaterThan(20);
  });

  it('keeps a page where its addon put it: its path is not patched', () => {
    const w = world();
    const result = w.as('other', { priority: 200, rights: ['configure', 'behaviour'] }).patch('Page', 'kind', { path: '/kinds/:kind' } as never);
    expect([result.status, w.get('Page', 'kind')?.spec.path]).toEqual(['rejected', '/k/:kind']);
  });

  it('lets the user hide what the core puts in its slots (they are declared: the arrangement is the user’s)', () => {
    const w = world('web');
    w.user.patch('Slot', slots.nav.tabs.actions.name, { hidden: { 'core.nav.tabs.picker': true } });
    expect(renderPage(w, '/k/pods.v1').container.querySelector('button[aria-label="All kinds"]')).toBeNull();
  });

  it('draws as many of a kind’s tables as one wants (KindTable), each its own objects and title — or another’s table in the core’s place', () => {
    const w = world('web', 'db', 'cache');
    const Two = () => (
      <>
        <KindTable kind={Pod} title="Web" where={{ field: 'core.name', op: 'eq', value: 'web' }} />
        <KindTable kind={Pod} title="Others" where={{ field: 'core.name', op: 'ne', value: 'web' }} />
      </>
    );
    w.addon(addon('pods', ({ contributor }) => void contributor.add('Wrap', 'pods.page', { wraps: 'core.page.kind.table', render: Two })));
    const page = renderPage(w, '/k/pods.v1');
    const tables = [...page.container.querySelectorAll('.uk-region')].map((r) => [
      r.querySelector('h2')?.textContent,
      [...r.querySelectorAll('[role="row"] a')].map((a) => a.textContent).sort(),
    ]);
    expect(tables).toEqual([
      ['Web', ['web']],
      ['Others', ['cache', 'db']],
    ]);
    w.addon(
      addon(
        'mine',
        ({ contributor }) => void contributor.add('Fill', 'mine.table', { slot: slots.kind.table.name, render: ({ title }: { title?: string }) => <p>mine: {title}</p> }),
      ),
    );
    expect(renderPage(w, '/k/pods.v1').text()).toContain('mine: Webmine: Others');
  });

  it('takes another’s TableView of a kind over the core’s default (and the user’s patch over it)', () => {
    const w = world('web');
    let result: unknown;
    w.addon(
      addon('views', ({ contributor }) => {
        result = contributor.add('TableView', Pod.id, { columns: ['core.age'] });
      }),
    );
    w.user.patch('TableView', Pod.id, { hidden: { 'core.namespace': true } });
    expect(result).toMatchObject({ status: 'included' });
    expect(renderPage(w, '/k/pods.v1').headers()).toEqual(['Age', 'Name', 'Ready', 'Status', 'Restarts']);
  });

  it('keeps the table as it is when an object is opened over it, and closed', () => {
    const page = renderPage(world('web'), '/k/pods.v1');
    const table = page.container.querySelector('[role="table"]');
    page.navigate('/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('Pod web shop');
    expect(page.container.querySelector('[role="table"]')).toBe(table);
    page.navigate('/k/pods.v1');
    expect(page.container.querySelector('[role="table"]')).toBe(table);
  });

  it('draws a page that failed for one path again for the next', () => {
    const w = world();
    const Item = () => {
      const { params } = usePageProps();
      if (params.id === 'bad') throw new Error('no such item');
      return <p>item {params.id}</p>;
    };
    w.addon(
      addon('items', ({ contributor }) => {
        contributor.add('Page', 'item', { path: '/items/:id' });
        contributor.add('Fill', 'items.item', { slot: slots.page('item').name, render: Item });
      }),
    );
    const page = renderPage(w, '/items/bad');
    expect(page.text()).not.toContain('item bad');
    page.navigate('/items/good');
    expect(page.text()).toContain('item good');
  });
});

describe('an object', () => {
  it('is drawn through resource.view’s slots: after its title, a summary, beside its actions, in place of it gone; its title’s menu without Open', () => {
    const w = world('web');
    w.addon(
      addon('more', ({ contributor }) => {
        contributor.add('Fill', 'more.status', fill(slots.resource.view.title, { after: 'core.resource.view.title', target: forKinds(Pod), render: () => <b> · Running</b> }));
        contributor.add('Fill', 'more.summary', fill(slots.resource.view.summary, { render: ({ object }) => <p class="summary">{object.metadata?.name} at a glance</p> }));
        contributor.add('Fill', 'more.logs', fill(slots.resource.view.footer, { render: () => <a href="#/logs">Logs</a> }));
        contributor.add('Fill', 'more.gone', fill(slots.resource.view.missing, { target: forKinds(Pod), render: ({ name }) => <p class="gone">{name} went away</p> }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const title = document.querySelector('.uk-modal h2') as HTMLElement;
    expect(title.textContent).toBe('Pod web shop · Running');
    expect(page.container.querySelector('.summary')?.textContent).toBe('web at a glance');
    expect(document.querySelector('.uk-modal-footer a')?.textContent).toBe('Logs');
    const items = () => [...document.querySelectorAll('.uk-menu [role="menuitem"] .uk-menu-label')].map((i) => i.textContent);
    page.act(() => void (title.firstElementChild as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
    expect(items()).toEqual(['Copy name', 'Copy YAML']);
    page.act(() => void (title.firstElementChild as HTMLElement).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(items()).toEqual(['Copy name', 'Copy YAML']);
    page.navigate('/k/pods.v1?open=pods.v1/shop/gone');
    expect(document.querySelector('.gone')?.textContent).toBe('gone went away');
  });

  it('sums it up as its kind’s columns (the wide ones too), each value in its column’s Wraps as its cell is; being deleted, said first', () => {
    const w = world();
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const pod = { name: 'web', namespace: 'shop', deletionTimestamp: since, finalizers: ['example.com/hold'] };
    w.cluster.add(Pod, make(Pod, { metadata: pod, spec: { nodeName: 'n1', containers: [{ name: 'a', image: 'nginx' }] }, status: { phase: 'Running' } }));
    w.addon(
      addon(
        'looks',
        ({ contributor }) => void contributor.add('Wrap', 'looks.node', wrap<CellProps>('core.v1/Pod.node', { order: 0, render: ({ display }) => <i>{display}!</i> })),
      ),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const summary = document.querySelector('.uk-modal .uk-fields') as HTMLElement;
    const pairs = [...summary.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    // Not its name nor its namespace: its title's.
    expect(pairs.map(([k]) => k)).toEqual(['Ready', 'Status', 'Restarts', 'IP', 'Node', 'QoS', 'Started', 'Nominated Node', 'Readiness Gates', 'Age']);
    // None: nothing ("—").
    expect(Object.fromEntries(pairs)).toMatchObject({ Status: 'Terminating', Node: 'n1!', IP: '—' });
    expect(document.querySelector('.uk-modal .uk-notice')?.textContent).toBe('Deletion requested 5m ago — pending finalizers: example.com/hold');
  });

  it('shows its conditions, what it is tied to and its metadata, each part a slot: labels and annotations as chips (kubectl’s copy of it left out), owners as links', () => {
    const w = world();
    const changed = new Date(Date.now() - 3 * 3_600_000).toISOString();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: {
          name: 'web',
          namespace: 'shop',
          labels: { app: 'web' },
          annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{}', note: 'hi' },
          ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-1', uid: 'u1', controller: true }],
        },
        status: { conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady', message: 'not yet', lastTransitionTime: changed }] },
      }),
    );
    w.addon(
      addon('more', ({ contributor }) => {
        const before = { before: 'core.resource.view.metadata.field.label', when: ({ field }: { field: { name: string } }) => field.name === 'labels', render: () => <b>#</b> };
        contributor.add('Fill', 'more.labels', fill(slots.resource.view.metadata.field.label, before));
        contributor.add(
          'Fill',
          'more.ready',
          fill(slots.resource.view.conditions.condition.type, { after: 'core.resource.view.conditions.condition.type', render: () => <i>?</i> }),
        );
      }),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const rows = [...document.querySelectorAll('.uk-modal [data-part="conditions"] .uk-row')].map((r) => [
      r.querySelector('.uk-row-mark .uk-status')?.getAttribute('data-tone'),
      r.querySelector('.uk-row-mark .uk-status')?.getAttribute('aria-label'),
      ...[...r.children].slice(1).map((c) => c.textContent),
    ]);
    // Its status its mark (its words its name, under the pointer its tip), its type, when it changed; why under it, where it says.
    expect(rows).toEqual([['error', 'False', 'Ready?', '3h', 'ContainersNotReady · not yet']]);
    const section = (title: string) => [...document.querySelectorAll('.uk-modal .uk-section')].find((x) => x.querySelector('h3')?.textContent === title) as HTMLElement;
    const pairs = [...section('Metadata').querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling as HTMLElement]);
    expect(pairs.map(([k]) => k)).toEqual(['Created', 'UID', '#Labels', 'Annotations']);
    const value = (k: string) => pairs.find(([x]) => x === k)?.[1] as HTMLElement;
    expect([...value('#Labels').querySelectorAll('.uk-chip')].map((c) => c.textContent)).toEqual(['appweb']);
    expect([...value('Annotations').querySelectorAll('.uk-chip')].map((c) => c.textContent)).toEqual(['notehi']);
    const owners = section('Related').querySelector('dd') as HTMLElement;
    expect([section('Related').querySelector('dt')?.textContent, owners.textContent, owners.querySelector('a')?.getAttribute('href')]).toEqual([
      'Controlled by',
      'ReplicaSetweb-1',
      expect.stringContaining('open=replicasets.v1.apps/shop/web-1'),
    ]);
  });

  it('takes another’s metadata field among the core’s, a condition twice as twice, a TableView’s order and hiding in its summary', () => {
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'web', namespace: 'shop' },
        status: {
          phase: 'Running',
          conditions: [
            { type: 'Ready', status: 'True' },
            { type: 'Ready', status: 'False', reason: 'Again' },
            { type: 'DisruptionTarget', status: 'True' },
          ],
        },
      }),
    );
    w.addon(
      addon('more', ({ contributor }) => {
        const team = (props: ResourceProps) =>
          slotElement(slots.resource.view.metadata.field, { ...props, field: { name: 'team', label: 'Team' }, value: 'shop', display: 'shop' }, { limit: 1 });
        contributor.add('Fill', 'more.team', fill(slots.resource.view.metadata, { after: 'core.resource.view.metadata.labels', render: team }));
        contributor.patch('TableView', Pod.id, { columns: ['core.v1/Pod.status'], hidden: { 'core.v1/Pod.ip': true } });
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const metadata = () => [...document.querySelectorAll('.uk-modal .uk-section')].find((x) => x.querySelector('h3')?.textContent === 'Metadata') as HTMLElement;
    const fields = () => [...metadata().querySelectorAll('dt')].map((dt) => dt.textContent);
    // No labels, no annotations: not drawn.
    expect(fields()).toEqual(['Created', 'UID', 'Team']);
    const conditions = [...document.querySelectorAll('.uk-modal [data-part="conditions"] .uk-row')].map((r) => [
      r.querySelector('.uk-row-lead')?.textContent,
      r.querySelector('.uk-row-mark .uk-status')?.getAttribute('data-tone'),
    ]);
    // A type twice: two rows; one bad when it holds (DisruptionTarget): True as False looks.
    expect(conditions).toEqual([
      ['Ready', 'ok'],
      ['Ready', 'error'],
      ['DisruptionTarget', 'error'],
    ]);
    const summary = [...(document.querySelector('.uk-modal .uk-fields') as HTMLElement).querySelectorAll('dt')].map((dt) => dt.textContent);
    expect([summary[0], summary.includes('IP')]).toEqual(['Status', false]);
    // One of the core's fields hidden as any slot's fill is: the user's patch of the Slot, by its name.
    page.act(() => void w.user.patch('Slot', slots.resource.view.metadata.name, { hidden: { 'core.resource.view.metadata.uid': true } }));
    expect(fields()).toEqual(['Created', 'Team']);
  });

  it('opens over its kind’s table: its Overview, its YAML a tab of its own, its actions; a dangerous one asks first', async () => {
    const w = world('web');
    const restarted: string[] = [];
    w.addon(
      addon('ops', ({ contributor }) => {
        contributor.add('Action', 'ops.restart', action({ kinds: [Pod], title: 'Restart', dangerous: true, run: (p) => void restarted.push(p.metadata?.name ?? '') }));
        contributor.add('Action', 'ops.fail', action({ kinds: [Pod], title: 'Fail', run: async () => Promise.reject(new Error('refused by the cluster')) }));
        contributor.add('Action', 'ops.deploy', action({ kinds: [Deployment], title: 'Scale', run: () => {} }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('Pod web shop');
    expect(page.text()).not.toContain('name: web');
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('.uk-modal [role="tab"]')].find((t) => t.textContent === 'YAML') as HTMLButtonElement).click());
    expect(page.text()).toContain('name: web');
    // Its buttons (not the table's headers: Restarts).
    const button = (text: string) =>
      [...page.container.querySelectorAll('button')].find((b) => !b.closest('[role="columnheader"]') && b.textContent?.includes(text)) as HTMLButtonElement;
    expect(button('Scale')).toBeUndefined();
    page.act(() => button('Restart').click());
    expect([restarted, button('Restart').textContent]).toEqual([[], 'Confirm Restart?']);
    await page.act(async () => button('Restart').click());
    expect(restarted).toEqual(['web']);
    await page.act(async () => button('Fail').click());
    await expect.poll(() => page.notifications().map((n) => n.text)).toContain('refused by the cluster');
  });

  it('asks again about a dangerous action when the object is another (one made anew under its name)', async () => {
    const w = world('web');
    const removed: string[] = [];
    w.addon(
      addon(
        'ops',
        ({ contributor }) =>
          void contributor.add('Action', 'ops.delete', action({ kinds: [Pod], title: 'Delete', dangerous: true, run: (p) => void removed.push(p.metadata?.uid ?? '') })),
      ),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const button = () => [...page.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete')) as HTMLButtonElement;
    const first = w.cluster.get(Pod, 'web', 'shop')?.metadata?.uid;
    page.act(() => button().click());
    expect(button().textContent).toBe('Confirm Delete?');
    // Replaced meanwhile: another object under its name.
    page.act(() => void w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' } })));
    expect(button().textContent).toBe('Delete');
    await page.act(async () => button().click());
    expect(removed).toEqual([]);
    await page.act(async () => button().click());
    expect(removed).toHaveLength(1);
    expect(removed[0]).not.toBe(first);
  });

  it('says what it is when it cannot be had: refused, not served, gone', () => {
    const w = world('web');
    w.cluster.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'no' });
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('pods cannot be had: Forbidden');
    expect(page.text()).not.toContain('There is no Pod');
  });

  it('shows another’s section in its Overview', () => {
    const w = world('web');
    w.addon(addon('more', ({ contributor }) => void contributor.add('Fill', 'more.s', section({ kinds: [Pod], title: 'More', render: () => <p class="more">more about it</p> }))));
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect((document.querySelector('.uk-modal .more')?.closest('[role="tabpanel"]') as HTMLElement | null)?.dataset.tab).toBe('core.overview');
  });

  it('says so when it is not there (now)', () => {
    expect(renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/gone').text()).toContain('There is no Pod gone');
  });
});

describe('an object’s view', () => {
  const opened = () => document.querySelector('.uk-modal') as HTMLElement;
  const tabs = () => [...opened().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const shown = () => (opened().querySelector('[role="tabpanel"]') as HTMLElement | null)?.dataset.tab;

  it('is titled by its kind and name, its namespace quiet — there or not', () => {
    renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/web');
    expect([opened().querySelector('h2')?.textContent, opened().querySelector('h2 small')?.textContent]).toEqual(['Pod web shop', ' shop']);
    cleanup();
    renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/gone');
    expect(opened().querySelector('h2')?.textContent).toBe('Pod gone shop');
  });

  it('opens on the tab its link says (open-tab), the path keeping the one chosen — its first, none said; one it has not, its first', () => {
    const page = renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/web&open-tab=core.yaml');
    expect(shown()).toBe('core.yaml');
    page.act(() => tabs()[1]?.click());
    expect([shown(), page.path]).toEqual(['core.events', '/k/pods.v1?open=pods.v1/shop/web&open-tab=core.events']);
    page.act(() => tabs()[0]?.click());
    expect([shown(), page.path]).toEqual(['core.overview', '/k/pods.v1?open=pods.v1/shop/web']);
    page.navigate('/k/pods.v1?open=pods.v1/shop/web&open-tab=nothing.here');
    expect(shown()).toBe('core.overview');
  });

  it('has its tabs in order — the core’s Overview first, a log’s (a pod’s, a workload’s), its YAML last, another’s between them for its kinds — each showing its own slot', () => {
    const w = world('web');
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' } }));
    w.addon(
      addon('shell', ({ contributor }) => {
        contributor.add('ResourceTab', 'shell.shell', { target: forKinds(Pod), title: 'Shell', icon: 'enter', order: 500 });
        contributor.add('Fill', 'shell.shell', fill(slots.resource.view.tab('shell.shell'), { render: ({ object }) => <p class="shell">{object.metadata?.name} said hello</p> }));
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect([tabs().map((t) => t.textContent), shown()]).toEqual([['Overview', 'Events', 'Shell', 'Logs', 'Map', 'YAML'], 'core.overview']);
    page.act(() => tabs()[2]?.click());
    expect([shown(), opened().querySelector('.shell')?.textContent]).toEqual(['shell.shell', 'web said hello']);
    page.act(() => tabs()[5]?.click());
    expect([shown(), opened().querySelector('[role="tabpanel"]')?.textContent?.includes('name: web')]).toEqual(['core.yaml', true]);
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect([tabs().map((t) => t.textContent), shown()]).toEqual([['Overview', 'Events', 'Logs', 'Map', 'YAML'], 'core.overview']);
  });

  it('shows a tab only for the objects it is for (its when), one whose when fails not at all — said to its owner', async () => {
    const w = world('web', 'db');
    w.addon(
      addon('more', ({ contributor }) => {
        contributor.add('ResourceTab', 'more.web', { target: {}, title: 'Web', when: (o) => o.metadata?.name === 'web' });
        contributor.add('ResourceTab', 'more.broken', {
          target: {},
          title: 'Broken',
          when: () => {
            throw new Error('no');
          },
        });
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(tabs().map((t) => t.textContent)).toEqual(['Overview', 'Events', 'Web', 'Logs', 'Map', 'YAML']);
    page.navigate('/k/pods.v1?open=pods.v1/shop/db');
    expect(tabs().map((t) => t.textContent)).toEqual(['Overview', 'Events', 'Logs', 'Map', 'YAML']);
    await expect.poll(() => page.failures.map((f) => `${f.definition.kind}/${f.definition.name}`)).toContain('ResourceTab/more.broken');
  });

  it('shows the first tab of another opened, the one chosen kept while it is the same', () => {
    const page = renderPage(world('web', 'db'), '/k/pods.v1?open=pods.v1/shop/web');
    page.act(() =>
      tabs()
        .find((t) => t.textContent === 'YAML')
        ?.click(),
    );
    expect(shown()).toBe('core.yaml');
    page.navigate('/k/pods.v1?open=pods.v1/shop/db');
    expect(shown()).toBe('core.overview');
  });

  it('draws no tabs when there is one (the user hid the rest), and none when there are none', () => {
    const w = world('web');
    for (const tab of ['core.events', 'core.yaml', 'core.logs', 'core.map']) w.user.patch('ResourceTab', tab, { hidden: true });
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect([tabs().length, shown()]).toEqual([0, 'core.overview']);
    page.act(() => void w.user.patch('ResourceTab', 'core.overview', { hidden: true }));
    expect([tabs().length, shown()]).toEqual([0, undefined]);
  });

  /** A pod web (its uid u-web) and the events about it — and one about another. */
  function told() {
    const w = world();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop', uid: 'u-web' } }));
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const event = (name: string, about: string, type: string, reason: string, minutes: number, count?: number) =>
      w.cluster.add(
        kinds.core.v1.Event,
        make(kinds.core.v1.Event, {
          metadata: { name, namespace: 'shop' },
          involvedObject: { kind: 'Pod', name: 'web', uid: about },
          type,
          reason,
          message: `${reason} said`,
          ...(count ? { count } : {}),
          lastTimestamp: ago(minutes),
        }),
      );
    event('a', 'u-web', 'Normal', 'Scheduled', 50);
    event('b', 'u-web', 'Normal', 'Pulled', 40);
    // Past ten minutes ago: said in minutes alone, however long the test takes.
    event('c', 'u-web', 'Warning', 'Unhealthy', 12, 14);
    event('d', 'u-web', 'Normal', 'Started', 30);
    event('e', 'u-other', 'Warning', 'NotMine', 1);
    return w;
  }
  const eventRows = (part: Element | null | undefined) =>
    [...(part?.querySelectorAll('.uk-row') ?? [])].map((r) => [
      r.querySelector('.uk-row-mark .uk-status')?.getAttribute('data-tone'),
      r.querySelector('.uk-row-lead')?.textContent,
      r.querySelector('.uk-row-end')?.textContent,
      r.querySelector('.uk-row-under')?.textContent,
    ]);

  it('shows the latest few events about it in its Overview — its own only, the latest first: their type a mark, how often and when last, their message under', () => {
    renderPage(told(), '/k/pods.v1?open=pods.v1/shop/web');
    const recent = opened().querySelector('[data-part="events"]');
    expect([recent?.querySelector('h3')?.textContent, eventRows(recent)]).toEqual([
      'Recent events',
      [
        ['warn', 'Unhealthy', '×14 · 12m', 'Unhealthy said'],
        ['done', 'Started', '30m', 'Started said'],
        ['done', 'Pulled', '40m', 'Pulled said'],
      ],
    ]);
  });

  it('shows all the events about it in its Events tab; none, said so — and none in its Overview', () => {
    const page = renderPage(told(), '/k/pods.v1?open=pods.v1/shop/web');
    page.act(() => tabs()[1]?.click());
    expect(eventRows(opened().querySelector('[role="tabpanel"]')).map((r) => r[1])).toEqual(['Unhealthy', 'Started', 'Pulled', 'Scheduled']);
    cleanup();
    const quiet = renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/web');
    expect(opened().querySelector('[data-part="events"]')).toBeNull();
    quiet.act(() => tabs()[1]?.click());
    expect(opened().querySelector('[role="tabpanel"] .uk-nothing')?.textContent).toBe('No events (the API server keeps events for 1h by default).');
  });

  it('draws an event through its slots: another’s part beside the core’s', () => {
    const w = told();
    w.addon(
      addon(
        'more',
        ({ contributor }) =>
          void contributor.add(
            'Fill',
            'more.who',
            fill(slots.resource.view.events.event.reason, { after: 'core.resource.view.events.event.reason', render: () => <i> (kubelet)</i> }),
          ),
      ),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(eventRows(opened().querySelector('[data-part="events"]'))[0]?.[1]).toBe('Unhealthy (kubelet)');
  });

  it('shows what it is tied to only when there is something: its owners, another’s field among them', () => {
    const related = () => opened().querySelector('[data-part="related"]') as HTMLElement | null;
    const w = world('web');
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    // Its list empty: the kit's styles draw no such section (.uk-section:has(> .uk-kv:empty)).
    expect(related()?.querySelector('.uk-kv')?.childNodes.length).toBe(0);
    page.act(
      () =>
        void w.addon(
          addon('more', ({ contributor }) => {
            const node = (props: ResourceProps) =>
              slotElement(slots.resource.view.related.field, { ...props, field: { name: 'node', label: 'Node' }, value: 'n1', display: 'n1' }, { limit: 1 });
            contributor.add('Fill', 'more.node', fill(slots.resource.view.related, { render: node }));
          }),
        ),
    );
    expect([...(related()?.querySelectorAll('dt') ?? [])].map((d) => [d.textContent, d.nextElementSibling?.textContent])).toEqual([['Node', 'n1']]);
  });

  it('has its YAML in a tab of its own, copied there (none of the core’s in its footer)', async () => {
    const written: string[] = [];
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => void written.push(t) } });
    const page = renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/web');
    expect(document.querySelectorAll('.uk-modal-footer button')).toHaveLength(0);
    page.act(() => [...document.querySelectorAll<HTMLButtonElement>('.uk-modal [role="tab"]')].find((t) => t.textContent === 'YAML')?.click());
    const copy = [...document.querySelectorAll<HTMLButtonElement>('.uk-yaml-bar button')].find((b) => b.textContent === 'Copy') as HTMLButtonElement;
    await page.act(async () => copy.click());
    expect([written[0], copy.textContent]).toContain('Copied');
    expect(written[0]).toContain('name: web');
  });

  it('has its header’s: another’s before the core’s layout switch', () => {
    const w = world('web');
    w.addon(
      addon('more', ({ contributor }) => void contributor.add('Fill', 'more.shell', fill(slots.resource.view.header, { render: () => <button type="button">Shell</button> }))),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const header = opened().querySelector('header') as HTMLElement;
    expect([...header.querySelectorAll('button')].map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Shell', 'Side panel', 'Window', 'Full screen', 'Close']);
  });

  it('is laid out as the user chose it: kept as theirs (Appearance), for every resource opened after', () => {
    const w = world('web', 'db');
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const placement = () => document.querySelector('.uk-modal-frame')?.getAttribute('data-placement');
    expect(placement()).toBe('right');
    page.act(() => (opened().querySelector('button[aria-label="Window"]') as HTMLButtonElement).click());
    expect([placement(), w.user.saved().patches]).toEqual(['center', [{ kind: 'Appearance', name: 'default', fields: { layout: 'center' } }]]);
    page.navigate('/k/pods.v1?open=pods.v1/shop/db');
    expect(placement()).toBe('center');
  });
});

describe('the navigation', () => {
  it('starts at the start, a tab of its own; shows the pinned as tabs, the one the page is at beside them', () => {
    const page = renderPage(world(), '/');
    expect([page.path, [...(page.container.querySelector('main')?.querySelectorAll('.uk-panel-title h2') ?? [])].map((h) => h.textContent)]).toEqual([
      '/',
      ['Unhealthy', 'Events', 'Cluster', 'Capacity', 'Nodes', 'Namespaces'],
    ]);
    expect(page.links('Kinds')).toEqual(['Overview', 'Pods', 'Map', 'Deployments', 'Services', 'ConfigMaps', 'Nodes', 'Namespaces']);
    page.navigate('/k/events.v1');
    expect(page.links('Kinds').at(-1)).toBe('Events');
    expect(page.container.querySelector('.uk-rail')).toBeNull();
  });

  /** The start's dashboard hidden by the user (what else is on it, as it was). */
  const undashboard = (w: ReturnType<typeof world>, hidden: Record<string, boolean> = {}) =>
    w.user.patch('Slot', slots.page('overview').name, { hidden: { 'core.page.overview.dashboard': true, ...hidden } });

  it('pins as the user said — in their order, then those pinned by default they did not say (one an addon pins later too), not those they unpinned', () => {
    expect([
      pinnedOf(['pods', 'deploy', 'svc'], undefined),
      pinnedOf(['pods', 'deploy', 'svc'], { pinned: ['svc', 'nodes', 'pods'], unpinned: ['deploy'] }),
      // An addon's pinned page since: there too, after the user's.
      pinnedOf(['pods', 'deploy', 'svc', 'certs'], { pinned: ['svc', 'nodes', 'pods'], unpinned: ['deploy'] }),
    ]).toEqual([
      ['pods', 'deploy', 'svc'],
      ['svc', 'nodes', 'pods'],
      ['svc', 'nodes', 'pods', 'certs'],
    ]);
  });

  it('goes from the start to the first pinned kind once nothing else is on it — as the user pinned them, if they did', () => {
    const w = world();
    undashboard(w);
    expect(renderPage(w, '/').path).toBe('/k/pods.v1');
    const mine = world();
    undashboard(mine);
    mine.user.patch('NavView', 'default', { pinned: ['v1/Node'] });
    expect(renderPage(mine, '/').path).toBe('/k/nodes.v1');
  });

  it('stays at the start once another puts something on it: a page of its own', () => {
    const w = world();
    undashboard(w);
    w.addon(addon('overview', ({ contributor }) => void contributor.add('Fill', 'overview.welcome', { slot: slots.page('overview').name, render: () => <p>welcome</p> })));
    const page = renderPage(w, '/');
    expect([page.path, page.container.querySelector('main')?.textContent]).toEqual(['/', 'welcome']);
  });

  it('says a page nothing is on is empty: the start, its redirect hidden by the user', () => {
    const w = world();
    undashboard(w, { 'core.page.overview': true });
    const page = renderPage(w, '/');
    expect([page.path, page.container.querySelector('main')?.textContent]).toEqual(['/', 'Nothing is on this page.']);
  });

  it('lists an addon’s page with the kinds, pinned (a tab) or not; hidden, not at all — the user’s to change', () => {
    const w = world();
    w.addon(
      addon('certs', ({ contributor }) => {
        contributor.add('Page', 'cert-manager.certs', { path: '/certs', title: 'Certificates', pinned: true });
        contributor.add('Page', 'cert-manager.issuers', { path: '/issuers', title: 'Issuers', hidden: true });
      }),
    );
    expect(renderPage(w, '/k/pods.v1').links('Kinds')).toContain('Certificates');
    const user = w.user;
    user.patch('Page', 'cert-manager.certs', { hidden: true });
    user.patch('Page', 'cert-manager.issuers', { hidden: false, pinned: true });
    const links = renderPage(w, '/k/pods.v1').links('Kinds');
    expect([links.includes('Certificates'), links.includes('Issuers')]).toEqual([false, true]);
  });

  it('keeps a kind gone to open as a tab till it is closed, as a browser does; closed where the page is, to its neighbour', () => {
    const page = renderPage(world(), '/k/events.v1');
    page.navigate('/k/secrets.v1');
    page.navigate('/k/pods.v1');
    expect(page.links('Kinds').slice(-2)).toEqual(['Events', 'Secrets']);
    const close = (id: string) => page.act(() => (page.container.querySelector(`nav [data-tab="${id}"] .uk-tab-close`) as HTMLElement).click());
    close('v1/Event');
    expect([page.path, page.links('Kinds').slice(-2)]).toEqual(['/k/pods.v1', ['Namespaces', 'Secrets']]);
    page.navigate('/k/secrets.v1');
    close('v1/Secret');
    expect([page.path, page.links('Kinds').includes('Secrets')]).toEqual(['/k/namespaces.v1', false]);
  });

  it('moves a tab into the pinned (Alt and an arrow, as a drag), pinning it', async () => {
    const page = renderPage(world(), '/k/events.v1');
    const events = page.container.querySelector('nav [data-tab="v1/Event"]') as HTMLElement;
    page.act(() => void events.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })));
    await vi.waitFor(() => expect(page.container.querySelector('nav [data-tab="v1/Event"]')?.hasAttribute('data-transient')).toBe(false));
    expect(page.links('Kinds').at(-1)).toBe('Events');
  });

  it('has a tab’s menu (a right click, Shift+F10): pin, unpin, close — as the tab is; Shift and a right click: the browser’s; pinned, the user’s (the NavView’s, patched)', async () => {
    const w = world();
    const page = renderPage(w, '/k/events.v1');
    const tab = (id: string) => page.container.querySelector(`nav [data-tab="${id}"]`) as HTMLElement;
    const items = () => [...document.querySelectorAll('.uk-menu [role="menuitem"] .uk-menu-label')].map((i) => i.textContent);
    const menu = (id: string, init: MouseEventInit = {}) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, ...init });
      page.act(() => void tab(id).dispatchEvent(e));
      return e.defaultPrevented;
    };
    expect(menu('v1/Event', { shiftKey: true })).toBe(false);
    expect(menu('v1/Event')).toBe(true);
    expect([document.querySelector('.uk-menu-title')?.textContent, items()]).toEqual(['Events', ['Pin', 'Close']]);
    page.act(() => (document.querySelector('.uk-menu [role="menuitem"]') as HTMLElement).click());
    await vi.waitFor(() => expect(tab('v1/Event').hasAttribute('data-transient')).toBe(false));
    expect(w.user.saved().patches).toEqual([{ kind: 'NavView', name: 'default', fields: { pinned: expect.arrayContaining(['v1/Pod', 'v1/Event']), unpinned: [] } }]);
    page.act(() => void tab('v1/Pod').dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
    expect(items()).toEqual(['Unpin']);
  });

  it('gives another’s item of a tab’s menu the tab as it is drawn, and what can be done to it', async () => {
    const w = world();
    const seen: string[] = [];
    w.addon(
      addon(
        'more',
        ({ contributor }) =>
          void contributor.add(
            'MenuItem',
            'more.nav.tabs.tab.context.done',
            menuItem({
              on: 'nav.tabs.tab.context',
              title: 'Done here',
              run: (t) => {
                seen.push(`${t.entry.key} ${t.entry.path} ${t.kind?.id} ${t.pinned} ${t.current}`);
                t.close();
              },
            }),
          ),
      ),
    );
    const page = renderPage(w, '/k/events.v1');
    const tab = () => page.container.querySelector('nav [data-tab="v1/Event"]');
    page.act(() => void tab()?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    page.act(() => ([...document.querySelectorAll<HTMLElement>('.uk-menu [role="menuitem"]')].find((i) => i.textContent?.startsWith('Done here')) as HTMLElement).click());
    await vi.waitFor(() => expect(tab()).toBeNull());
    expect(seen).toEqual(['v1/Event /k/events.v1 v1/Event false true']);
  });

  it('keeps focus on a tab pinned from its menu (the keyboard’s), where it now is', async () => {
    const page = renderPage(world(), '/k/events.v1');
    const tab = () => page.container.querySelector('nav [data-tab="v1/Event"]') as HTMLElement;
    tab().focus();
    page.act(() => void tab().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement?.textContent).toBe('Pin');
    page.act(() => void (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await vi.waitFor(() => expect(tab().hasAttribute('data-transient')).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(tab()));
  });

  it('opens none of its own when its menu is not drawn (hidden in the menu slot): the browser’s then; nor again for the keyboard’s click after it', () => {
    const w = world();
    w.addon(addon('quiet', ({ contributor }) => void contributor.add('Slot', 'menu', { hidden: { 'core.menu': true } })));
    const page = renderPage(w, '/k/events.v1');
    const tab = page.container.querySelector('nav [data-tab="v1/Event"]') as HTMLElement;
    const click = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    page.act(() => void tab.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(false);
    cleanup();
    const shown = renderPage(world(), '/k/events.v1');
    const t = shown.container.querySelector('nav [data-tab="v1/Event"]') as HTMLElement;
    shown.act(() => void t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })));
    const id = document.querySelector('.uk-menu');
    const echo = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    shown.act(() => void t.dispatchEvent(echo));
    expect([echo.defaultPrevented, document.querySelector('.uk-menu')]).toEqual([true, id]);
  });

  it('closes a tab from its menu, the page going to its neighbour', async () => {
    const page = renderPage(world(), '/k/events.v1');
    const tab = page.container.querySelector('nav [data-tab="v1/Event"]') as HTMLElement;
    page.act(() => void tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    const close = [...document.querySelectorAll<HTMLElement>('.uk-menu [role="menuitem"]')].find((i) => i.textContent?.startsWith('Close')) as HTMLElement;
    page.act(() => close.click());
    await vi.waitFor(() => expect(page.path).toBe('/k/namespaces.v1'));
    expect(page.links('Kinds')).not.toContain('Events');
  });

  it('draws a tab through its slots: another adds before or after its title (for some kinds), wraps its title, or draws it whole — still a link, its menu, its ×', () => {
    const w = world();
    const { Service } = kinds.core.v1;
    w.addon(
      addon('tabs', ({ contributor }) => {
        contributor.add('Fill', 'tabs.badge', fill(slots.nav.tabs.tab.content, { after: 'core.nav.tabs.tab.title', target: forKinds(Pod), render: () => <b class="badge">3</b> }));
        contributor.add('Fill', 'tabs.icon', fill(slots.nav.tabs.tab.content, { before: 'core.nav.tabs.tab.title', target: forKinds(Pod), render: () => <>*</> }));
        contributor.add('Wrap', 'tabs.loud', wrap<NavTabProps>('core.nav.tabs.tab.title', { kinds: [Deployment], render: ({ entry }) => <i>{entry.title}!</i> }));
        contributor.add(
          'Fill',
          'tabs.own',
          fill(slots.nav.tabs.tab, {
            target: forKinds(Service),
            render: ({ attrs, close, entry }) => (
              <a {...attrs} class="mine">
                * {entry.title}
                {close}
              </a>
            ),
          }),
        );
      }),
    );
    const page = renderPage(w, '/k/services.v1');
    const tab = (id: string) => page.container.querySelector(`nav [data-tab="${id}"]`) as HTMLElement;
    expect(tab('v1/Pod').textContent).toBe('*Pods3');
    expect(tab('apps/v1/Deployment').querySelector('i')?.textContent).toBe('Deployments!');
    const own = tab('v1/Service');
    expect([own.className, own.textContent, own.getAttribute('href'), own.getAttribute('aria-current')]).toEqual(['mine', '* Services', '#/k/services.v1', 'page']);
    const ask = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    page.act(() => void own.dispatchEvent(ask));
    expect([ask.defaultPrevented, document.querySelector('.uk-menu-title')?.textContent]).toEqual([true, 'Services']);
  });

  it('has after the tabs the core’s + and others’ buttons (nav.tabs.actions): one added after it, the + itself replaced', () => {
    const added = world();
    added.addon(
      addon(
        'more',
        ({ contributor }) =>
          void contributor.add('Fill', 'more.button', { slot: slots.nav.tabs.actions.name, after: 'core.nav.tabs.picker', render: () => <TabButton icon="gear" label="More" /> }),
      ),
    );
    const page = renderPage(added, '/k/pods.v1');
    expect([...page.container.querySelectorAll('.uk-tabs > button, .uk-tabs > .uk-tip-at > button')].map((b) => b.getAttribute('aria-label'))).toEqual(['All kinds', 'More']);
    cleanup();
    const replaced = world();
    replaced.addon(
      addon('mine', ({ contributor }) => void contributor.add('Wrap', 'mine.picker', { wraps: 'core.nav.tabs.picker', render: () => <TabButton icon="search" label="Find" /> })),
    );
    const other = renderPage(replaced, '/k/pods.v1');
    expect([...other.container.querySelectorAll('.uk-tabs > button, .uk-tabs > .uk-tip-at > button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Find']);
  });

  it('draws the picker through its slots: beside its search, down its side, above what a section shows, after a section’s and an entry’s title (for some kinds), nothing to show; or another’s picker whole', () => {
    const open = (page: ReturnType<typeof renderPage>) => page.act(() => (page.container.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement).click());
    const picker = () => document.querySelector('[role="dialog"][aria-label="All kinds"]') as HTMLElement;
    const added = world('web', 'db');
    added.addon(
      addon('more', ({ contributor }) => {
        contributor.add('Fill', 'more.toggle', { slot: slots.nav.picker.header.name, after: 'core.nav.picker.search', render: () => <button type="button">only served</button> });
        contributor.add('Fill', 'more.recent', { slot: slots.nav.picker.content.name, order: 100, render: () => <p class="recent">Recent</p> });
        contributor.add('Fill', 'more.side', { slot: slots.nav.picker.side.name, order: 900, render: () => <p class="side">Saved views</p> });
        contributor.add(
          'Fill',
          'more.new',
          fill(slots.nav.picker.section.content, { after: 'core.nav.picker.section.title', when: ({ section }) => section.key === 'custom', render: () => <i> new</i> }),
        );
        contributor.add('Fill', 'more.count', fill(slots.nav.picker.item.content, { after: 'core.nav.picker.item.title', target: forKinds(Pod), render: () => <b> 3</b> }));
        contributor.add('Fill', 'more.empty', fill(slots.nav.picker.empty, { render: ({ chosen }) => <p class="empty">{`none in ${chosen}`}</p> }));
      }),
    );
    const page = renderPage(added, '/k/pods.v1');
    open(page);
    // Its search and what is beside it; down its side the sections, another's after them; a section's title and what is after it.
    expect(picker().querySelector('.uk-catalog-top')?.textContent).toBe('only servedEsc');
    const side = [...picker().querySelectorAll('.uk-catalog-side > *:not(.uk-catalog-mark)')].map((e) => e.textContent?.replace(/\d+$/, ''));
    expect([side[0], side.includes('Workloads'), side.includes('Custom resources new'), side.at(-1)]).toEqual(['Pinned', true, true, 'Saved views']);
    // The pinned shown first: another's above them; an entry's title, what is after it for a kind.
    const pane = () => picker().querySelector('.uk-catalog-pane') as HTMLElement;
    expect(pane().textContent?.indexOf('Recent')).toBe(0);
    expect(pane().querySelector('a[href="#/k/pods.v1"]')?.textContent).toBe('Pods 3');
    expect(pane().querySelector('a[href="#/k/deployments.v1.apps"]')?.textContent).toBe('Deployments');
    // How many of each kind there are, beside it.
    const sizeOf = (href: string) => pane().querySelector(`a[href="${href}"]`)?.closest('.uk-catalog-row')?.querySelector('.uk-catalog-count')?.textContent;
    expect([sizeOf('#/k/pods.v1'), sizeOf('#/k/deployments.v1.apps')]).toEqual(['2', '0']);
    // A section with nothing in it: another's word for it in the core's place.
    page.act(() => ([...picker().querySelectorAll('.uk-catalog-section')].find((b) => b.textContent?.startsWith('Custom resources')) as HTMLButtonElement).click());
    expect(pane().querySelector('.empty')?.textContent).toBe('none in custom');
    cleanup();
    const replaced = world();
    replaced.addon(
      addon(
        'mine',
        ({ contributor }) =>
          void contributor.add(
            'Fill',
            'mine.palette',
            fill(slots.nav.picker, {
              render: ({ close }) => (
                <button type="button" onClick={close}>
                  palette
                </button>
              ),
            }),
          ),
      ),
    );
    const other = renderPage(replaced, '/k/pods.v1');
    open(other);
    expect(picker().textContent).toBe('palette');
  });

  it('opens the kinds’ picker from the tabs’ +: the pinned first, a section chosen; typed, every section searched (one chosen then, said so when none there); pinned in place; one chosen goes there', () => {
    const page = renderPage(world(), '/k/pods.v1');
    page.act(() => (page.container.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement).click());
    const picker = () => page.container.querySelector('[role="dialog"][aria-label="All kinds"]') as HTMLElement;
    const pane = () => picker().querySelector('.uk-catalog-pane') as HTMLElement;
    const section = (name: string) => [...picker().querySelectorAll('.uk-catalog-section')].find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement;
    const type = (text: string) =>
      page.act(() => {
        const input = picker().querySelector('input') as HTMLInputElement;
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    expect([section('Pinned').getAttribute('aria-current'), pane().textContent?.includes('Pods'), pane().textContent?.includes('StorageClasses')]).toEqual(['true', true, false]);
    page.act(() => section('Storage').click());
    expect(pane().textContent).toContain('StorageClasses');
    // Typed: every section's matches, by section — each section's count of them; one chosen with none: said so, and a way back.
    type('class');
    expect([section('All matches').getAttribute('aria-current'), section('Storage').textContent, pane().querySelector('.uk-catalog-heading')?.textContent]).toEqual([
      'true',
      'Storage1',
      'Storage',
    ]);
    page.act(() => section('Workloads').click());
    expect(pane().textContent).toContain('Nothing like “class” in Workloads');
    page.act(() => ([...pane().querySelectorAll('button')].find((b) => b.textContent === 'Search everywhere') as HTMLButtonElement).click());
    expect(section('All matches').getAttribute('aria-current')).toBe('true');
    // Pinned in place: a tab kept at hand.
    page.act(() => (pane().querySelector('button[aria-label="Pin StorageClasses"]') as HTMLButtonElement).click());
    expect([...page.container.querySelectorAll('.uk-tabs a')].map((a) => a.textContent)).toContain('StorageClasses');
    page.act(() => (pane().querySelector('a[href="#/k/storageclasses.v1.storage.k8s.io"]') as HTMLAnchorElement).click());
    expect([page.path, picker()?.dataset.state]).toEqual(['/k/storageclasses.v1.storage.k8s.io', 'closing']);
  });

  it('opens an object from its name in the table', () => {
    const page = renderPage(world('web'), '/k/pods.v1');
    page.act(() => (page.container.querySelector('a[href="#/k/pods.v1?open=pods.v1/shop/web"]') as HTMLAnchorElement).click());
    expect(page.path).toBe('/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('Pod web shop');
  });

  it('draws the same tabs down the side once the user says so (the NavView): in a rail — collapsed at first, pinned by its toggle (or as the NavView says) — each its mark, told where it is', () => {
    const w = world();
    const seen: string[] = [];
    w.addon(
      addon('more', ({ contributor }) => {
        contributor.add(
          'Fill',
          'more.where',
          fill(slots.nav.tabs.tab.content, { target: forKinds(Node), render: ({ placement, collapsed }) => (seen.push(`${placement} ${collapsed}`), null) }),
        );
      }),
    );
    const user = w.user;
    user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/k/nodes.v1');
    const rail = page.container.querySelector('aside.uk-rail') as HTMLElement;
    const tabs = [...rail.querySelectorAll('[data-tab]')];
    // One strip (down the side, none across the top); each tab its mark — the usual kinds' icons — and its name.
    expect([page.container.querySelectorAll('nav.uk-tabs').length, rail.dataset.state, tabs.every((t) => t.querySelector('.uk-tab-mark svg'))]).toEqual([1, 'collapsed', true]);
    const current = rail.querySelector('[aria-current="page"]') as HTMLElement;
    expect([current.querySelector('.uk-tab-label')?.textContent, seen.at(-1)]).toEqual(['Nodes', 'side true']);
    // No tip of its own (the side opens under the pointer: its name seen).
    fireEvent.keyDown(document, { key: 'Tab' });
    page.act(() => void fireEvent.focusIn(current));
    expect(document.querySelector('.uk-tip')).toBeNull();
    page.act(() => (rail.querySelector('.uk-rail-pin') as HTMLButtonElement).click());
    expect([rail.dataset.state, seen.at(-1)]).toEqual(['pinned', 'side false']);
    // Pinned by its toggle: the user's (the NavView's side, patched), kept.
    expect(user.saved().patches).toEqual([{ kind: 'NavView', name: 'default', fields: { mode: 'side', side: 'pinned' } }]);
    const pinned = world();
    pinned.user.patch('NavView', 'default', { mode: 'side', side: 'pinned' });
    expect(renderPage(pinned, '/k/nodes.v1').container.querySelector('aside.uk-rail')?.getAttribute('data-state')).toBe('pinned');
  });

  it('opens the picker from the side beside the rail (its flyout, its whole height), the rail wide with it; closed by Escape, focus back on the +', () => {
    const w = world();
    w.user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/k/pods.v1');
    const rail = page.container.querySelector('aside.uk-rail') as HTMLElement;
    const add = rail.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement;
    page.act(() => add.click());
    const picker = rail.querySelector(':scope > [role="dialog"]') as HTMLElement;
    expect([picker?.getAttribute('aria-label'), picker?.classList.contains('uk-rail-flyout'), rail.dataset.state, add.getAttribute('aria-expanded')]).toEqual([
      'All kinds',
      true,
      'peek',
      'true',
    ]);
    expect(picker.textContent).toContain('Workloads');
    page.act(() => void picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect([add.getAttribute('aria-expanded'), document.activeElement]).toEqual(['false', add]);
  });

  it('keeps the side rail open while a tab’s menu is, collapsing once it closes', async () => {
    vi.useFakeTimers();
    const w = world();
    w.user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/k/pods.v1');
    const rail = page.container.querySelector('aside.uk-rail') as HTMLElement;
    const panel = rail.querySelector('.uk-rail-panel') as HTMLElement;
    page.act(() => void panel.dispatchEvent(new PointerEvent('pointerenter')));
    page.act(() => void vi.advanceTimersByTime(PEEK_MS));
    page.act(() => void rail.querySelector('[data-tab="v1/Pod"]')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    page.act(() => void panel.dispatchEvent(new PointerEvent('pointerleave')));
    page.act(() => void vi.advanceTimersByTime(LEAVE_MS * 4));
    expect([document.querySelector('.uk-menu-title')?.textContent, rail.dataset.state]).toEqual(['Pods', 'peek']);
    page.act(() => void document.querySelector('.uk-menu [role="menuitem"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    page.act(() => void vi.advanceTimersByTime(LEAVE_MS * 2));
    expect([document.querySelector('.uk-menu'), rail.dataset.state]).toEqual([null, 'collapsed']);
    vi.useRealTimers();
  });

  it('draws another addon’s page at its path — its own pages under it — and lists it with the rest', () => {
    const w = world();
    const Certs = () => <p>certs at {usePageProps().rest || '/'}</p>;
    w.addon(
      addon('certs', ({ contributor }) => {
        contributor.add('Page', 'certs', { path: '/certs/*', title: 'Certificates' });
        contributor.add('Fill', 'certs.page', { slot: slots.page('certs').name, render: Certs });
      }),
    );
    w.user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/certs/expiring');
    expect(page.text()).toContain('certs at /expiring');
    expect(page.container.querySelector('a[href="#/certs"] .uk-tab-label')?.textContent).toBe('Certificates');
  });

  it('opens a resource over the page it is on (another addon’s, its table the core’s), and closes it there: back where it was opened from — or, opened by a link to it, the page with nothing open', async () => {
    const w = world('web');
    w.addon(
      addon('certs', ({ contributor }) => {
        contributor.add('Page', 'cert-manager.certs', { path: '/certs' });
        contributor.add('Fill', 'certs.pods', { slot: slots.page('cert-manager.certs').name, render: () => <KindTable kind={Pod} /> });
      }),
    );
    const close = (page: ReturnType<typeof renderPage>) => page.act(() => (page.container.querySelector('.uk-modal button[aria-label="Close"]') as HTMLButtonElement).click());
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/certs');
    page.act(() => (page.container.querySelector('a[href="#/certs?open=pods.v1/shop/web"]') as HTMLAnchorElement).click());
    expect([page.path, page.text().includes('Pod web shop'), page.container.querySelectorAll('[role="table"]').length]).toEqual(['/certs?open=pods.v1/shop/web', true, 1]);
    close(page);
    await vi.waitFor(() => expect(page.path).toBe('/certs'));
    page.back();
    expect(page.path).toBe('/k/pods.v1');
    const linked = renderPage(w, '/certs?tab=2&open=pods.v1/shop/web&x=1');
    close(linked);
    await vi.waitFor(() => expect(linked.path).toBe('/certs?tab=2&x=1'));
  });

  it('opens one over another (the page the same) and, closed, leaves the page with nothing open — over no page too', async () => {
    const w = world('web', 'db');
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/k/pods.v1?open=pods.v1/shop/web');
    page.navigate('/k/pods.v1?open=pods.v1/shop/db');
    page.act(() => (page.container.querySelector('.uk-modal button[aria-label="Close"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(page.path).toBe('/k/pods.v1'));
    page.back();
    expect(page.path).toBe('/k/pods.v1?open=pods.v1/shop/web');
    const nowhere = renderPage(w, '/nowhere?open=pods.v1/shop/web');
    expect([nowhere.text().includes('No page at /nowhere'), nowhere.text().includes('Pod web shop')]).toEqual([true, true]);
  });

  it('opens nothing it cannot — a kind not served, a scope not the kind’s — and says so', () => {
    for (const path of ['/k/pods.v1?open=things.v1.example.com/shop/x', '/k/pods.v1?open=pods.v1/web', '/k/pods.v1?open=nodes.v1/shop/n1']) {
      const page = renderPage(world('web'), path);
      expect([page.path, page.container.querySelector('.uk-modal'), page.notifications().map((n) => n.text)]).toEqual([
        '/k/pods.v1',
        null,
        [`Nothing to open at ${path.split('open=')[1]}.`],
      ]);
      page.unmount();
    }
  });

  it('waits to open a kind discovery has not answered for, and opens nothing once it cannot have it', () => {
    const w = world('web');
    w.cluster.discover('loading');
    const page = renderPage(w, '/k/pods.v1?open=things.v1.example.com/shop/x');
    expect([page.path, page.notifications()]).toEqual(['/k/pods.v1?open=things.v1.example.com/shop/x', []]);
    page.act(() => w.cluster.discover('error', { status: 403, code: 'Forbidden', message: 'no' }));
    expect([page.path, page.notifications().map((n) => n.text)]).toEqual(['/k/pods.v1', ['Nothing to open at things.v1.example.com/shop/x.']]);
  });

  it('gives a page whose path names no kind it knows to what fills it, the kind none (another addon’s :kind is its own)', () => {
    const w = world();
    w.addon(
      addon('docs', ({ contributor }) => {
        contributor.add('Page', 'docs.topic', { path: '/docs/:kind' });
        contributor.add('Fill', 'docs.topic', {
          slot: slots.page('docs.topic').name,
          render: ({ params, kind }: PageProps) => (
            <p>
              docs on {params.kind}
              {kind ? ' (a kind)' : ''}
            </p>
          ),
        });
      }),
    );
    const main = (path: string) => renderPage(w, path).container.querySelector('main')?.textContent;
    expect([main('/docs/tabs'), main('/docs/pods.v1')]).toEqual(['docs on tabs', 'docs on pods.v1 (a kind)']);
  });

  it('says so when nothing is at a path', () => {
    expect(renderPage(world(), '/nowhere').text()).toContain('No page at /nowhere');
  });
});

describe('how it looks', () => {
  /** The frame's root: where the theme's tokens are set (the page's .uk-root; here, the frame). */
  const root = (page: ReturnType<typeof renderPage>) => page.container.querySelector('.uk-root') as HTMLElement;

  it('takes the theme the user chooses — an addon’s — in the variant asked for; the kit’s own under it', () => {
    const w = world();
    w.addon(addon('nord', ({ contributor }) => void contributor.add('Theme', 'nord', { title: 'Nord', dark: { accent: '#88c0d0' }, light: { accent: '#5e81ac', bg: '#eceff4' } })));
    const user = w.user;
    const page = renderPage(w, '/k/pods.v1');
    // The kit's own theme: no tokens of its own set (the defaults are the kit's CSS).
    expect(root(page).style.getPropertyValue('--uk-accent')).toBe('');
    page.act(() => user.patch('Appearance', 'default', { theme: 'nord', mode: 'dark' }));
    expect([root(page).style.getPropertyValue('--uk-accent'), root(page).style.getPropertyValue('--uk-bg'), root(page).dataset.theme]).toEqual(['#88c0d0', '', undefined]);
    page.act(() => user.patch('Appearance', 'default', { theme: 'nord', mode: 'light' }));
    expect([root(page).style.getPropertyValue('--uk-accent'), root(page).style.getPropertyValue('--uk-bg'), root(page).dataset.theme]).toEqual(['#5e81ac', '#eceff4', 'light']);
  });

  it('lets the user change one colour of a theme, the others kept', () => {
    const w = world();
    const user = w.user;
    user.patch('Appearance', 'default', { mode: 'dark' });
    user.patch('Theme', 'default', { dark: { accent: 'rebeccapurple' } });
    const page = renderPage(w, '/k/pods.v1');
    expect(root(page).style.getPropertyValue('--uk-accent')).toBe('rebeccapurple');
    // A theme is behaviour to add: the user changes one, makes none — the user's changes are patches only.
    expect((user as unknown as { add?: unknown }).add).toBeUndefined();
  });
});

describe('a theme, further', () => {
  const root = (page: ReturnType<typeof renderPage>) => page.container.querySelector('.uk-root') as HTMLElement;

  it('keeps a theme’s corners and fonts in both variants; a patch of one variant keeps the other’s colours', () => {
    const w = world();
    w.addon(addon('square', ({ contributor }) => void contributor.add('Theme', 'square', { title: 'Square', dark: { radius: '0', accent: 'red' } })));
    const user = w.user;
    user.patch('Appearance', 'default', { theme: 'square', mode: 'light' });
    user.patch('Theme', 'square', { light: { accent: 'blue' } });
    const page = renderPage(w, '/k/pods.v1');
    expect([root(page).style.getPropertyValue('--uk-radius'), root(page).style.getPropertyValue('--uk-accent')]).toEqual(['0', 'blue']);
    page.act(() => user.patch('Appearance', 'default', { theme: 'square', mode: 'dark' }));
    expect([root(page).style.getPropertyValue('--uk-radius'), root(page).style.getPropertyValue('--uk-accent'), root(page).dataset.theme]).toEqual(['0', 'red', undefined]);
  });

  it('refuses a token the kit has not (a misspelling is said, not dropped unseen)', () => {
    const w = world();
    let result: unknown;
    w.addon(
      addon('typo', ({ contributor }) => {
        result = contributor.add('Theme', 'typo', { title: 'Typo', dark: { acent: 'red' } as never });
      }),
    );
    expect(result).toMatchObject({ status: 'rejected' });
  });
});

describe('in another language', () => {
  const pl = (more: Record<string, unknown> = {}) =>
    addon(
      'lang-pl',
      ({ contributor }) =>
        void contributor.add('Messages', 'pl:core', {
          messages: { 'core.column.name': 'Nazwa', 'core.category.cluster': 'Klaster', 'core.nav.kinds': 'Rodzaje', ...more } as never,
        }),
    );

  it('says the core’s words as the language says them, the rest in English; kinds’ names as they are; the root says its language', () => {
    const w = world('web');
    w.addon(pl());
    w.language('pl');
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers()).toEqual(['Nazwa', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age']);
    expect(page.links('Rodzaje')).toContain('Nodes');
    expect((page.container.querySelector('.uk-root') as HTMLElement).lang).toBe('pl');
  });

  it('switches at once: a language set, a translation added, the user’s rewording of one phrase (English’s too)', () => {
    const w = world('web');
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => w.language('pt-BR'));
    expect(page.headers()[0]).toBe('Name');
    page.act(() => void w.addon(addon('lang-pt', ({ contributor }) => void contributor.add('Messages', 'pt:core', { messages: { 'core.column.name': 'Nome' } }))));
    expect(page.headers()[0]).toBe('Nome');
    page.act(() => void w.user.patch('Messages', 'pt:core', { messages: { 'core.column.name': 'Nominho' } }));
    expect(page.headers()[0]).toBe('Nominho');
    page.act(() => {
      w.language('en');
      w.user.patch('Messages', 'en:core', { messages: { 'core.column.age': 'Created' } });
    });
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Created']);
  });

  it('finds and orders kinds by their titles as the language reads them', () => {
    const w = world();
    w.addon(pl());
    w.language('pl');
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => (page.container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click());
    const picker = page.container.querySelector('[role="dialog"]') as HTMLElement;
    expect(picker.textContent).toContain('Klaster');
  });

  it('says the shell’s words in its own name (pl:shell), and the table’s count again after a switch', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.addon(
      addon('lang-pl', ({ contributor }) => {
        contributor.add('Messages', 'pl:shell', { messages: { 'shell.nothing-here': 'Nic tu nie ma' } });
        contributor.add('Messages', 'pl:core', { messages: { 'core.kind.table.count': '{kind}: {count}' } });
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    page.act(() => void vi.advanceTimersByTime(1));
    expect(page.container.querySelector('.uk-shell-main [role="status"]')?.textContent).toBe('1 pods');
    page.act(() => w.language('pl'));
    page.act(() => void vi.advanceTimersByTime(1));
    expect(page.container.querySelector('.uk-shell-main [role="status"]')?.textContent).toBe('pods: 1');
    page.navigate('/nowhere');
    expect(page.text()).toContain('Nic tu nie ma');
    vi.useRealTimers();
  });

  it('follows the browser’s language when the page’s is the system’s', () => {
    const w = world('web');
    w.addon(pl());
    const page = renderPage(w, '/k/pods.v1');
    const was = Object.getOwnPropertyDescriptor(Navigator.prototype, 'language');
    Object.defineProperty(navigator, 'language', { value: 'pl', configurable: true });
    page.act(() => void window.dispatchEvent(new Event('languagechange')));
    expect(page.headers()[0]).toBe('Nazwa');
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    page.act(() => void window.dispatchEvent(new Event('languagechange')));
    expect(page.headers()[0]).toBe('Name');
    delete (navigator as unknown as { language?: string }).language;
    if (was) Object.defineProperty(Navigator.prototype, 'language', was);
  });

  it('refuses what is no phrase, a key that is none, and a misspelled form; a language that is none is English', () => {
    const w = world();
    const results: unknown[] = [];
    w.addon(
      addon('bad', ({ contributor }) => {
        results.push(contributor.add('Messages', 'pl:bad', { messages: { 'bad.x': { one: 'only one' } } as never }));
        results.push(contributor.add('Messages', 'pl:bad2', { messages: { Tag: 'Tag' } }));
        results.push(contributor.add('Messages', 'pl:bad3', { messages: { 'bad3.x': { other: 'x', oen: 'y' } } as never }));
      }),
    );
    expect(results.map((r) => (r as { status: string }).status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(w.user.patch('Language', 'default', { locale: 'en_US' }).status).toBe('rejected');
    expect(() => t('Tag', 'Tag')).toThrow(/label key/);
  });
});

describe('what the user is told', () => {
  it('shows an addon’s notification until it is closed', () => {
    const w = world();
    w.addon(addon('tell', (ctx) => void ctx.notify({ level: 'error', title: 'Certs', text: 'one expires today' })));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.text()).toContain('one expires today');
    expect(page.notifications().map((n) => n.text)).toEqual(['one expires today']);
    page.act(() => (page.container.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    expect([page.notifications(), page.container.querySelector('button[aria-label="Close"]')]).toEqual([[], null]);
    expect(Namespace.id).toBe('v1/Namespace');
  });
});

describe('what the one signed in may not have', () => {
  const { Service, ConfigMap } = kinds.core.v1;
  /** One who may read pods, namespaces and workloads only: no events, no logs, no services. */
  const viewer = () => {
    const w = world('web');
    w.cluster.rules({ cluster: [{ verbs: ['get', 'list', 'watch'], apiGroups: ['', 'apps'], resources: ['pods', 'namespaces', 'deployments', 'nodes'] }] });
    return w;
  };
  const tabs = () => [...document.querySelectorAll('.uk-modal [role="tab"]')].map((t) => [t.textContent, !!t.querySelector('[data-icon="denied"]')]);

  it('is not there: a kind listed nowhere, a tab it needs — hidden by the access layer, over the user’s word', async () => {
    const w = viewer();
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    await vi.waitFor(() => expect(page.links('Kinds')).toEqual(['Overview', 'Pods', 'Map', 'Deployments', 'Nodes', 'Namespaces']));
    expect(tabs()).toEqual([
      ['Overview', false],
      ['Map', false],
      ['YAML', false],
    ]);
    // Who hid it: the access layer — what the user says under it changes nothing.
    expect(w.registry.get('KindView', Service.id)?.provenanceOf(['hidden'])?.contributor).toBe('access');
    page.act(() => void w.user.patch('KindView', Service.id, { hidden: false }));
    expect(page.links('Kinds')).not.toContain('Services');
    // Allowed again (rules said anew): there again.
    page.act(() => w.cluster.rules(null));
    await vi.waitFor(() => expect(page.links('Kinds')).toContain('Services'));
    expect(tabs().map(([t]) => t)).toEqual(['Overview', 'Events', 'Logs', 'Map', 'YAML']);
  });

  it('allows a namespace’s own: a tab there, not elsewhere', async () => {
    const w = viewer();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'api', namespace: 'dev' } }));
    w.cluster.rules({
      cluster: [{ verbs: ['get', 'list', 'watch'], apiGroups: [''], resources: ['pods', 'namespaces'] }],
      namespaces: { dev: [{ verbs: ['get'], apiGroups: [''], resources: ['pods/log'] }] },
    });
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/dev/api');
    await vi.waitFor(() => expect(tabs().map(([t]) => t)).toEqual(['Overview', 'Logs', 'Map', 'YAML']));
    page.navigate('/k/pods.v1?open=pods.v1/shop/web');
    await vi.waitFor(() => expect(tabs().map(([t]) => t)).toEqual(['Overview', 'Map', 'YAML']));
  });

  it('takes a rule of one object for that object alone: its log there, not on another', async () => {
    const w = viewer();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'api', namespace: 'shop' } }));
    w.cluster.rules({
      cluster: [
        { verbs: ['get', 'list', 'watch'], apiGroups: [''], resources: ['pods', 'namespaces'] },
        { verbs: ['get'], apiGroups: [''], resources: ['pods/log'], resourceNames: ['web'] },
      ],
    });
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    await vi.waitFor(() => expect(tabs().map(([t]) => t)).toEqual(['Overview', 'Logs', 'Map', 'YAML']));
    page.navigate('/k/pods.v1?open=pods.v1/shop/api');
    await vi.waitFor(() => expect(tabs().map(([t]) => t)).toEqual(['Overview', 'Map', 'YAML']));
  });

  it('may not list the namespaces: those one uses added by name, kept as the user’s — what is had there shown, the rest hidden', async () => {
    const w = world('web');
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
    w.cluster.state(Namespace, 'denied', { status: 403, code: 'Forbidden', message: 'namespaces is forbidden' });
    w.cluster.rules({ cluster: [], namespaces: { shop: [{ verbs: ['get', 'list', 'watch'], apiGroups: [''], resources: ['pods'] }] } });
    const page = renderPage(w, '/k/pods.v1');
    const picker = () => page.container.querySelector('.uk-ms-trigger') as HTMLButtonElement;
    const typed = (text: string) => {
      const input = () => document.querySelector('.uk-ms-search input') as HTMLInputElement;
      page.act(() => void fireEvent.input(input(), { target: { value: text } }));
      page.act(() => void fireEvent.keyDown(input(), { key: 'Enter' }));
    };
    page.act(() => picker().click());
    await vi.waitFor(() => expect(document.querySelector('.uk-ms-note')?.textContent).toBe('You may not list the namespaces: add those you use.'));
    // Nothing allowed there: not added, said why.
    typed('nope');
    await vi.waitFor(() => expect(document.querySelector('.uk-ms-note')?.textContent).toBe('You may do nothing in nope: not added.'));
    typed('shop');
    await vi.waitFor(() => expect(w.user.saved().patches).toContainEqual({ kind: 'Namespaces', name: 'default', fields: { known: { shop: true } } }));
    expect(picker().textContent).toContain('shop');
    // What may be had in it, and nothing else, in the navigation.
    await vi.waitFor(() => expect(page.links('Kinds')).toEqual(['Overview', 'Pods', 'Map']));
  });

  it('marked (debugging): nothing hidden, what would be marked', async () => {
    const w = viewer();
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web', { access: 'mark' });
    await vi.waitFor(() =>
      expect(tabs()).toEqual([
        ['Overview', false],
        ['Events', true],
        ['Logs', true],
        ['Map', false],
        ['YAML', false],
      ]),
    );
    const marked = [...page.container.querySelectorAll('nav a')].filter((a) => a.querySelector('[data-icon="denied"]')).map((a) => a.textContent?.trim());
    expect(marked).toEqual(['Services', 'ConfigMaps']);
    expect(ConfigMap.id).toBe('v1/ConfigMap');
  });

  it('says a page it may not have is forbidden, in its place', async () => {
    const w = viewer();
    w.addon(
      addon('quotas', ({ contributor }) => {
        contributor.add('Page', 'quotas.page', { path: '/quotas', title: 'Quotas', needs: [{ verb: 'list', resource: 'resourcequotas' }] });
        contributor.add('Fill', 'quotas.page', fill(slots.page('quotas.page'), { render: () => <p>quotas</p> }));
      }),
    );
    const page = renderPage(w, '/quotas');
    await vi.waitFor(() => expect(page.container.querySelector('main')?.textContent).toContain('Forbidden'));
    expect([page.container.textContent?.includes('quotas'), page.links('Kinds').includes('Quotas')]).toEqual([false, false]);
    // A kind's page, by a link to it: the same.
    page.navigate('/k/services.v1');
    await vi.waitFor(() => expect(page.container.querySelector('main')?.textContent).toContain('Forbidden'));
    expect(page.container.querySelector('[role="table"]')).toBeNull();
  });
});
