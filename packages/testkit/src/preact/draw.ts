import { kindMatcher } from '@overkube/sdk';
import { KubeProvider, type Shown } from '@overkube/sdk/preact';
import { Frame, failureField, memoryRouter, ShellProvider } from '@overkube/shell';
import { type Mounted, type MountOptions, mount as mountTree, type RenderedSlot, renderSlot as renderOne } from '@overweave/testkit/preact';
import type { SlotRef } from '@overweave/ui';
import { type ComponentChildren, h } from 'preact';
import type { KubeWorld } from '../world.ts';

/** The world's cluster around the tree, the app's own providers (if given) around that. */
function options(world: KubeWorld, given: MountOptions = {}): MountOptions {
  const Outer = given.wrapper;
  const wrapper = ({ children }: { children?: ComponentChildren }) => {
    const inner = h(KubeProvider, { cluster: world.cluster }, children);
    return Outer ? h(Outer, null, inner) : inner;
  };
  return { matcher: kindMatcher, ...given, wrapper };
}

/** Any tree drawn over the world: mount(w, <PodsOverview />). */
export function mount(world: KubeWorld, node: ComponentChildren, given?: MountOptions): Mounted {
  return mountTree(world, node, options(world, given));
}

/** A slot of the world drawn on its own: renderSlot(w, slots.resource.view.sections, { kind: Pod, object: pod }). */
export function renderSlot<P>(world: KubeWorld, slot: SlotRef<P> | string, props?: P, given?: MountOptions): RenderedSlot<P> {
  return (renderOne as (w: KubeWorld, s: SlotRef<P> | string, p?: P, o?: MountOptions) => RenderedSlot<P>)(world, slot, props, options(world, given));
}

/** A definition's function that failed while the page was drawn (a column's value, a render, a condition), as the page tells it. */
export interface Reported {
  definition: { kind: string; name: string };
  /** Which of its fields failed: value, render, when, target… */
  field: string;
  error: unknown;
}

/** The whole page drawn over the world, at a path — read as its user sees it. */
export interface RenderedPage extends Omit<Mounted, 'failures'> {
  /** Where it is now. */
  readonly path: string;
  /** Go elsewhere (as a link does). */
  navigate(to: string): void;
  /** A step back (as the browser's Back). */
  back(): void;
  /** The table's column headers, in order. */
  headers(): string[];
  /** A column's cells, top to bottom, by its header. */
  column(header: string): string[];
  /** The links of a navigation, by its name (the core's: "Kinds"), as their text. */
  links(navigation: string): string[];
  /** The link of a navigation the page is at (aria-current), as its text. */
  current(navigation: string): string | undefined;
  /** What the user is told now. */
  notifications(): readonly Shown[];
  /** Every failure of a definition while drawn — a render's, a column's value, a condition — each once a drawing. */
  readonly failures: readonly Reported[];
}

const textOf = (el: Element) => (el.textContent ?? '').trim();

/**
 * The page as the shell draws it — its frame, the Page at the path, what
 * fills its slots — over the world's addons and cluster:
 * renderPage(w, '/k/pods.v1'). The path is held in memory (no window's
 * hash); what addons tell the user is the world's. Read by roles and names
 * (a table's, a navigation's), not by how the core lays them out.
 */
export function renderPage(world: KubeWorld, path = '/', given?: MountOptions): RenderedPage {
  const router = memoryRouter(path);
  const reported: Reported[] = [];
  const onFailure = (definition: Reported['definition'], field: string, error: unknown) => void reported.push({ definition, field, error });
  // In the kit's root, as the page is: its defaults, the theme over them.
  const view = mount(world, h('div', { class: 'uk-root' }, h(ShellProvider, { router, notifications: world.notifications, onFailure }, h(Frame, null))), given);
  // A drawing's failures (overweave's: a render, a condition) and the page's (a column's value), as one list.
  const drawn = view.failures;
  const failures = (): Reported[] => [
    ...drawn.map((f) => ({ definition: { kind: f.definition.kind, name: f.definition.name }, field: failureField(f), error: f.error })),
    ...reported,
  ];
  const table = () => view.container.querySelector('[role="table"]');
  const headers = () => [...(table()?.querySelectorAll('[role="columnheader"]') ?? [])].map(textOf);
  const nav = (name: string) => [...view.container.querySelectorAll('nav')].find((n) => n.getAttribute('aria-label') === name);
  const unmount = view.unmount;
  // Its path read when asked (a getter: Object.assign would copy what it is now); its failures, the page's.
  Object.defineProperty(view, 'path', { get: () => router.path.value, enumerable: true });
  Object.defineProperty(view, 'failures', { get: failures, enumerable: true });
  return Object.assign(view as unknown as RenderedPage, {
    navigate: (to: string) => view.act(() => router.navigate(to)),
    back: () => view.act(() => router.back()),
    headers: () => headers().filter(Boolean),
    column(header: string) {
      const at = headers().indexOf(header);
      if (at < 0) throw new Error(`no column "${header}" (${headers().filter(Boolean).join(', ') || 'no table'})`);
      return [...(table()?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])].map((row) => textOf(row.querySelectorAll('[role="cell"]')[at] ?? row));
    },
    links: (name: string) => [...(nav(name)?.querySelectorAll('a') ?? [])].map(textOf),
    current: (name: string) => {
      const at = nav(name)?.querySelector('a[aria-current="page"]');
      return at ? textOf(at) : undefined;
    },
    notifications: () => world.notifications.list.value,
    // Let go of with its notifications' timers.
    unmount() {
      world.notifications.close();
      unmount();
    },
  });
}
