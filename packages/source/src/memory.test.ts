import type { KubeObject } from '@overkube/kube-types';
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import { TICK_MS } from './filter.ts';
import { logKey, memorySource } from './memory.ts';
import { OWNED_EVERY_MS } from './owned.ts';

/*
 * A source of objects in memory, as a test or a story has it: the page's
 * fields and answers, live as the objects change.
 */

const pod = (name: string, namespace: string, restarts: number) =>
  ({ metadata: { name, namespace, uid: name }, status: { phase: 'Running', containerStatuses: [{ name: 'c', ready: true, restartCount: restarts }] } }) as KubeObject;

describe('a source in memory', () => {
  it('has fields joined of another kind’s objects (the same namespace and name): sorted and filtered by, again as those change', () => {
    const svc = (name: string, n: number) => ({ metadata: { name, namespace: 'x' }, spec: { n } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('a', 'x', 0), pod('b', 'x', 0), pod('c', 'x', 0)], 'services.v1': [svc('a', 5), svc('b', 9)] });
    const layers = signal([{ fields: { 'acme.n': { kinds: ['pods.v1'], type: 'number', value: { from: 'services.v1', field: '.spec.n' } } } }]);
    const source = memorySource(objects, { layers });
    const list = source.list({ kind: 'pods.v1', sort: [{ field: 'acme.n', desc: true }], page: { limit: 5 }, select: ['core.name', 'acme.n'] });
    expect(list.value.items.map((i) => i.values)).toEqual([
      { 'core.name': 'b', 'acme.n': 9 },
      { 'core.name': 'a', 'acme.n': 5 },
      { 'core.name': 'c', 'acme.n': null },
    ]);
    objects.value = { ...objects.value, 'services.v1': [svc('a', 50), svc('b', 9)] };
    expect(list.value.items.map((i) => i.values?.['core.name'])).toEqual(['a', 'b', 'c']);
    expect(source.count({ kind: 'pods.v1', where: { field: 'acme.n', op: 'range', gt: 10 } }).value.total?.count).toBe(1);
    expect(source.count({ kind: 'pods.v1', sum: ['acme.n'] }).value.sums).toEqual({ 'acme.n': 59 });
  });

  it('joins by a key: those of its namespace whose field is its own (a workload’s reports), reduced — the greatest, added up, how many; none, none (count: 0); live as they change', () => {
    const report = (name: string, namespace: string, owner: string, critical: number) => ({ metadata: { name, namespace, labels: { owner } }, report: { critical } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({
      'pods.v1': [pod('web', 'x', 0), pod('db', 'x', 0), pod('web', 'y', 0)],
      'configmaps.v1': [report('r1', 'x', 'web', 9), report('r2', 'x', 'web', 2), report('r3', 'y', 'db', 4)],
    });
    const joined = (reduce: string) => ({
      kinds: ['pods.v1'],
      type: 'number',
      value: { from: 'configmaps.v1', field: '.report.critical', by: 'core.name', to: '.metadata.labels.owner', reduce },
    });
    const layers = signal([{ fields: { 'acme.max': joined('max'), 'acme.sum': joined('sum'), 'acme.count': joined('count') } }]);
    const source = memorySource(objects, { layers });
    const list = source.list({
      kind: 'pods.v1',
      sort: [{ field: 'acme.max', desc: true }],
      page: { limit: 5 },
      select: ['core.namespace', 'core.name', 'acme.max', 'acme.sum', 'acme.count'],
    });
    const rows = () => list.value.items.map((i) => Object.values(i.values ?? {}));
    // web in x: its two (9, 2); db in x: none (r3 is of y); web in y: none (y's report is db's).
    expect(rows()).toEqual([
      ['x', 'web', 9, 11, 2],
      ['x', 'db', null, null, 0],
      ['y', 'web', null, null, 0],
    ]);
    objects.value = { ...objects.value, 'configmaps.v1': [...(objects.value['configmaps.v1'] ?? []), report('r4', 'y', 'web', 30)] };
    expect(rows()[0]).toEqual(['y', 'web', 30, 30, 1]);
    expect(source.count({ kind: 'pods.v1', where: { field: 'acme.count', op: 'range', gt: 0 } }).value.total?.count).toBe(2);
  });

  it('joins a kind of no namespace by name; one not served, none; a field the other has not, or a joined one, told as its error', () => {
    const objects = signal<Record<string, KubeObject[]>>({
      'nodes.v1': [{ metadata: { name: 'n1' } } as KubeObject],
      'csinodes.v1.storage.k8s.io': [{ metadata: { name: 'n1' }, spec: { n: 3 } } as KubeObject],
    });
    const layers = signal([
      {
        fields: {
          'acme.n': { kinds: ['nodes.v1'], type: 'number', value: { from: 'csinodes.v1.storage.k8s.io', field: '.spec.n' } },
          'acme.none': { kinds: ['nodes.v1'], type: 'number', value: { from: 'csinodes.v1.storage.k8s.io', field: 'acme.nope' } },
          'acme.back': { kinds: ['csinodes.v1.storage.k8s.io'], type: 'number', value: { from: 'nodes.v1', field: 'acme.n' } },
          'acme.twice': { kinds: ['nodes.v1'], type: 'number', value: { from: 'csinodes.v1.storage.k8s.io', field: 'acme.back' } },
        },
      },
    ]);
    const source = memorySource(objects, { layers });
    const nodes = source.list({ kind: 'nodes.v1', page: { limit: 5 }, select: ['acme.n', 'acme.none', 'acme.twice'] }).value;
    expect(nodes.items[0]?.values).toEqual({ 'acme.n': 3, 'acme.none': null, 'acme.twice': null });
    expect(nodes.fieldErrors).toEqual({
      'acme.none': expect.objectContaining({ code: 'bad_join', message: 'csinodes.v1.storage.k8s.io has no field acme.nope' }),
      'acme.twice': expect.objectContaining({ code: 'bad_join' }),
    });
    const unserved = memorySource(objects, { layers, serves: (k) => k.group !== 'storage.k8s.io' });
    expect(unserved.list({ kind: 'nodes.v1', page: { limit: 5 }, select: ['acme.n'] }).value.items[0]?.values).toEqual({ 'acme.n': null });
  });

  it('answers as the page’s does, as its objects change', () => {
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('a', 'x', 3), pod('b', 'y', 1)] });
    const source = memorySource(objects);
    const list = source.list({ kind: 'pods.v1', scope: { namespaces: ['x', 'y'] }, sort: [{ field: 'pods.v1.restarts' }], page: { limit: 5 }, select: ['core.name'] });
    expect(list.value.items.map((i) => i.values)).toEqual([{ 'core.name': 'b' }, { 'core.name': 'a' }]);
    objects.value = { 'pods.v1': [pod('a', 'x', 3)] };
    expect(list.value.total).toEqual({ count: 1, exact: true });
    expect(source.get({ kind: 'pods.v1', namespace: 'x', name: 'a' }).value.object).toBeDefined();
    expect(source.count({ kind: 'pods.v1', groupBy: 'pods.v1.phase' }).value.groups).toEqual([{ value: 'Running', count: 1 }]);
    expect(source.list({ kind: 'pods.v1', where: { field: 'nope', op: 'exists' }, page: { limit: 1 } }).value.error?.code).toBe('unknown_field');
    expect(source.fields('pods.v1').value.catalog?.fields['pods.v1.restarts']).toMatchObject({ type: 'number' });
  });

  it('filters by CEL: what a where says asked as one, the rest worked out of each object; a filter that is none, where it is wrong', () => {
    const labelled = (name: string, restarts: number, labels: Record<string, string>) =>
      ({ ...pod(name, 'x', restarts), metadata: { name, namespace: 'x', uid: name, labels } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [labelled('web-1', 0, { app: 'web' }), labelled('web-2', 5, { app: 'web' }), labelled('db-0', 9, {})] });
    const source = memorySource(objects);
    const names = (filter: string) =>
      source.list({ kind: 'pods.v1', filter, sort: [{ field: 'core.name' }], page: { limit: 10 }, select: ['core.name'] }).value.items.map((i) => i.values?.['core.name']);
    expect(names('restarts > 3')).toEqual(['db-0', 'web-2']);
    expect(names('app=web')).toEqual(['web-1', 'web-2']);
    expect(names('labels.app = web and self.metadata.name.endsWith("2")')).toEqual(['web-2']);
    expect(names('WEB')).toEqual(['web-1', 'web-2']);
    expect(source.count({ kind: 'pods.v1', filter: 'not labels.app = web' }).value.total?.count).toBe(1);
    // Its next window, past its cursor: the next it holds.
    const first = source.list({ kind: 'pods.v1', filter: 'restarts > 3', sort: [{ field: 'core.name' }], page: { limit: 1 }, select: ['core.name'] }).value;
    const next = source.list({ kind: 'pods.v1', filter: 'restarts > 3', sort: [{ field: 'core.name' }], page: { limit: 1, after: first.next }, select: ['core.name'] }).value;
    expect([first.items[0]?.values?.['core.name'], next.error, next.items[0]?.values?.['core.name']]).toEqual(['db-0', undefined, 'web-2']);
    // What it cannot be worked out of (1 / 0, a name not a number): not kept, told — what the where let through only (a guard holds).
    expect(names('restarts > 0 and 10 / restarts > 1')).toEqual(['web-2']);
    const failing = source.list({ kind: 'pods.v1', filter: 'int(self.metadata.name) > 0', page: { limit: 10 } }).value;
    expect([failing.items.length, failing.fieldErrors?.filter?.count]).toEqual([0, 3]);
    const wrong = source.list({ kind: 'pods.v1', filter: 'restarts > 3 and bogus = x', page: { limit: 1 } }).value.error;
    expect(wrong).toMatchObject({ code: 'bad_filter', at: { start: 17, end: 22 } });
  });

  it('filters by now (an age, now-2h) as of each answer, answered anew as time goes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const made = (name: string, at: string) => ({ ...pod(name, 'x', 0), metadata: { name, namespace: 'x', uid: name, creationTimestamp: at } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [made('old', '2026-10-16T09:00:00Z'), made('new', '2026-10-16T11:30:00Z')] });
    const list = memorySource(objects).list({ kind: 'pods.v1', filter: 'age > 1h', sort: [{ field: 'core.name' }], page: { limit: 10 }, select: ['core.name'] });
    const names = () => list.value.items.map((i) => i.values?.['core.name']);
    const off = list.subscribe(() => {});
    expect(names()).toEqual(['old']);
    vi.setSystemTime(new Date('2026-10-16T12:40:00Z'));
    vi.advanceTimersByTime(TICK_MS);
    expect(names()).toEqual(['new', 'old']);
    off();
    vi.useRealTimers();
  });

  it('searches every kind it has, by name or labels', () => {
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('web-1', 'x', 0), pod('db', 'x', 0)], 'nodes.v1': [{ metadata: { name: 'web-node' } } as KubeObject] });
    const found = memorySource(objects).search({ text: 'web' }).value;
    expect(found.groups.map((g) => [g.kind, g.items.map((i) => i.name)])).toEqual([
      ['pods.v1', ['web-1']],
      ['nodes.v1', ['web-node']],
    ]);
  });

  it('says how many of a kind (in a scope); one not served, why', () => {
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('a', 'x', 0), pod('b', 'y', 0), pod('c', 'y', 0)] });
    const source = memorySource(objects);
    expect([source.size('pods.v1').value.total, source.size('pods.v1', { namespaces: ['y'] }).value.total]).toEqual([
      { count: 3, exact: true },
      { count: 2, exact: true },
    ]);
    expect(source.size('widgets.v1.nowhere.io').value.error?.code).toBe('not_served');
  });

  it('learns what kinds own what kinds from the objects it has (their owners)', () => {
    const owned = (name: string, kind: string, apiVersion: string) =>
      ({ metadata: { name, namespace: 'x', uid: name, ownerReferences: [{ apiVersion, kind, name: 'o', uid: 'o' }] } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('a', 'x', 0)] });
    const source = memorySource(objects);
    const rs = source.owned('replicasets.v1.apps');
    expect(rs.value).toEqual([]);
    vi.useFakeTimers();
    const off = rs.subscribe(() => {});
    objects.value = { 'pods.v1': [owned('a', 'ReplicaSet', 'apps/v1')], 'configmaps.v1': [owned('c', 'ReplicaSet', 'apps/v1')] };
    // Pods looked through a moment ago: again once the while is over.
    expect(rs.value).toEqual(['configmaps.v1']);
    vi.advanceTimersByTime(OWNED_EVERY_MS);
    expect(rs.value).toEqual(['configmaps.v1', 'pods.v1']);
    off();
    vi.useRealTimers();
    expect(source.owned('deployments.v1.apps').value).toEqual([]);
    // An owner of another version of its kind (an operator's own): the same kind's.
    objects.value = { ...objects.value, 'secrets.v1': [owned('s', 'ReplicaSet', 'apps/v1beta2')] };
    expect(rs.value).toEqual(['configmaps.v1', 'pods.v1', 'secrets.v1']);
  });

  it('holds to the page’s rules: a get of a namespaced kind says its namespace; a kind of no namespace has no scope; one not served, none', () => {
    const objects = signal<Record<string, KubeObject[]>>({ 'pods.v1': [pod('a', 'x', 0)], 'nodes.v1': [{ metadata: { name: 'n1' } } as KubeObject] });
    const served = signal<boolean | undefined>(undefined);
    const source = memorySource(objects, { serves: (k) => (k.plural === 'pods' ? true : served.value) });
    expect(source.get({ kind: 'pods.v1', name: 'a' }).value.error?.code).toBe('bad_query');
    const nodes = source.count({ kind: 'nodes.v1', scope: { namespaces: ['x'] } });
    expect(nodes.value.state).toBe('loading');
    served.value = true;
    expect(nodes.value.total?.count).toBe(1);
    served.value = false;
    expect(nodes.value.error?.code).toBe('not_served');
  });

  it('answers a container’s log as given: the newest so many, the window before by its older; followed, live', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'].map((text, i) => ({ time: `2026-10-17T09:00:0${i}Z`, text }));
    const source = memorySource(signal({}), { logs: signal({ [logKey({ namespace: 'x', name: 'web', container: 'c' })]: lines }) });
    const newest = source.log({ kind: 'pods.v1', namespace: 'x', name: 'web', container: 'c', follow: true, limit: 2 }).value;
    expect([newest.state, newest.lines.map((l) => l.text), newest.older]).toEqual(['live', ['d', 'e'], '2026-10-17T09:00:03Z 1']);
    const before = source.log({ kind: 'pods.v1', namespace: 'x', name: 'web', container: 'c', before: newest.older, limit: 2 }).value;
    expect([before.state, before.lines.map((l) => l.text)]).toEqual(['done', ['b', 'c']]);
    expect(source.log({ kind: 'pods.v1', namespace: 'x', name: 'other', limit: 2 }).value.error?.code).toBe('not_found');
  });
});
