import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * Where the page is, as a path ('/k/pods.v1'): the window's hash
 * (#/k/pods.v1 — a reload or a link keeps it, Back works), or one held in
 * memory (a test, a story).
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
    href: (to) => `#${to}`,
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
