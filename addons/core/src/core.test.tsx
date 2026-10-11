import { kinds } from '@overkube/kube-types';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { mount } from '@overkube/testkit/preact';
import type { ComponentType } from 'preact';
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
    const value = (name: string, object: object) => w.get('Column', name)?.spec.value(object as never);
    expect([value('core.name', pod), value('core.namespace', pod), value('core.age', pod)]).toEqual(['web', 'shop', '2026-01-01T00:00:00Z']);
    expect(value('core.namespace', make(Namespace, { metadata: { name: 'shop' } }))).toBeUndefined();
    expect(['core.name', 'core.namespace', 'core.age'].every((n) => !w.get('Column', n)?.spec.target.kinds)).toBe(true);
  });

  it('draws an age as the time since', () => {
    const w = kubeWorld();
    w.addon(core);
    const Render = w.get('Column', 'core.age')?.spec.render as ComponentType<{ object: object }>;
    const pod = make(Pod, { metadata: { creationTimestamp: new Date(Date.now() - 3 * 3600_000).toISOString() } });
    expect(mount(w, <Render object={pod} />).text()).toBe('3h');
  });
});
