import { kinds } from '@overkube/kube-types';
import { describe, expect, it } from 'vitest';
import { closeIn, filteredIn, filterIn, KIND_PAGE, kindPath, kindRefIn, openedIn, openIn, tabbedIn, tabIn } from './links.ts';

/* Where things are, as paths: a kind's page, and a resource opened over any page (?open=) — its other parameters kept as they are. */

const { Pod, Node } = kinds.core.v1;
const pod = { metadata: { namespace: 'shop', name: 'my pod' } };

describe('links', () => {
  it('opens a resource over a page, its name encoded, the page’s own parameters kept — another opened there in its place', () => {
    expect(openIn('/certs', Pod, pod)).toBe('/certs?open=pods.v1/shop/my%20pod');
    expect(openIn('/certs?tab=2', Node, { metadata: { name: 'n1' } })).toBe('/certs?tab=2&open=nodes.v1/n1');
    // A kind of the whole cluster by its name alone, a namespace given or not (an owner named by what it owns).
    expect(openIn('/certs', Node, { metadata: { name: 'n1', namespace: 'kube-system' } })).toBe('/certs?open=nodes.v1/n1');
    expect(openIn('/certs?open=nodes.v1/n1&tab=2', Pod, pod)).toBe('/certs?tab=2&open=pods.v1/shop/my%20pod');
  });

  it('opens it on a tab of its (a link to it), read back; another chosen in its place; closed, its tab with it — the page’s own "tab" its own', () => {
    const on = openIn('/certs?tab=2', Pod, pod, 'trivy.vulnerabilities');
    expect([on, tabIn(on), tabIn('/certs?tab=2&open=pods.v1/shop/web')]).toEqual([
      '/certs?tab=2&open=pods.v1/shop/my%20pod&open-tab=trivy.vulnerabilities',
      'trivy.vulnerabilities',
      undefined,
    ]);
    expect([tabbedIn(on, 'core.yaml'), tabbedIn(on, undefined), closeIn(on)]).toEqual([
      '/certs?tab=2&open=pods.v1/shop/my%20pod&open-tab=core.yaml',
      '/certs?tab=2&open=pods.v1/shop/my%20pod',
      '/certs?tab=2',
    ]);
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

  it('filters a page by CEL (encoded: & # = and quotes its own), what is opened kept; none, not filtered', () => {
    const cel = 'status == "a&b#c" && x = 1';
    const path = filterIn('/k/pods.v1?open=pods.v1/shop/web', cel);
    expect(path).toBe(`/k/pods.v1?filter=${encodeURIComponent(cel)}&open=pods.v1/shop/web`);
    expect(filteredIn(path)).toBe(cel);
    expect(openedIn(path)).toEqual({ kind: 'pods.v1', namespace: 'shop', name: 'web' });
    expect(filterIn(path, undefined)).toBe('/k/pods.v1?open=pods.v1/shop/web');
    expect(filterIn('/k/pods.v1?filter=a', '')).toBe('/k/pods.v1');
    expect([filteredIn('/k/pods.v1'), filteredIn('/k/pods.v1?filter=%E0%A4%A')]).toEqual([undefined, undefined]);
  });
});
