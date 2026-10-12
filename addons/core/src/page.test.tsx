import { kinds } from '@overkube/kube-types';
import { action, type ColumnRenderProps, column, defineAddon, forKinds, menuItem, type NavTabProps, type PageProps, PENDING, section, slots, t, wrap } from '@overkube/sdk';
import { KindTable, usePageProps } from '@overkube/sdk/preact';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { LEAVE_MS, PEEK_MS, TabButton } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import core from './index.tsx';

/*
 * The page the core draws, as its user sees it — over the testkit's world,
 * as any addon's author would test theirs beside it: a kind's table (its
 * columns, as others set them out; its states; a failure its owner's), an
 * object opened over it and its actions, the navigation (tabs; the menu
 * instead), the start, another addon's page, what the user is told.
 */

afterEach(cleanup);

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
          wrap<ColumnRenderProps>('core.name', {
            kinds: [Pod],
            when: ({ object }) => object.metadata?.name === 'web',
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
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Age?']);
    expect(page.column('Name').sort()).toEqual(['! web', 'db']);
    expect(page.container.querySelector('.count')?.textContent).toBe('2/2 live');
    page.act(() => w.cluster.state(Pod, 'stale', { status: 0, code: 'network', message: 'lost' }));
    expect(page.container.querySelector('.count')?.textContent).toBe('2/2 stale network');
    page.navigate('/k/nodes.v1');
    expect(page.container.querySelector('.none')?.textContent).toBe('No nodes yet — join one');
    page.navigate('/k/namespaces.v1');
    expect(page.text()).toContain('No namespaces');
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

  it('has every kind’s columns; an object’s name links to it', () => {
    const page = renderPage(world('web', 'db'), '/k/pods.v1');
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Age']);
    expect(page.column('Name').sort()).toEqual(['db', 'web']);
    expect(page.container.querySelector('a[href="#/k/pods.v1?open=pods.v1/shop/web"]')?.textContent).toBe('web');
  });

  it('sets out another addon’s columns as the kind’s TableView says, over the core’s', () => {
    const w = world('web');
    w.addon(
      addon('images', ({ contributor }) => {
        contributor.add('Column', 'images.node', column({ kinds: [Pod], header: 'Node', order: 20, value: (p) => p.spec?.nodeName ?? 'none' }));
        contributor.add('Column', 'images.replicas', column({ kinds: [Deployment], header: 'Replicas', value: (d) => d.spec?.replicas }));
        contributor.patch('TableView', Pod.id, { columns: ['core.age'], hidden: { 'core.namespace': true } });
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers()).toEqual(['Age', 'Name', 'Node']);
    expect(page.column('Node')).toEqual(['none']);
  });

  it('says what the collection is: loading (and why), failed (with a way to try again), stale (still shown)', () => {
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
    w.addon(addon('big', ({ contributor }) => void contributor.add('Column', 'big.n', column({ header: 'Big', value: () => ({ n: 1n }) }))));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Name').sort()).toEqual(['a', 'b', 'c']);
    await expect.poll(() => page.failures.length).toBe(1);
    expect(page.failures[0]).toMatchObject({ definition: { kind: 'Column', name: 'big.n' }, field: 'value' });
  });

  it('draws a render that failed again once its object changes', () => {
    const w = world('web');
    w.addon(
      addon('image', ({ contributor }) => {
        contributor.add(
          'Column',
          'image.c',
          column({
            kinds: [Pod],
            header: 'Image',
            value: (p) => p.spec?.containers?.[0]?.image,
            render: ({ value }) => {
              if (!value) throw new Error('no image yet');
              return <b>{String(value)}</b>;
            },
          }),
        );
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Image')).toEqual(['']);
    const pod = w.cluster.get(Pod, 'web', 'shop');
    page.act(() => w.cluster.change(Pod, { ...(pod as object), spec: { containers: [{ name: 'a', image: 'nginx' }] } } as never));
    expect(page.column('Image')).toEqual(['nginx']);
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
    w.addon(addon('images', ({ contributor }) => void contributor.add('Column', 'images.image', column({ kinds: [Pod], header: 'Image', order: 20, value: () => 'nginx' }))));
    w.cluster.state(Pod, 'loading');
    const page = renderPage(w, '/k/pods.v1');
    const table = page.container.querySelector('[role="table"]');
    expect([page.headers(), table?.getAttribute('aria-busy'), page.container.querySelectorAll('[data-skeleton]').length]).toEqual([
      ['Name', 'Namespace', 'Image', 'Age'],
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

  it('shows a cell whose value is not there yet waiting, sorts it last either way, and sorts it again once it comes', () => {
    const w = world('a', 'b', 'c');
    const cpu = signal<Record<string, number>>({ a: 30, c: 10 });
    w.addon(
      addon('metrics', ({ contributor }) => {
        contributor.add('Column', 'metrics.cpu', column({ kinds: [Pod], header: 'CPU', value: (p) => cpu.value[p.metadata?.name ?? ''] ?? PENDING }));
        contributor.patch('TableView', Pod.id, { sort: { column: 'metrics.cpu' } });
      }),
    );
    const page = renderPage(w, '/k/pods.v1');
    expect([page.column('Name'), page.column('CPU')]).toEqual([
      ['c', 'a', 'b'],
      ['10', '30', 'Loading'],
    ]);
    page.act(() => {
      cpu.value = { ...cpu.value, b: 1 };
    });
    expect(page.column('Name')).toEqual(['b', 'c', 'a']);
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
    expect(page.text()).toContain('Deployment shop/web');
    expect(page.text()).not.toContain('Pod shop/web');
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
    expect([deployments.text().includes('my pods page'), deployments.headers()]).toEqual([false, ['Name', 'Namespace', 'Age']]);
    expect(deployments.container.querySelector('main')?.textContent?.endsWith('a note')).toBe(true);
  });

  it('shows the objects a KindTable’s own filter throws on, told once as that table’s filter', async () => {
    const w = world('web', 'db');
    const odd = (o: { metadata?: { name?: string } }) => {
      if (o.metadata?.name === 'db') throw new Error('no');
      return true;
    };
    w.addon(addon('pods', ({ contributor }) => void contributor.add('Wrap', 'pods.page', { wraps: 'core.page.kind.table', render: () => <KindTable kind={Pod} filter={odd} /> })));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.column('Name').sort()).toEqual(['db', 'web']);
    await vi.waitFor(() => expect(page.failures.map((f) => `${f.definition.kind}/${f.definition.name}:${f.field}`)).toEqual(['KindTable/v1/Pod:filter']));
  });

  it('lets the user put first what they want in a slot the core declared', () => {
    const w = world();
    w.addon(
      addon('more', ({ contributor }) => void contributor.add('Fill', 'more.find', fill(slots.nav.tabs.actions, { render: () => <TabButton icon="search" label="Find" /> }))),
    );
    const labels = (page: ReturnType<typeof renderPage>) => [...page.container.querySelectorAll('nav button[aria-label]')].map((b) => b.getAttribute('aria-label'));
    expect(labels(renderPage(w, '/k/pods.v1'))).toEqual(['All kinds', 'Find']);
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('Slot', slots.nav.tabs.actions.name, { arrangement: ['more.find'] });
    expect(labels(renderPage(w, '/k/pods.v1'))).toEqual(['Find', 'All kinds']);
  });

  it('declares every slot the SDK names (and its pages’): what the user arranges in them waits for nothing', () => {
    const w = world();
    const named = (tree: object): string[] =>
      Object.values(tree).flatMap((v) => (v && typeof v === 'object' ? [...(typeof v.name === 'string' ? [v.name] : []), ...named(v)] : []));
    const all = [...named(slots), slots.page('home').name, slots.page('kind').name];
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
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('Slot', slots.nav.tabs.actions.name, { hidden: { 'core.nav.tabs.picker': true } });
    expect(renderPage(w, '/k/pods.v1').container.querySelector('button[aria-label="All kinds"]')).toBeNull();
  });

  it('draws as many of a kind’s tables as one wants (KindTable), each its own objects and title — or another’s table in the core’s place', () => {
    const w = world('web', 'db', 'cache');
    const Two = () => (
      <>
        <KindTable kind={Pod} title="Web" filter={(o) => o.metadata?.name === 'web'} />
        <KindTable kind={Pod} title="Others" filter={(o) => o.metadata?.name !== 'web'} />
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
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('TableView', Pod.id, { hidden: { 'core.namespace': true } });
    expect(result).toMatchObject({ status: 'included' });
    expect(renderPage(w, '/k/pods.v1').headers()).toEqual(['Age', 'Name']);
  });

  it('keeps the table as it is when an object is opened over it, and closed', () => {
    const page = renderPage(world('web'), '/k/pods.v1');
    const table = page.container.querySelector('[role="table"]');
    page.navigate('/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('Pod shop/web');
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
    expect(title.textContent).toBe('Pod shop/web · Running');
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

  it('opens over its kind’s table: its sections (the YAML last), its actions; a dangerous one asks first', async () => {
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
    expect(page.text()).toContain('Pod shop/web');
    expect(page.text()).toContain('name: web');
    const button = (text: string) => [...page.container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
    expect(button('Scale')).toBeUndefined();
    page.act(() => button('Restart').click());
    expect([restarted, button('Restart').textContent]).toEqual([[], 'Restart: sure?']);
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
    expect(button().textContent).toBe('Delete: sure?');
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

  it('shows another’s section in it, and the core’s YAML after', () => {
    const w = world('web');
    w.addon(addon('more', ({ contributor }) => void contributor.add('Fill', 'more.s', section({ kinds: [Pod], title: 'More', render: () => <p>more about it</p> }))));
    const text = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web').text();
    expect(text.indexOf('more about it')).toBeLessThan(text.indexOf('name: web'));
  });

  it('says so when it is not there (now)', () => {
    expect(renderPage(world('web'), '/k/pods.v1?open=pods.v1/shop/gone').text()).toContain('There is no Pod gone');
  });
});

describe('the navigation', () => {
  it('starts at the first pinned kind; shows the pinned as tabs, the one the page is at beside them', () => {
    const page = renderPage(world(), '/');
    expect(page.path).toBe('/k/pods.v1');
    expect(page.links('Kinds')).toEqual(['Pods', 'Deployments', 'Services', 'ConfigMaps', 'Nodes', 'Namespaces']);
    page.navigate('/k/events.v1');
    expect(page.links('Kinds').at(-1)).toBe('Events');
    expect(page.container.querySelector('.uk-rail')).toBeNull();
  });

  it('stays at the start once another puts something on it: a page of its own', () => {
    const w = world();
    w.addon(addon('home', ({ contributor }) => void contributor.add('Fill', 'home.welcome', { slot: slots.page('home').name, render: () => <p>welcome</p> })));
    const page = renderPage(w, '/');
    expect([page.path, page.container.querySelector('main')?.textContent]).toEqual(['/', 'welcome']);
  });

  it('says a page nothing is on is empty: the start, its redirect hidden by the user', () => {
    const w = world();
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('Slot', slots.page('home').name, { hidden: { 'core.page.home': true } });
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
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
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

  it('has a tab’s menu (a right click, Shift+F10): pin, unpin, close — as the tab is; Shift and a right click: the browser’s', async () => {
    const page = renderPage(world(), '/k/events.v1');
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
    expect([...page.container.querySelectorAll('.uk-tabs > button')].map((b) => b.getAttribute('aria-label'))).toEqual(['All kinds', 'More']);
    cleanup();
    const replaced = world();
    replaced.addon(
      addon('mine', ({ contributor }) => void contributor.add('Wrap', 'mine.picker', { wraps: 'core.nav.tabs.picker', render: () => <TabButton icon="search" label="Find" /> })),
    );
    const other = renderPage(replaced, '/k/pods.v1');
    expect([...other.container.querySelectorAll('.uk-tabs > button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Find']);
  });

  it('draws the picker through its slots: beside its search, above its groups, after an item’s title (for some kinds); or another’s picker whole', () => {
    const open = (page: ReturnType<typeof renderPage>) => page.act(() => (page.container.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement).click());
    const picker = () => document.querySelector('[role="dialog"][aria-label="All kinds"]') as HTMLElement;
    const added = world();
    added.addon(
      addon('more', ({ contributor }) => {
        contributor.add('Fill', 'more.toggle', { slot: slots.nav.picker.header.name, after: 'core.nav.picker.search', render: () => <button type="button">only served</button> });
        contributor.add('Fill', 'more.recent', { slot: slots.nav.picker.content.name, order: 100, render: () => <p class="recent">Recent</p> });
        contributor.add('Fill', 'more.count', fill(slots.nav.picker.item.content, { after: 'core.nav.picker.item.title', target: forKinds(Pod), render: () => <b> 3</b> }));
      }),
    );
    const page = renderPage(added, '/k/pods.v1');
    open(page);
    expect(picker().querySelector('.uk-catalog-top')?.textContent).toBe('only served');
    const said = picker().textContent ?? '';
    expect(said.indexOf('Recent')).toBeLessThan(said.indexOf('Workloads'));
    expect(picker().querySelector('a[href="#/k/pods.v1"]')?.textContent).toBe('Pods 3');
    expect(picker().querySelector('a[href="#/k/deployments.v1.apps"]')?.textContent).toBe('Deployments');
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

  it('opens the kinds’ picker from the tabs’ +: every kind, filtered as typed; one chosen goes there', () => {
    const page = renderPage(world(), '/k/pods.v1');
    page.act(() => (page.container.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement).click());
    const picker = () => page.container.querySelector('[role="dialog"][aria-label="All kinds"]');
    expect(picker()?.textContent).toContain('StorageClasses');
    page.act(() => ((picker() as Element).querySelector('a[href="#/k/storageclasses.v1.storage.k8s.io"]') as HTMLAnchorElement).click());
    expect(page.path).toBe('/k/storageclasses.v1.storage.k8s.io');
  });

  it('opens an object from its name in the table', () => {
    const page = renderPage(world('web'), '/k/pods.v1');
    page.act(() => (page.container.querySelector('a[href="#/k/pods.v1?open=pods.v1/shop/web"]') as HTMLAnchorElement).click());
    expect(page.path).toBe('/k/pods.v1?open=pods.v1/shop/web');
    expect(page.text()).toContain('Pod shop/web');
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
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
    user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/k/nodes.v1');
    const rail = page.container.querySelector('aside.uk-rail') as HTMLElement;
    const tabs = [...rail.querySelectorAll('[data-tab]')];
    // One strip (down the side, none across the top); each tab its mark — the usual kinds' icons — and its name, its tooltip saying both.
    expect([page.container.querySelectorAll('nav.uk-tabs').length, rail.dataset.state, tabs.every((t) => t.querySelector('.uk-tab-mark svg'))]).toEqual([1, 'collapsed', true]);
    const current = rail.querySelector('[aria-current="page"]') as HTMLElement;
    expect([current.querySelector('.uk-tab-label')?.textContent, current.title, seen.at(-1)]).toEqual(['Nodes', 'Nodes · v1/Node', 'side true']);
    page.act(() => (rail.querySelector('.uk-rail-pin') as HTMLButtonElement).click());
    expect([rail.dataset.state, seen.at(-1)]).toEqual(['pinned', 'side false']);
    const pinned = world();
    pinned.as('user', { priority: 1000, rights: ['configure'] }).patch('NavView', 'default', { mode: 'side', side: 'pinned' });
    expect(renderPage(pinned, '/k/nodes.v1').container.querySelector('aside.uk-rail')?.getAttribute('data-state')).toBe('pinned');
  });

  it('opens the picker from the side beside the rail (its flyout, its whole height), the rail wide with it; closed by Escape, focus back on the +', () => {
    const w = world();
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('NavView', 'default', { mode: 'side' });
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
    expect(picker.textContent).toContain('StatefulSets');
    page.act(() => void picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect([add.getAttribute('aria-expanded'), document.activeElement]).toEqual(['false', add]);
  });

  it('keeps the side rail open while a tab’s menu is, collapsing once it closes', async () => {
    vi.useFakeTimers();
    const w = world();
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('NavView', 'default', { mode: 'side' });
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
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('NavView', 'default', { mode: 'side' });
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
    const close = (page: ReturnType<typeof renderPage>) => page.act(() => (page.container.querySelector('dialog button[aria-label="Close"]') as HTMLButtonElement).click());
    const page = renderPage(w, '/k/pods.v1');
    page.navigate('/certs');
    page.act(() => (page.container.querySelector('a[href="#/certs?open=pods.v1/shop/web"]') as HTMLAnchorElement).click());
    expect([page.path, page.text().includes('Pod shop/web'), page.container.querySelectorAll('[role="table"]').length]).toEqual(['/certs?open=pods.v1/shop/web', true, 1]);
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
    page.act(() => (page.container.querySelector('dialog button[aria-label="Close"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(page.path).toBe('/k/pods.v1'));
    page.back();
    expect(page.path).toBe('/k/pods.v1?open=pods.v1/shop/web');
    const nowhere = renderPage(w, '/nowhere?open=pods.v1/shop/web');
    expect([nowhere.text().includes('No page at /nowhere'), nowhere.text().includes('Pod shop/web')]).toEqual([true, true]);
  });

  it('opens nothing it cannot — a kind not served, a scope not the kind’s — and says so', () => {
    for (const path of ['/k/pods.v1?open=things.v1.example.com/shop/x', '/k/pods.v1?open=pods.v1/web', '/k/pods.v1?open=nodes.v1/shop/n1']) {
      const page = renderPage(world('web'), path);
      expect([page.path, page.container.querySelector('dialog'), page.notifications().map((n) => n.text)]).toEqual([
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
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
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
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
    user.patch('Appearance', 'default', { mode: 'dark' });
    user.patch('Theme', 'default', { dark: { accent: 'rebeccapurple' } });
    const page = renderPage(w, '/k/pods.v1');
    expect(root(page).style.getPropertyValue('--uk-accent')).toBe('rebeccapurple');
    // A theme is behaviour to add: the user changes one, makes none.
    // @ts-expect-error adding a Theme is behaviour
    expect(user.add('Theme', 'mine', { title: 'Mine' }).status).toBe('rejected');
  });
});

describe('a theme, further', () => {
  const root = (page: ReturnType<typeof renderPage>) => page.container.querySelector('.uk-root') as HTMLElement;

  it('keeps a theme’s corners and fonts in both variants; a patch of one variant keeps the other’s colours', () => {
    const w = world();
    w.addon(addon('square', ({ contributor }) => void contributor.add('Theme', 'square', { title: 'Square', dark: { radius: '0', accent: 'red' } })));
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
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
    const page = renderPage(w, '/k/nodes.v1');
    expect(page.headers()).toEqual(['Nazwa', 'Namespace', 'Age']);
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
    page.act(() => void w.as('user', { priority: 1000, rights: ['configure'] }).patch('Messages', 'pt:core', { messages: { 'core.column.name': 'Nominho' } }));
    expect(page.headers()[0]).toBe('Nominho');
    page.act(() => {
      w.language('en');
      w.as('user', { priority: 1000, rights: ['configure'] }).patch('Messages', 'en:core', { messages: { 'core.column.age': 'Created' } });
    });
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Created']);
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
    expect(w.as('user', { priority: 1000, rights: ['configure'] }).patch('Language', 'default', { locale: 'en_US' }).status).toBe('rejected');
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
