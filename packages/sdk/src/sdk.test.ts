import type { CollectionView } from '@overkube/client';
import { type KindInfo, kinds } from '@overkube/kube-types';
import { assertContributions, assertResult, assertSays, cleanup, uiWorld } from '@overweave/testkit';
import { mount, renderSlot } from '@overweave/testkit/preact';
import { signal } from '@preact/signals';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { action, type Cluster, column, defineAddon, kindMatcher, kubeOwnKinds, parseSlot, section, slots, standingOf, takes, tile, ui } from './index.ts';
import { KubeProvider, useCollection } from './preact/index.ts';

/*
 * The SDK as an addon meets it: the dashboard's kinds layered by overweave
 * (who may say what), fills chosen by the kinds they are for, the usual
 * definitions typed by their kinds, an addon defined and run at its layer,
 * a kind's objects held while a component is drawn.
 */

afterEach(cleanup);

const { Pod } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

/** A world of the dashboard's kinds; its contributors at their layers. */
function dashboard() {
  const w = uiWorld(ui, ...kubeOwnKinds);
  const core = w.as('core', standingOf('core'));
  const builtin = w.as('kubernetes', standingOf('builtin'));
  const user = w.as('user', standingOf('user'));
  return { w, core, builtin, user };
}

describe('the kinds, layered', () => {
  it('a kind’s view: the core’s, an addon’s health over it, the user’s title over both — the user says nothing of what it does', () => {
    const { w, core, builtin, user } = dashboard();
    core.add('KindView', Pod.id, { title: 'pods', category: 'workloads' });
    assertResult(builtin.patch('KindView', Pod.id, { title: 'Pods', icon: 'box', health: () => ({ level: 'ok' }) }), 'included');
    assertResult(user.patch('KindView', Pod.id, { title: 'My pods' }), 'included');
    assertResult(user.patch('KindView', Pod.id, { health: () => undefined } as never), 'rejected', ['noRight']);
    assertSays(w, 'KindView', Pod.id, ['title'], 'user');
    assertSays(w, 'KindView', Pod.id, ['icon'], 'kubernetes');
    expect(w.get('KindView', Pod.id)?.spec.category).toBe('workloads');
  });

  it('a table’s widths and hidden columns merge key by key; a page’s regions item by item', () => {
    const { w, core, builtin, user } = dashboard();
    core.add('TableView', Pod.id, {});
    builtin.patch('TableView', Pod.id, { widths: { name: 200, age: 80 }, hidden: { node: true } });
    user.patch('TableView', Pod.id, { widths: { age: 60 }, hidden: { node: false } });
    expect(w.get('TableView', Pod.id)?.spec).toMatchObject({ widths: { name: 200, age: 60 }, hidden: { node: false } });
    core.add('Page', 'overview', { title: 'Overview', regions: [{ name: 'main' }, { name: 'side' }] });
    builtin.patch('Page', 'overview', { regions: [{ name: 'side', title: 'At a glance' }] });
    expect(w.get('Page', 'overview')?.spec.regions).toEqual([{ name: 'main' }, { name: 'side', title: 'At a glance' }]);
  });
});

describe('who may add what', () => {
  it('the user adds nothing that does anything, nor moves what does to other kinds — it arranges', () => {
    const { builtin, user } = dashboard();
    const name = column({ kinds: [Pod], header: 'Node', value: (p) => p.spec?.nodeName });
    const restart = action({ kinds: [Pod], title: 'Restart', run: () => {} });
    assertResult(builtin.add('Column', 'pods.node', name), 'included');
    assertResult(builtin.add('Action', 'pods.restart', restart), 'included');
    assertResult(builtin.add('Fill', 'pods.f', section({ kinds: [Pod], render: () => null })), 'included');
    const u = user as unknown as {
      add(kind: string, name: string, spec: object): ReturnType<typeof builtin.add>;
      patch(kind: string, name: string, spec: object): ReturnType<typeof builtin.add>;
    };
    for (const [kind, spec] of [
      ['Column', name],
      ['Action', restart],
      ['Fill', section({ render: () => null })],
      ['Wrap', { wraps: 'pods.f', render: () => null }],
      ['KindView', { title: 'Mine', health: () => undefined }],
      ['TableView', { filter: () => false }],
    ] as const)
      assertResult(u.add(kind, `mine.${kind}`, spec), 'rejected', ['noRight']);
    for (const kind of ['Column', 'Action'] as const) assertResult(u.patch(kind, `pods.${kind === 'Column' ? 'node' : 'restart'}`, { target: {} }), 'rejected', ['noRight']);
    assertResult(u.patch('Fill', 'pods.f', { target: {} }), 'rejected', ['noRight']);
    // What only looks: its own.
    assertResult(user.add('Category', 'mine', { title: 'Mine' }), 'included');
    assertResult(user.patch('Column', 'pods.node', { header: 'Where', width: 120 }), 'included');
  });

  it('checks the fields’ values: what would only break when drawn is refused when said', () => {
    const { builtin } = dashboard();
    const b = builtin as unknown as { add(kind: string, name: string, spec: object): ReturnType<typeof builtin.add> };
    assertResult(b.add('Column', 'c1', { target: { kinds: 'apps/v1/Deployment' }, header: 'h', value: () => 1 }), 'rejected', ['invalid']);
    assertResult(b.add('Column', 'c2', { target: {}, header: 'h', value: 3 }), 'rejected', ['invalid']);
    assertResult(b.add('Column', 'c3', { target: {}, header: 'h', value: () => 1, width: Number.NaN }), 'rejected', ['invalid']);
    assertResult(b.add('TableView', Pod.id, { widths: { name: 'wide' } }), 'rejected', ['invalid']);
    assertResult(b.add('TableView', Deployment.id, { sort: { column: 'age', descending: 'yes' } }), 'rejected', ['invalid']);
    assertResult(b.add('Action', 'a1', { target: {}, title: 't', run: 'go' }), 'rejected', ['invalid']);
    assertResult(b.add('Page', 'p1', { title: 'P', regions: [{ name: 'a:b' }] }), 'rejected', ['invalid']);
    assertResult(b.add('KindView', Pod.id, { title: 'Pods', health: 'ok' }), 'rejected', ['invalid']);
  });
});

describe('fills chosen by their kinds', () => {
  it('draws in an object’s view only the sections for its kind', () => {
    const { w, builtin } = dashboard();
    builtin.add(
      'Fill',
      'pods.containers',
      section({ kinds: [Pod], title: 'Containers', order: 1, render: ({ object }) => h('i', null, `containers of ${object.metadata?.name}`) }),
    );
    builtin.add('Fill', 'any.labels', section({ title: 'Labels', order: 2, render: () => h('b', null, 'labels') }));
    const pod = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'web' } };
    const deployment = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'web' } };
    expect(renderSlot(w, slots.object.sections, { kind: Pod, object: pod }, { matcher: kindMatcher }).text()).toBe('containers of weblabels');
    expect(renderSlot(w, slots.object.sections, { kind: Deployment, object: deployment }, { matcher: kindMatcher }).text()).toBe('labels');
  });

  it('puts a tile on a page’s region', () => {
    const { w, builtin } = dashboard();
    builtin.add('Fill', 'kubernetes.nodes', tile('overview', 'main', { title: 'Nodes', render: () => h('p', null, '3 nodes') }));
    expect(renderSlot(w, slots.page('overview', 'main'), {}).text()).toBe('3 nodes');
  });
});

describe('the usual definitions', () => {
  it('a column and an action, for some kinds: their functions typed by the kind', () => {
    const node = column({ kinds: [Pod], header: 'Node', value: (pod) => pod.spec?.nodeName });
    expect(node).toMatchObject({ target: { kinds: ['v1/Pod'] }, header: 'Node' });
    expect(node.value({ apiVersion: 'v1', kind: 'Pod', spec: { nodeName: 'n1', containers: [] } })).toBe('n1');
    const restart = action({ kinds: [Deployment], title: 'Restart', dangerous: true, run: (d) => d.spec?.replicas });
    expect(restart.target).toEqual({ kinds: ['apps/v1/Deployment'] });
    // @ts-expect-error a Pod has no replicas
    column({ kinds: [Pod], header: 'Replicas', value: (pod) => pod.spec?.replicas });
    const any = column({ header: 'Name', value: (o) => o.metadata?.name });
    expect(any.target).toEqual({});
    const either = column({ kinds: [Pod, Deployment], header: 'Kind', value: (o) => (o.spec && 'containers' in o.spec ? o.spec.nodeName : o.spec?.replicas) });
    expect(either.target).toEqual({ kinds: ['v1/Pod', 'apps/v1/Deployment'] });
  });

  it('a function typed for some kinds is for those kinds only: said, never left out', () => {
    // @ts-expect-error typed for Pods, it says it is
    column<readonly [typeof Pod]>({ header: 'Node', value: (pod) => pod.spec?.nodeName });
    // @ts-expect-error the same of an action
    action<readonly [typeof Pod]>({ title: 'Go', run: (pod) => pod.spec?.nodeName });
    // An empty list: for no kind (not every one).
    const none = column({ kinds: [], header: 'None', value: () => 1 });
    expect([takes(none.target, Pod), takes(column({ header: 'All', value: () => 1 }).target, Pod)]).toEqual([false, true]);
  });

  it('a page’s region is a slot whose name reads back; names with ":" are refused', () => {
    expect(parseSlot(slots.page('overview', 'main').name)).toEqual({ page: 'overview', region: 'main' });
    expect(() => slots.page('a:b', 'c')).toThrow(/no ":"/);
    expect(() => slots.page('a', '')).toThrow(/not empty/);
  });
});

describe('an addon', () => {
  it('is checked when defined, and stands at its layer', () => {
    expect(() => defineAddon({ id: 'Bad Id', title: 'x', setup() {} })).toThrow(/lower-case/);
    expect(() => defineAddon({ id: 'user', title: 'x', setup() {} })).toThrow(/the page's own/);
    expect(() => defineAddon({ id: 'a', title: 'x', layer: 'kernel' as never, setup() {} })).toThrow(/no layer kernel/);
    expect(() => defineAddon({ id: 'a', title: 'x', requires: { serves: 'x' } as never, setup() {} })).toThrow(/no field serves/);
    expect(() => defineAddon({ id: 'a', title: 'x', provides: { frame: 42 as never }, setup() {} })).toThrow(/provides frame/);
    expect(defineAddon({ id: 'a', title: 'x', requires: { served: '' }, async setup() {} }).id).toBe('a');
    expect(standingOf()).toEqual({ priority: 200, rights: ['configure', 'behaviour'] });
    expect(standingOf('core').priority).toBe(0);
    expect(standingOf('user')).toEqual({ priority: 1000, rights: ['configure'] });
  });

  it('runs at its layer: what it says is its own, taken back when it stops', () => {
    const { w, core } = dashboard();
    core.add('KindView', Pod.id, { title: 'pods' });
    const images = defineAddon({
      id: 'images',
      title: 'Images',
      setup(ctx) {
        ctx.contributor.add('Column', 'images.tag', column({ kinds: [Pod], header: 'Tag', value: () => 'latest' }));
        ctx.contributor.patch('KindView', Pod.id, { icon: 'box' });
      },
    });
    const run = w.run(images.id, (contributor) => images.setup({ contributor } as never), standingOf(images.layer));
    assertContributions(w, 'images', [
      { kind: 'Column', name: 'images.tag', operation: 'add', status: 'included' },
      { kind: 'KindView', name: Pod.id, operation: 'patch', status: 'included' },
    ]);
    run.stop();
    expect(w.get('Column', 'images.tag')).toBeUndefined();
    expect(w.get('KindView', Pod.id)?.spec.icon).toBeUndefined();
  });
});

describe('a kind’s objects in a component', () => {
  /** A cluster that only counts what is held. */
  function fakeCluster() {
    const held: string[] = [];
    const view = { kind: Pod, items: signal(new Map()), state: signal('live'), error: signal(null), retry() {} } as unknown as CollectionView;
    const cluster = {
      peek: () => view,
      hold(kind: KindInfo) {
        held.push(kind.id);
        return () => held.splice(held.indexOf(kind.id), 1);
      },
    } as unknown as Cluster;
    return { cluster, held };
  }

  it('holds the kind while it is drawn, and lets it go after', () => {
    const { w } = dashboard();
    const { cluster, held } = fakeCluster();
    const Pods = () => h('span', null, useCollection(Pod).state.value);
    const view = mount(w, h(KubeProvider, { cluster }, h(Pods, null)));
    expect([view.text(), held]).toEqual(['live', ['v1/Pod']]);
    view.unmount();
    expect(held).toEqual([]);
  });

  it('says so when no cluster is given', () => {
    const { w } = dashboard();
    const Pods = () => h('span', null, useCollection(Pod).state.value);
    expect(() => mount(w, h(Pods, null))).toThrow(/no KubeProvider/);
  });
});
