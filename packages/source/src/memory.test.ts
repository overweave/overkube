import type { KubeObject } from '@overkube/kube-types';
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { memorySource } from './memory.ts';

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
