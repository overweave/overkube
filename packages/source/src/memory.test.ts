import type { KubeObject } from '@overkube/kube-types';
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import { TICK_MS } from './filter.ts';
import { memorySource } from './memory.ts';
import { OWNED_EVERY_MS } from './owned.ts';

/*
 * A source of objects in memory, as a test or a story has it: the page's
 * fields and answers, live as the objects change.
 */

const pod = (name: string, namespace: string, restarts: number) =>
  ({ metadata: { name, namespace, uid: name }, status: { phase: 'Running', containerStatuses: [{ name: 'c', ready: true, restartCount: restarts }] } }) as KubeObject;

describe('a source in memory', () => {
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
});
