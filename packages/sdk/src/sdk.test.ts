import { type KubeObject, kinds } from '@overkube/kube-types';
import { memorySource } from '@overkube/source';
import { assertContributions, assertResult, assertSays, cleanup, uiWorld } from '@overweave/testkit';
import { mount, renderSlot } from '@overweave/testkit/preact';
import { signal } from '@preact/signals';
import { h } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accessOf,
  action,
  type Cluster,
  type Ctx,
  column,
  defineAddon,
  kindMatcher,
  kubeOwnKinds,
  lazySetup,
  loadOf,
  reachOver,
  section,
  slots,
  standingOf,
  takes,
  tile,
  ui,
  wrap,
} from './index.ts';
import { KubeProvider, useList } from './preact/index.ts';

/*
 * The SDK as an addon meets it: the dashboard's kinds layered by overweave
 * (who may say what), fills chosen by the kinds they are for, the usual
 * definitions typed by their kinds, an addon defined and run at its layer,
 * queries answered live while a component is drawn.
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
  it('a kind’s view: the core’s, an addon’s icon over it, the user’s title over both', () => {
    const { w, core, builtin, user } = dashboard();
    core.add('KindView', Pod.id, { title: 'pods', category: 'workloads' });
    assertResult(builtin.patch('KindView', Pod.id, { title: 'Pods', icon: 'box' }), 'included');
    assertResult(user.patch('KindView', Pod.id, { title: 'My pods' }), 'included');
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
    core.add('Page', 'overview', { path: '/overview', title: 'Overview', regions: [{ name: 'main' }, { name: 'side' }] });
    builtin.patch('Page', 'overview', { regions: [{ name: 'side', title: 'At a glance' }] });
    expect(w.get('Page', 'overview')?.spec.regions).toEqual([{ name: 'main' }, { name: 'side', title: 'At a glance' }]);
  });
});

describe('who may add what', () => {
  it('the user adds nothing that does anything, nor moves what does to other kinds — it arranges', () => {
    const { builtin, user } = dashboard();
    const name = column({ kinds: [Pod], header: 'Node', sort: '.spec.nodeName' });
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
      ['KindView', { title: 'Mine' }],
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
    assertResult(b.add('Column', 'c1', { target: { kinds: 'apps/v1/Deployment' }, header: 'h', sort: 'core.name' }), 'rejected', ['invalid']);
    assertResult(b.add('Column', 'c2', { target: {}, header: 'h', sort: 'core.name', format: 3 }), 'rejected', ['invalid']);
    assertResult(b.add('Column', 'c3', { target: {}, header: 'h', sort: 'core.name', width: Number.NaN }), 'rejected', ['invalid']);
    assertResult(b.add('TableView', Pod.id, { widths: { name: 'wide' } }), 'rejected', ['invalid']);
    assertResult(b.add('TableView', Deployment.id, { sort: { column: 'age', descending: 'yes' } }), 'rejected', ['invalid']);
    assertResult(b.add('Action', 'a1', { target: {}, title: 't', run: 'go' }), 'rejected', ['invalid']);
    assertResult(b.add('Page', 'p1', { path: '/p1', title: 'P', regions: [{ name: 'a.b' }] }), 'rejected', ['invalid']);
    assertResult(b.add('KindView', Pod.id, { title: 'Pods', pinned: 'yes' } as never), 'rejected', ['invalid']);
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
    expect(renderSlot(w, slots.resource.view.sections, { kind: Pod, object: pod }, { matcher: kindMatcher }).text()).toBe('containers of weblabels');
    expect(renderSlot(w, slots.resource.view.sections, { kind: Deployment, object: deployment }, { matcher: kindMatcher }).text()).toBe('labels');
  });

  it('puts a tile on a page’s region', () => {
    const { w, builtin } = dashboard();
    builtin.add('Fill', 'kubernetes.nodes', tile('overview', 'main', { title: 'Nodes', render: () => h('p', null, '3 nodes') }));
    expect(renderSlot(w, slots.page('overview', 'main'), { params: {}, rest: '', path: '/overview' }).text()).toBe('3 nodes');
  });

  it('places a tile, a section and a wrap as fills are placed, for some kinds (a target) or every one', () => {
    const render = () => null;
    expect(tile('kind', 'side', { kinds: [Pod], before: 'core.x', render })).toMatchObject({ slot: 'page.kind.side', before: 'core.x', target: { kinds: [Pod.id] } });
    expect(tile('kind', 'side', { render })).not.toHaveProperty('target');
    expect(section({ kinds: [Pod], before: 'core.resource.view.yaml', render })).toMatchObject({ before: 'core.resource.view.yaml', target: { kinds: [Pod.id] } });
    expect(wrap('core.name', { kinds: [Pod], order: 0, render })).toMatchObject({ wraps: 'core.name', order: 0, target: { kinds: [Pod.id] } });
    expect(wrap('core.name', { render })).toEqual({ wraps: 'core.name', render });
  });
});

describe('the usual definitions', () => {
  it('a column: its data fields (sorted by, its cell made of), its cell the page’s — of those values only; something to show, always', () => {
    const ready = column({ kinds: [Pod], header: 'Ready', sort: 'pods.v1.ready', values: ['pods.v1.ready', 'pods.v1.containers'], format: ([r, all]) => `${r}/${all}` });
    expect(ready).toMatchObject({ target: { kinds: ['v1/Pod'] }, header: 'Ready' });
    expect(ready.format?.([1, 2], { now: 0, kind: Pod, say: (() => '') as never })).toBe('1/2');
    expect([column({ header: 'Name', sort: 'core.name' }).target, takes(column({ kinds: [], header: 'None', sort: 'core.name' }).target, Pod)]).toEqual([{}, false]);
    const { core } = dashboard();
    assertResult(core.add('Column', 'empty', column({ header: 'Nothing' })), 'rejected', ['invalid']);
    assertResult(core.add('Column', 'bad', column({ header: 'Bad', sort: 1 as never })), 'rejected', ['invalid']);
  });

  it('an action, for some kinds: its functions typed by the kind, for those kinds only', () => {
    const restart = action({ kinds: [Deployment], title: 'Restart', dangerous: true, run: (d) => d.spec?.replicas });
    expect(restart.target).toEqual({ kinds: ['apps/v1/Deployment'] });
    // @ts-expect-error typed for Pods, it says it is
    action<readonly [typeof Pod]>({ title: 'Go', run: (pod) => pod.spec?.nodeName });
  });

  it('a field an addon asks by: data, checked when said', () => {
    const { core } = dashboard();
    assertResult(core.add('Field', 'images.tag', { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' }), 'included');
    assertResult(core.add('Field', 'images.oom', { type: 'number', value: { cel: 'self.status.containerStatuses.size()' } }), 'included');
    assertResult(core.add('Field', 'images.bad', { type: 'nonsense', value: '.a' } as never), 'rejected', ['invalid']);
  });

  it('a page and its region are slots of their own: a page named as its addon names it, a region’s name with no "." or ":"', () => {
    expect([slots.page('cert-manager.certs').name, slots.page('cert-manager.certs', 'health').name]).toEqual(['page.cert-manager.certs', 'page.cert-manager.certs.health']);
    expect(() => slots.page('')).toThrow(/not empty/);
    expect(() => slots.page('a', 'b.c')).toThrow(/no "\." or ":"/);
    expect(() => slots.page('a', '')).toThrow(/not empty/);
  });
});

describe('access: whether the one signed in may have something', () => {
  it('is the access layer’s word alone, over everyone’s; what is needed, its definer’s', () => {
    const { w, core, user } = dashboard();
    const access = w.as('access', standingOf('access'));
    core.add('ResourceTab', 'core.logs', { target: {}, title: 'Logs', needs: [{ verb: 'get', resource: 'pods', subresource: 'log' }] });
    // An addon, the user: no say in it.
    expect(core.patch('ResourceTab', 'core.logs', { access: () => 'allowed' }).status).toBe('rejected');
    expect(user.patch('ResourceTab', 'core.logs', { hidden: false }).status).toBe('included');
    assertResult(access.patch('ResourceTab', 'core.logs', { access: () => 'denied', hidden: true }), 'included');
    const tab = w.registry.get('ResourceTab', 'core.logs');
    expect([accessOf(tab as never, {}), tab?.spec.hidden, tab?.provenanceOf(['hidden'])?.contributor]).toEqual(['denied', true, 'access']);
    // Needs as they are: a verb each.
    expect(core.add('ResourceTab', 'bad', { target: {}, title: 'x', needs: [{ resource: 'pods' }] as never }).status).toBe('rejected');
    expect(standingOf('access')).toEqual({ priority: 2000, rights: ['configure', 'behaviour', 'access'] });
  });

  it('allowed where none says, or where what says throws (the API server still decides)', () => {
    expect(accessOf({ spec: {} }, {})).toBe('allowed');
    expect(
      accessOf(
        {
          spec: {
            access: () => {
              throw new Error('x');
            },
          },
        },
        {},
      ),
    ).toBe('allowed');
  });
});

describe('reaching a workload', () => {
  it('reads its JSON — an empty answer as none, one not JSON said so', async () => {
    const answers: Response[] = [Response.json({ ok: true }), new Response(null, { status: 204 }), new Response('plain', { status: 200 })];
    const reach = reachOver(async () => answers.shift() as Response);
    expect(await reach.get('/a')).toEqual({ ok: true });
    expect(await reach.post('/b', {})).toBeUndefined();
    await expect(reach.get('/c')).rejects.toMatchObject({ code: 'bad_json' });
  });
});

describe('an addon', () => {
  it('keeps its setup in a module of its own (lazySetup): loaded once, again only after it failed; once there, set up at once', async () => {
    const ran = vi.fn();
    const load = vi.fn<() => Promise<{ default: (ctx: Ctx) => void }>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: ran });
    const addon = defineAddon({ id: 'a', title: 'x', setup: lazySetup(load) });
    const ctx = {} as Ctx;
    await expect(loadOf(addon)?.()).rejects.toThrow('offline');
    await Promise.all([loadOf(addon)?.(), loadOf(addon)?.()]);
    expect(load).toHaveBeenCalledTimes(2);
    // Its module there: its setup run now, not a promise of it.
    expect(addon.setup(ctx)).toBeUndefined();
    expect(ran).toHaveBeenCalledWith(ctx);
    expect(loadOf(defineAddon({ id: 'b', title: 'x', setup() {} }))).toBeUndefined();
  });

  it('is checked when defined, and stands at its layer', () => {
    expect(() => defineAddon({ id: 'Bad Id', title: 'x', setup() {} })).toThrow(/lower-case/);
    expect(() => defineAddon({ id: 'user', title: 'x', setup() {} })).toThrow(/the page's own/);
    expect(() => defineAddon({ id: 'a', title: 'x', layer: 'kernel' as never, setup() {} })).toThrow(/no layer kernel/);
    expect(() => defineAddon({ id: 'a', title: 'x', requires: { serves: 'x' } as never, setup() {} })).toThrow(/no field serves/);
    expect(() => defineAddon({ id: 'a', title: 'x', provides: { frame: 42 as never }, setup() {} })).toThrow(/provides frame/);
    expect(defineAddon({ id: 'a', title: 'x', requires: { served: '' }, async setup() {} }).id).toBe('a');
    // What it answers to: each a title and a condition; a Service looked for by name(s), and a port.
    expect(() => defineAddon({ id: 'a', title: 'x', answers: [{ title: '', when: { served: 'x' } }], setup() {} })).toThrow(/answers\[0\]: no title/);
    expect(() => defineAddon({ id: 'a', title: 'x', answers: [{ title: 'VM' } as never], setup() {} })).toThrow(/answers\[0\] \(VM\): no condition/);
    expect(() => defineAddon({ id: 'a', title: 'x', answers: [{ title: 'VM', when: { found: { service: [] } } }], setup() {} })).toThrow(/service is not a name/);
    expect(() => defineAddon({ id: 'a', title: 'x', requires: { found: { service: 'vm', port: 70000 } }, setup() {} })).toThrow(/port is not a port/);
    expect(
      defineAddon({ id: 'a', title: 'x', answers: [{ title: 'VM', when: { found: { service: ['vmsingle-*', 'vmselect-*'], port: 8428 } } }], setup() {} }).answers,
    ).toHaveLength(1);
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
        ctx.contributor.add('Column', 'images.tag', column({ kinds: [Pod], header: 'Tag', sort: '.spec.containers[0].image' }));
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

describe('a query in a component', () => {
  const pod = (name: string) => ({ metadata: { name, namespace: 'a', uid: name } }) as KubeObject;

  it('is answered while it is drawn, and again as what it asks changes', () => {
    const { w } = dashboard();
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('x')] });
    const cluster = { source: memorySource(objects) } as unknown as Cluster;
    const Pods = () => {
      const pods = useList({ kind: 'pods.v1', sort: [{ field: 'core.name' }], page: { limit: 5 }, select: ['core.name'] });
      return h('span', null, `${pods.state}:${pods.items.map((i) => i.values?.['core.name']).join(',')}`);
    };
    const view = mount(w, h(KubeProvider, { cluster }, h(Pods, null)));
    expect(view.text()).toBe('live:x');
    view.act(() => {
      objects.value = { 'pods.v1': [pod('y'), pod('x')] };
    });
    expect(view.text()).toBe('live:x,y');
    view.unmount();
  });

  it('says so when no cluster is given', () => {
    const { w } = dashboard();
    const Pods = () => h('span', null, useList({ kind: 'pods.v1', page: { limit: 1 } }).state);
    expect(() => mount(w, h(Pods, null))).toThrow(/no KubeProvider/);
  });
});
