import type { KindInfo, KubeObject, ObjectOf } from '@overkube/kube-types';
import { kinds } from '@overkube/kube-types';
import type { FillSpec, Placement, WrapSpec } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';
import type { ComponentChildren, ComponentType } from 'preact';
import type { KubeContributor } from './addon.ts';
import type { ActionSpec, ColumnSpec, MenuItemSpec, MenuPage, MenuSubject, MenuSubjects, NameMarkSpec, Need, PageProps, Target } from './kinds.ts';
import { type ResourceProps, slots } from './slots.ts';
import { forKinds } from './target.ts';
import type { Label } from './text.ts';

/*
 * The usual definitions, their target said by the kinds they are for:
 * each gives a spec to add — contributor.add('Column', 'images.tag',
 * column({ kinds: [Pod], … })). A function given an object (a section's,
 * an action's) is typed by the kinds' objects (a Pod's section gets Pods):
 * without kinds, it is every kind's, and gets any object. An empty list is
 * for no kind.
 */

/** Some kinds, at least one. */
type Kinds = readonly [KindInfo, ...KindInfo[]];

/** Objects of any of these kinds. */
type ObjectOfAny<KS extends readonly KindInfo[]> = KS[number] extends infer K ? (K extends KindInfo ? ObjectOfKind<K> : never) : never;

/** A kind's objects' type: its own when the kinds table knows it, else any object's. */
export type ObjectOfKind<K extends KindInfo> = [ObjectOf<K>] extends [never] ? KubeObject : ObjectOf<K>;

const targetOf = (kinds: readonly KindInfo[] | undefined): Target => (kinds === undefined ? {} : forKinds(...kinds));

/** A column of these kinds' tables (none: every kind's): ColumnSpec, its target said by its kinds. */
export function column(spec: { kinds?: readonly KindInfo[] } & Omit<ColumnSpec, 'target'>): ColumnSpec {
  const { kinds, ...rest } = spec;
  return { ...rest, target: targetOf(kinds) };
}

interface SectionOf<O extends KubeObject> extends Placement {
  /** What it is, to the user (a list of what fills a slot, the slot overlay) — not drawn: a section draws its own heading (uikit's Section). */
  title?: string;
  when?: (props: { kind: KindInfo; object: O }) => boolean;
  render: ComponentType<{ kind: KindInfo; object: O }>;
}

/** A section of these kinds' objects' views. */
export function section<const KS extends Kinds>(spec: { kinds: KS } & SectionOf<ObjectOfAny<KS>>): FillSpec<ResourceProps, PreactComponent, Target>;
/** A section of every kind's objects' views — or of kinds known only as it runs (its function gets any object). */
export function section(spec: { kinds?: readonly KindInfo[] } & SectionOf<KubeObject>): FillSpec<ResourceProps, PreactComponent, Target>;
export function section(spec: { kinds?: readonly KindInfo[] } & SectionOf<KubeObject>): FillSpec<ResourceProps, PreactComponent, Target> {
  const { kinds, ...rest } = spec;
  return { ...rest, slot: slots.resource.view.sections.name, target: targetOf(kinds), render: spec.render as PreactComponent };
}

interface ActionOf<O extends KubeObject> {
  title: Label;
  icon?: string;
  order?: number;
  dangerous?: boolean;
  when?: (object: O) => boolean;
  run: (object: O) => Promise<unknown> | unknown;
  /** What it needs of the cluster (each), for the object's kind unless it says: one who may not, not shown it. */
  needs?: Need[];
}

/** An action on these kinds' objects: the page draws its button. */
export function action<const KS extends Kinds>(spec: { kinds: KS } & ActionOf<ObjectOfAny<KS>>): ActionSpec;
/** An action on every kind's objects — or of kinds known only as it runs (its function gets any object). */
export function action(spec: { kinds?: readonly KindInfo[] } & ActionOf<KubeObject>): ActionSpec;
export function action(spec: { kinds?: readonly KindInfo[] } & ActionOf<KubeObject>): ActionSpec {
  const { kinds, ...rest } = spec;
  return { ...rest, target: targetOf(kinds) };
}

/** An item of a subject's context menu: its when and run given that subject's (a tab's: MenuSubjects['nav.tabs.tab.context']). */
export function menuItem<const S extends MenuSubject>(
  spec: Omit<MenuItemSpec, 'on' | 'when' | 'run'> & {
    on: S;
    when?: (subject: MenuSubjects[S]) => boolean;
    run: (subject: MenuSubjects[S], page: MenuPage) => Promise<unknown> | unknown;
  },
): MenuItemSpec {
  return spec;
}

/** Something on a page's region: a tile of the overview, a panel — given the page's props; for some kinds (the page's :kind), or every one. */
export function tile(
  page: string,
  region: string,
  spec: Placement & { kinds?: readonly KindInfo[]; title?: string; when?: (props: PageProps) => boolean; render: ComponentType<PageProps> },
): FillSpec<PageProps, PreactComponent, Target> {
  const { kinds, ...rest } = spec;
  return { ...rest, slot: slots.page(page, region).name, ...(kinds ? { target: targetOf(kinds) } : {}), render: spec.render as PreactComponent };
}

/**
 * Drawn around a fill, or a column's cells (its name), typed by what it is
 * given: wrap<PageProps>('core.page.kind.table', { kinds: [Certificate],
 * render: Certs }). For some kinds (its props' kind), or every one; when it
 * holds. It draws its children (a decoration), or not (in place of what it
 * wraps: give it a low order — 0 — and decorations stay around it).
 */
export function wrap<P>(
  wraps: string,
  spec: Placement & { kinds?: readonly KindInfo[]; when?: (props: P) => boolean; render: ComponentType<P & { children?: ComponentChildren }> },
): WrapSpec<P, PreactComponent, Target> {
  const { kinds, ...rest } = spec;
  return { ...rest, wraps, ...(kinds ? { target: targetOf(kinds) } : {}), render: spec.render as PreactComponent };
}

/** What a workload runs, by the workload it is of (kube-fields' <kind>.workload fields — their names, these kinds: kept in step with them): a deployment's pods and replica sets, a stateful set's and a daemon set's pods. */
const RUN = [
  ['deployments.v1.apps', [kinds.core.v1.Pod, kinds.apps.v1.ReplicaSet]],
  ['statefulsets.v1.apps', [kinds.core.v1.Pod]],
  ['daemonsets.v1.apps', [kinds.core.v1.Pod]],
] as const;
const refOf = (k: KindInfo) => (k.group ? `${k.plural}.${k.version}.${k.group}` : `${k.plural}.${k.version}`);

/**
 * A mark beside a name (NameMark) — and on what a workload runs, its
 * workload's: a pod's, a replica set's mark is its deployment's (its
 * stateful set's, its daemon set's), joined once of each workload kind by
 * the workload it is of. Its field is the workload's too (none of kinds,
 * or theirs among them). What it costs: a table of pods watches those
 * workloads (of its namespaces), once for every mark joined of them.
 */
export function addNameMark(c: KubeContributor, name: string, spec: NameMarkSpec): void {
  c.add('NameMark', name, spec);
  for (const [from, runs] of RUN)
    for (const k of runs) {
      const field = `${spec.field}.of.${refOf(k)}.${from}`;
      c.add('Field', field, { kinds: [refOf(k)], type: 'string', value: { from, field: spec.field, by: `${refOf(k)}.workload`, to: `${from}.workload`, reduce: 'min' } });
      c.add('NameMark', `${name}.${refOf(k)}.${from}`, { ...spec, target: forKinds(k), field });
    }
}
