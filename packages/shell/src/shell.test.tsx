import { kubeKinds, type RouteSpec, slots } from '@overkube/sdk';
import { useRoute } from '@overkube/sdk/preact';
import { createRegistry, type Definition } from '@overweave/core';
import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchPath, matchRoute } from './match.ts';
import { notifications } from './notifications.ts';
import { hashRouter, memoryRouter, pathOf } from './router.ts';
import { Shell } from './Shell.tsx';

/*
 * The shell: a path read and gone to (a hash's, one in memory), the Route
 * that takes it (the most specific), what the user is told and for how
 * long, the frame drawn of what fills its slots.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const route = (name: string, path: string, order?: number, priority = 0) =>
  ({ kind: 'Route', name, spec: { path, render: () => null, ...(order === undefined ? {} : { order }) }, provenanceOf: () => ({ priority }) }) as unknown as Definition<RouteSpec>;

describe('matching', () => {
  it('reads a path’s parameters, decoded; what a * took; nothing for a part it cannot decode', () => {
    expect(matchPath('/k/:kind/:namespace/:name', '/k/pods.v1/shop/my%20pod')).toEqual({ params: { kind: 'pods.v1', namespace: 'shop', name: 'my pod' }, rest: '' });
    expect(matchPath('/certs/*', '/certs/expiring/soon')).toEqual({ params: {}, rest: '/expiring/soon' });
    expect(matchPath('/certs/*', '/certs')).toEqual({ params: {}, rest: '/' });
    expect(matchPath('/k/:kind', '/k/%E0%A4')).toBeUndefined();
    expect(matchPath('/k/:kind', '/k/a/b')).toBeUndefined();
    expect(matchPath('/', '/')).toEqual({ params: {}, rest: '' });
  });

  it('takes the most specific route, part by part — fixed, then :parameter, then *; between equals the stronger layer, then order', () => {
    const routes = [
      route('any', '/*'),
      route('kind', '/k/:kind'),
      route('pods', '/k/pods.v1'),
      route('object', '/k/:kind/:namespace/:name'),
      route('a', '/x', 2),
      route('b', '/x', 1),
    ];
    expect(matchRoute(routes, '/k/pods.v1')?.route.name).toBe('pods');
    expect(matchRoute(routes, '/k/nodes.v1')?.route.name).toBe('kind');
    expect(matchRoute(routes, '/k/pods.v1/shop/web')?.route.name).toBe('object');
    expect(matchRoute(routes, '/elsewhere')?.route.name).toBe('any');
    expect(matchRoute(routes, '/x')?.route.name).toBe('b');
    // An addon's route over the core's at the same path, whatever their names.
    expect(matchRoute([route('core.home', '/', undefined, 0), route('apps.home', '/', undefined, 200)], '/')?.route.name).toBe('apps.home');
    // Part by part: a fixed part where the other has a parameter.
    expect(matchRoute([route('edit', '/k/:kind/edit'), route('object', '/k/pods.v1/:name')], '/k/pods.v1/edit')?.route.name).toBe('object');
    expect(matchRoute([route('kind', '/k/:kind/*'), route('pods', '/k/pods.v1')], '/k/pods.v1')?.route.name).toBe('pods');
    expect(matchRoute([route('kind', '/k/:kind')], '/nowhere')).toBeUndefined();
  });
});

describe('routers', () => {
  it('follow the window’s hash, and change it; a hash that is no path is the root', () => {
    expect([pathOf(''), pathOf('#'), pathOf('#x'), pathOf('#/k/pods.v1')]).toEqual(['/', '/', '/', '/k/pods.v1']);
    window.location.hash = '#/k/pods.v1';
    const router = hashRouter(window);
    expect(router.path.value).toBe('/k/pods.v1');
    router.navigate('/k/nodes.v1');
    expect([window.location.hash, router.path.value]).toEqual(['#/k/nodes.v1', '/k/nodes.v1']);
    router.navigate('/', { replace: true });
    expect(router.path.value).toBe('/');
    expect(router.href('/k/x')).toBe('#/k/x');
    router.close();
  });

  it('keep a path in memory, and where it went', () => {
    const router = memoryRouter('/a');
    router.navigate('/b');
    router.navigate('/c', { replace: true });
    expect([router.path.value, router.history]).toEqual(['/c', ['/a', '/c']]);
    router.back();
    expect(router.path.value).toBe('/a');
    router.back();
    expect(router.path.value).toBe('/a');
    router.navigate('/d');
    expect(router.history).toEqual(['/a', '/d']);
  });
});

describe('notifications', () => {
  it('are kept for a few seconds, an error until closed, each dismissable', () => {
    vi.useFakeTimers();
    const told = notifications();
    told.notify({ text: 'saved' }, 'images');
    const error = told.notify({ level: 'error', text: 'refused' });
    expect(told.list.value.map((n) => [n.text, n.from])).toEqual([
      ['saved', 'images'],
      ['refused', undefined],
    ]);
    vi.advanceTimersByTime(5000);
    expect(told.list.value.map((n) => n.text)).toEqual(['refused']);
    told.dismiss(error);
    expect(told.list.value).toEqual([]);
    told.notify({ text: 'kept', timeoutMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(told.list.value).toHaveLength(1);
    told.close();
    expect(told.list.value).toEqual([]);
  });

  it('replace one of the same key (and teller), not stack; hold their time while held', () => {
    vi.useFakeTimers();
    const told = notifications();
    const a = told.notify({ text: 'one', key: 'k' }, 'x');
    const b = told.notify({ text: 'two', key: 'k' }, 'x');
    told.notify({ text: 'other’s', key: 'k' }, 'y');
    expect([a === b, told.list.value.map((n) => n.text)]).toEqual([true, ['two', 'other’s']]);
    told.hold(a, true);
    vi.advanceTimersByTime(10_000);
    expect(told.list.value.map((n) => n.text)).toEqual(['two']);
    told.hold(a, false);
    vi.advanceTimersByTime(5000);
    expect(told.list.value).toEqual([]);
  });
});

describe('the frame', () => {
  it('draws its slots and the route at the path; a route that throws is its own, the frame stays', () => {
    const registry = createRegistry({ kinds: kubeKinds });
    const app = registry.contributor('app', { priority: 0, rights: ['configure', 'behaviour'] });
    const Kind = () => <p>kind {useRoute().params.kind}</p>;
    app.add('Route', 'kind', { path: '/k/:kind', render: Kind });
    app.add('Route', 'bad', {
      path: '/bad',
      render: () => {
        throw new Error('no');
      },
    });
    app.add('Fill', 'header', { slot: slots.header.start.name, render: () => <b>overkube</b> });
    const failures: string[] = [];
    const router = memoryRouter('/k/pods.v1');
    const view = render(
      <Shell registry={registry} cluster={{} as never} router={router} notifications={notifications()} onFailure={(d, field) => failures.push(`${d.name}:${field}`)} />,
    );
    expect(view.container.textContent).toContain('overkube');
    expect(view.container.textContent).toContain('kind pods.v1');
    router.navigate('/bad');
    view.rerender(
      <Shell registry={registry} cluster={{} as never} router={router} notifications={notifications()} onFailure={(d, field) => failures.push(`${d.name}:${field}`)} />,
    );
    expect(view.container.textContent).toContain('This page failed to draw');
    expect(view.container.textContent).toContain('overkube');
    expect(failures).toEqual(['bad:render']);
  });

  it('follows a link to a path of the page through its router (a path held in memory too)', () => {
    const registry = createRegistry({ kinds: kubeKinds });
    const app = registry.contributor('app', { priority: 0, rights: ['configure', 'behaviour'] });
    app.add('Route', 'a', { path: '/a', render: () => <a href="#/b">to b</a> });
    app.add('Route', 'b', { path: '/b', render: () => <p>at b</p> });
    const router = memoryRouter('/a');
    const view = render(<Shell registry={registry} cluster={{} as never} router={router} notifications={notifications()} />);
    // A new tab's click (a modifier): the browser's, not the router's.
    const link = view.container.querySelector('a[href="#/b"]') as HTMLAnchorElement;
    const meta = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(meta);
    expect(router.path.value).toBe('/a');
    act(() => link.click());
    expect([router.path.value, view.container.textContent]).toEqual(['/b', expect.stringContaining('at b')]);
  });

  it('says so when no route takes the path, and when no addon draws any page', () => {
    const registry = createRegistry({ kinds: kubeKinds });
    const view = render(<Shell registry={registry} cluster={{} as never} router={memoryRouter('/x')} notifications={notifications()} />);
    expect(view.container.textContent).toContain('No addon draws a page');
    act(() => void registry.contributor('app', { priority: 0, rights: ['behaviour'] }).add('Route', 'home', { path: '/', render: () => null }));
    expect(view.container.textContent).toContain('No page at /x');
  });
});
