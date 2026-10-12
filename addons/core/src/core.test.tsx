import { kinds } from '@overkube/kube-types';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import core from './index.tsx';

/* The core addon: every kind's table has its objects' names, namespaces and ages. */

afterEach(cleanup);

const { Pod, Namespace } = kinds.core.v1;

describe('core', () => {
  it('gives every kind a name, a namespace and an age column', () => {
    const w = kubeWorld();
    w.addon(core);
    const pod = make(Pod, { metadata: { name: 'web', namespace: 'shop', creationTimestamp: '2026-01-01T00:00:00Z' } });
    const context = { now: Date.parse('2026-01-01T03:00:00Z'), objects: [], kind: Pod };
    const cell = (name: string, object: object) => {
      const spec = w.get('Column', name)?.spec;
      return [spec?.value(object as never, context), spec?.display(object as never, context)];
    };
    expect([cell('core.name', pod), cell('core.namespace', pod), cell('core.age', pod)]).toEqual([
      ['web', 'web'],
      ['shop', 'shop'],
      [Date.parse('2026-01-01T00:00:00Z'), '3h'],
    ]);
    // Of kinds with namespaces only.
    expect([Pod, Namespace].map((k) => w.get('Column', 'core.namespace')?.spec.when?.(k))).toEqual([true, false]);
    expect(['core.name', 'core.namespace', 'core.age'].every((n) => !w.get('Column', n)?.spec.target.kinds)).toBe(true);
  });
});
