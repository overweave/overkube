import { kinds } from '@overkube/kube-types';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { Ratio } from '@overkube/uikit';
import type { VNode } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import core from './index.tsx';

/* The core addon: every kind's table has its objects' names, namespaces and ages. */

afterEach(cleanup);

const { Pod, Namespace } = kinds.core.v1;

describe('core', () => {
  it('gives every kind a name, a namespace and an age column, of fields; the usual kinds their own', () => {
    const w = kubeWorld();
    w.addon(core);
    const spec = (name: string) => w.get('Column', name)?.spec;
    expect(['core.name', 'core.namespace', 'core.age'].map((n) => [spec(n)?.sort, spec(n)?.target.kinds])).toEqual([
      ['core.name', undefined],
      ['core.namespace', undefined],
      ['core.created', undefined],
    ]);
    // Of kinds with namespaces only.
    expect([Pod, Namespace].map((k) => spec('core.namespace')?.when?.(k))).toEqual([true, false]);
    // A pod's readiness: of its fields, a part of a whole (a ring, 1/2 beside it).
    const ready = spec(`core.${Pod.id}.ready`);
    const drawn = ready?.format?.([1, 2], { now: 0, kind: Pod, say: (() => '') as never }) as VNode<{ value: number; of: number }>;
    expect([ready?.values, drawn.type, drawn.props]).toEqual([['pods.v1.ready', 'pods.v1.containers'], Ratio, { value: 1, of: 2 }]);
  });

  it('answers a kind’s table by its columns’ fields, sorted as asked', () => {
    const w = kubeWorld();
    w.addon(core);
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'b', namespace: 'shop' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'a', namespace: 'shop' } }));
    const list = w.cluster.source.list({ kind: 'pods.v1', sort: [{ field: 'core.name' }], page: { limit: 5 }, select: ['core.name', 'core.created'] });
    expect(list.value.items.map((i) => i.values?.['core.name'])).toEqual(['a', 'b']);
  });
});
