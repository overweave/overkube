import type { ReadonlySignal } from '@preact/signals';
import { type ComponentChildren, createContext, h } from 'preact';
import { useContext } from 'preact/hooks';
import type { Notification } from '../addon.ts';
import type { PageProps } from '../kinds.ts';

/*
 * What the page gives its components, whoever draws it (the shell: the
 * page, a test, a story): where it is and how to go elsewhere, the user
 * told things, a definition's failure told as its owner's — under a page,
 * that page's props; over it, the resource opened (closing it).
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
const PagePropsContext = createContext<PageProps | null>(null);
const OpenedContext = createContext<Opened | null>(null);

/** What the components below are given: the shell's (or a test's). */
export function PageProvider({ value, children }: { value: PageValue; children?: ComponentChildren }) {
  return h(PageContext.Provider, { value }, children);
}
PageProvider.displayName = 'Overkube.PageProvider';

/** A page's props, for what is drawn on it. */
export function PagePropsProvider({ value, children }: { value: PageProps; children?: ComponentChildren }) {
  return h(PagePropsContext.Provider, { value }, children);
}
PagePropsProvider.displayName = 'Overkube.PagePropsProvider';

/** A resource opened over the page (?open=): closing it — back to the page as it was when it was opened from it, else the page with nothing open; gone elsewhere since, nothing. */
export interface Opened {
  close(): void;
}

/** The resource opened, for what draws it (resource.view's fills). */
export function OpenedProvider({ value, children }: { value: Opened; children?: ComponentChildren }) {
  return h(OpenedContext.Provider, { value }, children);
}
OpenedProvider.displayName = 'Overkube.OpenedProvider';

export function usePage(): PageValue {
  const page = useContext(PageContext);
  if (!page) throw new Error('no PageProvider above: the page is given by the shell');
  return page;
}

/** The page drawn: its parameters (:kind), what its * took (an addon's own pages), the path, the kind. */
export function usePageProps(): PageProps {
  const props = useContext(PagePropsContext);
  if (!props) throw new Error('not under a page: usePageProps is for what fills a Page');
  return props;
}

/** The resource opened over the page: closing it (drawn as resource.view's fill). */
export function useOpened(): Opened {
  const opened = useContext(OpenedContext);
  if (!opened) throw new Error('nothing opened: useOpened is for what draws resource.view');
  return opened;
}

/** Go somewhere: navigate('/k/pods.v1'). */
export function useNavigate(): PageValue['navigate'] {
  return usePage().navigate;
}

/** Tell the user something. */
export function useNotify(): PageValue['notify'] {
  return usePage().notify;
}
