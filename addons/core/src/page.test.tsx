import { kinds } from '@overkube/kube-types';
import { action, column, defineAddon, section, slots } from '@overkube/sdk';
import { useRoute } from '@overkube/sdk/preact';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderRoute } from '@overkube/testkit/preact';
import { afterEach, describe, expect, it } from 'vitest';
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
