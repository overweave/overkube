import { kinds } from '@overkube/kube-types';
import { action, column, defineAddon, PENDING, section, slots, t } from '@overkube/sdk';
import { useRoute } from '@overkube/sdk/preact';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderRoute } from '@overkube/testkit/preact';
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
  it('has every kind’s columns; an object’s name links to it', () => {
    const page = renderRoute(world('web', 'db'), '/k/pods.v1');
    expect(page.headers()).toEqual(['Name', 'Namespace', 'Age']);
    expect(page.column('Name').sort()).toEqual(['db', 'web']);
    expect(page.container.querySelector('a[href="#/k/pods.v1/shop/web"]')?.textContent).toBe('web');
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
    const page = renderRoute(w, '/k/pods.v1');
    expect(page.headers()).toEqual(['Age', 'Name', 'Node']);
    expect(page.column('Node')).toEqual(['none']);
  });

  it('says what the collection is: loading (and why), failed (with a way to try again), stale (still shown)', () => {
    const w = world('web');
    w.cluster.state(Pod, 'loading', { status: 0, code: 'network', message: 'waiting for room on a watch stream' });
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
    expect(page.column('Image')).toEqual(['']);
    const pod = w.cluster.get(Pod, 'web', 'shop');
    page.act(() => w.cluster.change(Pod, { ...(pod as object), spec: { containers: [{ name: 'a', image: 'nginx' }] } } as never));
    expect(page.column('Image')).toEqual(['nginx']);
  });

  it('says a kind the cluster does not serve, and what discovery cannot have', () => {
    expect(renderRoute(world(), '/k/things.v1.example.com').text()).toContain('The cluster serves no kind things.v1.example.com');
    const w = world();
    w.cluster.discover('error', { status: 403, code: 'Forbidden', message: 'no' });
    const page = renderRoute(w, '/k/things.v1.example.com');
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
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
  const tables = (page: ReturnType<typeof renderRoute>) => page.column('Name');

  it('keeps the last kind’s table while the next one’s objects come, then shows the next as it is', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'loading');
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    page.navigate('/k/nodes.v1');
    expect([page.current('Kinds'), page.text().includes('No nodes'), page.container.querySelectorAll('[data-skeleton]').length]).toEqual(['Nodes', true, 0]);
  });

  it('shows at once a next kind that cannot be had, and opens an object over its own kind, not the last one', () => {
    vi.useFakeTimers();
    const w = world('web');
    w.cluster.state(Deployment, 'error', { status: 403, code: 'Forbidden', message: 'no' });
    const page = renderRoute(w, '/k/pods.v1');
    page.navigate('/k/deployments.v1.apps');
    expect(page.text()).toContain('deployments cannot be had: Forbidden');
    w.cluster.state(Deployment, 'loading');
    page.navigate('/k/pods.v1');
    page.navigate('/k/deployments.v1.apps/shop/web');
    expect(page.text()).toContain('Deployment shop/web');
    expect(page.text()).not.toContain('Pod shop/web');
  });
});

describe('putting one’s own in the core’s place', () => {
  it('draws another’s page for a kind in place of the core’s table — for that kind only', () => {
    const w = world('web');
    const Mine = () => <p>my pods page</p>;
    w.addon(addon('pods', ({ contributor }) => void contributor.add('Fill', 'pods.page', { slot: slots.kind.page.name, target: { kinds: [Pod.id] }, render: Mine })));
    expect(renderRoute(w, '/k/pods.v1').text()).toContain('my pods page');
    const deployments = renderRoute(w, '/k/deployments.v1.apps');
    expect([deployments.text().includes('my pods page'), deployments.headers()]).toEqual([false, ['Name', 'Namespace', 'Age']]);
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
    expect(renderRoute(w, '/k/pods.v1').headers()).toEqual(['Age', 'Name']);
  });

  it('keeps the table as it is when an object is opened over it, and closed', () => {
    const page = renderRoute(world('web'), '/k/pods.v1');
    const table = page.container.querySelector('[role="table"]');
    page.navigate('/k/pods.v1/shop/web');
    expect(page.text()).toContain('Pod shop/web');
    expect(page.container.querySelector('[role="table"]')).toBe(table);
    page.navigate('/k/pods.v1');
    expect(page.container.querySelector('[role="table"]')).toBe(table);
  });

  it('draws a page that failed for one path again for the next', () => {
    const w = world();
    const Item = () => {
      const { params } = useRoute();
      if (params.id === 'bad') throw new Error('no such item');
      return <p>item {params.id}</p>;
    };
    w.addon(addon('items', ({ contributor }) => void contributor.add('Route', 'items.item', { path: '/items/:id', render: Item })));
    const page = renderRoute(w, '/items/bad');
    expect(page.text()).toContain('This page failed to draw');
    page.navigate('/items/good');
    expect(page.text()).toContain('item good');
  });
});

describe('an object', () => {
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
    const page = renderRoute(w, '/k/pods.v1/shop/web');
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
    const page = renderRoute(w, '/k/pods.v1/shop/web');
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
    const page = renderRoute(w, '/k/pods.v1/shop/web');
    expect(page.text()).toContain('pods cannot be had: Forbidden');
    expect(page.text()).not.toContain('There is no Pod');
  });

  it('shows another’s section in it, and the core’s YAML after', () => {
    const w = world('web');
    w.addon(addon('more', ({ contributor }) => void contributor.add('Fill', 'more.s', section({ kinds: [Pod], title: 'More', render: () => <p>more about it</p> }))));
    const text = renderRoute(w, '/k/pods.v1/shop/web').text();
    expect(text.indexOf('more about it')).toBeLessThan(text.indexOf('name: web'));
  });

  it('says so when it is not there (now)', () => {
    expect(renderRoute(world('web'), '/k/pods.v1/shop/gone').text()).toContain('There is no Pod gone');
  });
});

describe('the navigation', () => {
  it('starts at the first pinned kind; shows the pinned as tabs, the one the page is at beside them', () => {
    const page = renderRoute(world(), '/');
    expect(page.path).toBe('/k/pods.v1');
    expect(page.links('Kinds')).toEqual(['Pods', 'Deployments', 'Services', 'ConfigMaps', 'Nodes', 'Namespaces']);
    page.navigate('/k/events.v1');
    expect(page.links('Kinds').at(-1)).toBe('Events');
    expect(page.container.querySelector('.uk-navlist')).toBeNull();
  });

  it('keeps a kind gone to open as a tab till it is closed, as a browser does; closed where the page is, to its neighbour', () => {
    const page = renderRoute(world(), '/k/events.v1');
    page.navigate('/k/secrets.v1');
    page.navigate('/k/pods.v1');
    expect(page.links('Kinds').slice(-2)).toEqual(['Events', 'Secrets']);
    const close = (id: string) => page.act(() => (page.container.querySelector(`nav [data-key="${id}"] .uk-tab-close`) as HTMLElement).click());
    close('v1/Event');
    expect([page.path, page.links('Kinds').slice(-2)]).toEqual(['/k/pods.v1', ['Namespaces', 'Secrets']]);
    page.navigate('/k/secrets.v1');
    close('v1/Secret');
    expect([page.path, page.links('Kinds').includes('Secrets')]).toEqual(['/k/namespaces.v1', false]);
  });

  it('unpins a tab by its pin; moves one into the pinned (Alt and an arrow, as a drag), pinning it', async () => {
    const page = renderRoute(world(), '/k/events.v1');
    page.act(() => (page.container.querySelector('nav [data-key="apps/v1/Deployment"] .uk-tab-pin') as HTMLElement).click());
    expect(page.links('Kinds')).not.toContain('Deployments');
    const events = page.container.querySelector('nav [data-key="v1/Event"]') as HTMLElement;
    page.act(() => void events.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })));
    await vi.waitFor(() => expect(page.container.querySelector('nav [data-key="v1/Event"]')?.hasAttribute('data-transient')).toBe(false));
    expect(page.links('Kinds').at(-1)).toBe('Events');
  });

  it('opens the kinds’ picker from the tabs’ +: every kind, filtered as typed; one chosen goes there', () => {
    const page = renderRoute(world(), '/k/pods.v1');
    page.act(() => (page.container.querySelector('button[aria-label="All kinds"]') as HTMLButtonElement).click());
    const picker = () => page.container.querySelector('[role="dialog"][aria-label="All kinds"]');
    expect(picker()?.textContent).toContain('StorageClasses');
    page.act(() => ((picker() as Element).querySelector('a[href="#/k/storageclasses.v1.storage.k8s.io"]') as HTMLAnchorElement).click());
    expect(page.path).toBe('/k/storageclasses.v1.storage.k8s.io');
  });

  it('opens an object from its name in the table', () => {
    const page = renderRoute(world('web'), '/k/pods.v1');
    page.act(() => (page.container.querySelector('a[href="#/k/pods.v1/shop/web"]') as HTMLAnchorElement).click());
    expect(page.path).toBe('/k/pods.v1/shop/web');
    expect(page.text()).toContain('Pod shop/web');
  });

  it('shows the menu instead once the user says so (the NavView): every group', () => {
    const w = world();
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
    user.patch('NavView', 'default', { mode: 'side' });
    const page = renderRoute(w, '/k/nodes.v1');
    expect(page.container.querySelector('.uk-tabs')).toBeNull();
    const groups = [...page.container.querySelectorAll('.uk-navlist-group')].map((g) => g.textContent);
    expect(groups.slice(0, 5)).toEqual(['Workloads', 'Network', 'Config', 'Storage', 'Cluster']);
    expect(page.container.querySelector('[aria-current="page"]')?.textContent).toBe('Nodes');
    expect(page.container.querySelector(`a[href="#/k/${'namespaces.v1'}"]`)).not.toBeNull();
    expect(Node.id).toBe('v1/Node');
  });

  it('draws another addon’s page at its path — its own pages under it — and lists it with the rest', () => {
    const w = world();
    const Certs = () => <p>certs at {useRoute().rest || '/'}</p>;
    w.addon(addon('certs', ({ contributor }) => void contributor.add('Route', 'certs.page', { path: '/certs/*', title: 'Certificates', render: Certs })));
    w.as('user', { priority: 1000, rights: ['configure'] }).patch('NavView', 'default', { mode: 'side' });
    const page = renderRoute(w, '/certs/expiring');
    expect(page.text()).toContain('certs at /expiring');
    expect(page.container.querySelector('a[href="#/certs"]')?.textContent).toBe('Certificates');
  });

  it('says so when nothing is at a path', () => {
    expect(renderRoute(world(), '/nowhere').text()).toContain('No page at /nowhere');
  });
});

describe('how it looks', () => {
  /** The frame's root: where the theme's tokens are set (the page's .uk-root; here, the frame). */
  const root = (page: ReturnType<typeof renderRoute>) => page.container.querySelector('.uk-root') as HTMLElement;

  it('takes the theme the user chooses — an addon’s — in the variant asked for; the kit’s own under it', () => {
    const w = world();
    w.addon(addon('nord', ({ contributor }) => void contributor.add('Theme', 'nord', { title: 'Nord', dark: { accent: '#88c0d0' }, light: { accent: '#5e81ac', bg: '#eceff4' } })));
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
    expect(root(page).style.getPropertyValue('--uk-accent')).toBe('rebeccapurple');
    // A theme is behaviour to add: the user changes one, makes none.
    // @ts-expect-error adding a Theme is behaviour
    expect(user.add('Theme', 'mine', { title: 'Mine' }).status).toBe('rejected');
  });
});

describe('a theme, further', () => {
  const root = (page: ReturnType<typeof renderRoute>) => page.container.querySelector('.uk-root') as HTMLElement;

  it('keeps a theme’s corners and fonts in both variants; a patch of one variant keeps the other’s colours', () => {
    const w = world();
    w.addon(addon('square', ({ contributor }) => void contributor.add('Theme', 'square', { title: 'Square', dark: { radius: '0', accent: 'red' } })));
    const user = w.as('user', { priority: 1000, rights: ['configure'] });
    user.patch('Appearance', 'default', { theme: 'square', mode: 'light' });
    user.patch('Theme', 'square', { light: { accent: 'blue' } });
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/nodes.v1');
    expect(page.headers()).toEqual(['Nazwa', 'Namespace', 'Age']);
    expect(page.links('Rodzaje')).toContain('Nodes');
    expect((page.container.querySelector('.uk-root') as HTMLElement).lang).toBe('pl');
  });

  it('switches at once: a language set, a translation added, the user’s rewording of one phrase (English’s too)', () => {
    const w = world('web');
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
        contributor.add('Messages', 'pl:core', { messages: { 'core.table.count': '{kind}: {count}' } });
      }),
    );
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
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
    const page = renderRoute(w, '/k/pods.v1');
    expect(page.text()).toContain('one expires today');
    expect(page.notifications().map((n) => n.text)).toEqual(['one expires today']);
    page.act(() => (page.container.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
    expect([page.notifications(), page.container.querySelector('button[aria-label="Close"]')]).toEqual([[], null]);
    expect(Namespace.id).toBe('v1/Namespace');
  });
});
