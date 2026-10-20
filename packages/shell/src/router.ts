import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * Where the page is, as a path ('/k/pods.v1'): the window's hash
 * (#/k/pods.v1 — a reload or a link keeps it, Back works), or one held in
 * memory (a test, a story). A hash's links carry the page's own path and
 * query before it (/Kubernetes#/k/pods.v1): to the browser the same page,
 * and to a host that takes a link of #… for another site's (a platform's
 * web UI may), one of its own.
 */

export interface Router {
  readonly path: ReadonlySignal<string>;
  navigate(to: string, options?: { replace?: boolean }): void;
  /** A step back (as the browser's Back). */
  back(): void;
  href(to: string): string;
  close(): void;
}

/** A path as the page has it: from the root, no hash; none: the root. */
export function pathOf(hash: string): string {
  const path = hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

/**
 * The page's path a link goes to, if it is the page's own (#/…, or the
 * page's path and query and then #/…); null: it goes elsewhere.
 */
export function linkPath(href: string, here: { pathname: string; search: string } = window.location): string | null {
  if (href.startsWith('#/')) return href.slice(1);
  const own = `${here.pathname}${here.search}#/`;
  return href.startsWith(own) ? href.slice(own.length - 1) : null;
}

/** The window's hash: followed as it changes, changed to go elsewhere. */
export function hashRouter(win: Window = window): Router {
  const path = signal(pathOf(win.location.hash));
  const follow = () => {
    path.value = pathOf(win.location.hash);
  };
  win.addEventListener('hashchange', follow);
  return {
    path,
    navigate(to, options) {
      if (options?.replace) win.history.replaceState(win.history.state, '', `#${to}`);
      else win.location.hash = to;
      follow();
    },
    back: () => win.history.back(),
    href: (to) => `${win.location.pathname}${win.location.search}#${to}`,
    close: () => win.removeEventListener('hashchange', follow),
  };
}

/** A path held in memory (a test, a story): where it went, kept (history). */
export function memoryRouter(initial = '/'): Router & { readonly history: readonly string[] } {
  const path = signal(initial);
  const history = [initial];
  let at = 0;
  return {
    path,
    history,
    navigate(to, options) {
      // Gone back, then elsewhere: what was ahead is forgotten (as a browser's history).
      history.splice(at + 1);
      if (options?.replace) history[at] = to;
      else at = history.push(to) - 1;
      path.value = to;
    },
    back() {
      if (at === 0) return;
      at--;
      path.value = history[at];
    },
    href: (to) => `#${to}`,
    close() {},
  };
}
