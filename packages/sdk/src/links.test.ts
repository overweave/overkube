import { kinds } from '@overkube/kube-types';
import { describe, expect, it } from 'vitest';
import { closeIn, KIND_PAGE, kindPath, kindRefIn, openedIn, openIn } from './links.ts';

/* Where things are, as paths: a kind's page, and a resource opened over any page (?open=) — its other parameters kept as they are. */

const { Pod, Node } = kinds.core.v1;
const pod = { metadata: { namespace: 'shop', name: 'my pod' } };

describe('links', () => {
  it('opens a resource over a page, its name encoded, the page’s own parameters kept — another opened there in its place', () => {
    expect(openIn('/certs', Pod, pod)).toBe('/certs?open=pods.v1/shop/my%20pod');
    expect(openIn('/certs?tab=2', Node, { metadata: { name: 'n1' } })).toBe('/certs?tab=2&open=nodes.v1/n1');
    expect(openIn('/certs?open=nodes.v1/n1&tab=2', Pod, pod)).toBe('/certs?tab=2&open=pods.v1/shop/my%20pod');
  });

  it('closes what is open, wherever it is in the query, and keeps the rest (a "?" in it too)', () => {
    expect(closeIn('/certs?open=pods.v1/shop/web')).toBe('/certs');
    expect(closeIn('/certs?open=pods.v1/shop/web&tab=2')).toBe('/certs?tab=2');
    expect(closeIn('/x?q=a?b&open=pods.v1/shop/web')).toBe('/x?q=a?b');
    expect(closeIn('/certs')).toBe('/certs');
  });

  it('reads back what is open: namespaced or not, decoded; one that cannot be read, none', () => {
    expect(openedIn(openIn('/certs?tab=2', Pod, pod))).toEqual({ kind: 'pods.v1', namespace: 'shop', name: 'my pod' });
    expect(openedIn('/k/nodes.v1?open=nodes.v1/n1')).toEqual({ kind: 'nodes.v1', name: 'n1' });
    expect(['/k/pods.v1', '/x?open=pods.v1', '/x?open=pods.v1//web', '/x?open=a/b/c/d', '/x?open=pods.v1/%E0%A4'].map(openedIn)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('reads a kind’s page back from its path, what is opened over it aside', () => {
    expect([KIND_PAGE, kindPath(Pod)]).toEqual(['/k/:kind', '/k/pods.v1']);
    expect([kindRefIn('/k/pods.v1'), kindRefIn('/k/pods.v1?open=pods.v1/shop/web'), kindRefIn('/certs'), kindRefIn('/k/pods.v1/x')]).toEqual([
      'pods.v1',
      'pods.v1',
      undefined,
      undefined,
    ]);
  });
});
