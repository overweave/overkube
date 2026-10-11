import type { ReadonlySignal } from '@preact/signals';
import { type ComponentChildren, createContext, h } from 'preact';
import { useContext } from 'preact/hooks';
import type { Notification } from '../addon.ts';
import type { RouteProps } from '../kinds.ts';

/*
 * What the page gives its components, whoever draws it (the shell: the
 * page, a test, a story): where it is and how to go elsewhere, the user
 * told things, a definition's failure told as its owner's — and, under a
 * route, that route's parameters.
 */

/** A notification shown: its id, and who told it. */
export interface Shown extends Notification {
  id: string;
  /** The addon that told it (none: the page). */
  from?: string;
}

/** A context menu open: on what (its subject, and what is said of it), where, how. */
export interface OpenMenu {
  /** A new one each time one opens. */
  id: number;
  on: string;
  subject: unknown;
  /** Where (the window's coordinates): the pointer, or under the element (above: its top, where it opens up from). */
  at: { x: number; y: number; above?: number };
  /** Opened by the keyboard: its first item taken at once. */
  keyboard: boolean;
  /** What it is on, at its top ("Pods"). */
  title?: string;
}

export interface PageValue {
  /** Where the page is: a path ('/k/pods.v1'). */
  readonly path: ReadonlySignal<string>;
  /** Go there ('/k/pods.v1'); replace: not a step Back goes back to. */
  navigate(to: string, options?: { replace?: boolean }): void;
  /** A step back. */
  back(): void;
  /** A link's href for a path ('#/k/pods.v1'). */
  href(to: string): string;
  /** What is shown to the user now. */
  readonly notifications: ReadonlySignal<readonly Shown[]>;
  notify(notification: Notification): string;
  dismiss(id: string): void;
  /** A notification's time stopped (the pointer on it) or let run again. */
  hold(id: string, held: boolean): void;
  /** The context menu open, if one is (one at a time; closed as the page goes elsewhere). */
  readonly menu: ReadonlySignal<OpenMenu | null>;
  openMenu(menu: Omit<OpenMenu, 'id'>): void;
  closeMenu(): void;
  /** A definition's function failed (a column's value, a filter): told as whoever says that field — once the drawing is done, each once. */
  report(definition: { kind: string; name: string }, field: string, error: unknown): void;
}

const PageContext = createContext<PageValue | null>(null);
const RouteContext = createContext<RouteProps | null>(null);

/** What the components below are given: the shell's (or a test's). */
export function PageProvider({ value, children }: { value: PageValue; children?: ComponentChildren }) {
  return h(PageContext.Provider, { value }, children);
}
PageProvider.displayName = 'Overkube.PageProvider';

/** A route's parameters, for what is drawn under it. */
export function RouteProvider({ value, children }: { value: RouteProps; children?: ComponentChildren }) {
  return h(RouteContext.Provider, { value }, children);
}
RouteProvider.displayName = 'Overkube.RouteProvider';

export function usePage(): PageValue {
  const page = useContext(PageContext);
  if (!page) throw new Error('no PageProvider above: the page is given by the shell');
  return page;
}

/** The route drawn: its parameters (:kind), what its * took (an addon's own pages), the path. */
export function useRoute(): RouteProps {
  const route = useContext(RouteContext);
  if (!route) throw new Error('not under a route: useRoute is for what a Route draws');
  return route;
}

/** Go somewhere: navigate('/k/pods.v1'). */
export function useNavigate(): PageValue['navigate'] {
  return usePage().navigate;
}

/** Tell the user something. */
export function useNotify(): PageValue['notify'] {
  return usePage().notify;
}
