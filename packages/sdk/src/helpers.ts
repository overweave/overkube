import type { ObjectOfKind } from '@overkube/client';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { FillSpec } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';
import type { ComponentType } from 'preact';
import type { ActionSpec, ColumnRenderProps, ColumnSpec, Target } from './kinds.ts';
import { type ObjectProps, slots } from './slots.ts';
import { forKinds } from './target.ts';
import type { Label } from './text.ts';

/*
 * The usual definitions, typed by the kinds they are for: each gives a spec
 * to add — contributor.add('Column', 'images.tag', column({ kinds: [Pod], … })).
 * A function given is typed by the kinds' objects (a Pod's column gets
 * Pods), so the kinds are said whenever it is: without them, it is every
 * kind's, and gets any object. An empty list is for no kind.
 */

/** Some kinds, at least one. */
type Kinds = readonly [KindInfo, ...KindInfo[]];

/** Objects of any of these kinds. */
type ObjectOfAny<KS extends readonly KindInfo[]> = KS[number] extends infer K ? (K extends KindInfo ? ObjectOfKind<K> : never) : never;

const targetOf = (kinds: readonly KindInfo[] | undefined): Target => (kinds === undefined ? {} : forKinds(...kinds));

interface ColumnOf<O extends KubeObject> {
  header: Label;
  value: (object: O) => unknown;
  render?: ComponentType<ColumnRenderProps<O>>;
  width?: number;
  order?: number;
}

/** A column of these kinds' tables. */
export function column<const KS extends Kinds>(spec: { kinds: KS } & ColumnOf<ObjectOfAny<KS>>): ColumnSpec;
/** A column of every kind's tables — or of kinds known only as it runs (its function gets any object). */
export function column(spec: { kinds?: readonly KindInfo[] } & ColumnOf<KubeObject>): ColumnSpec;
export function column(spec: { kinds?: readonly KindInfo[] } & ColumnOf<KubeObject>): ColumnSpec {
  const { kinds, ...rest } = spec;
  return { ...rest, target: targetOf(kinds), render: spec.render as PreactComponent | undefined };
}

interface SectionOf<O extends KubeObject> {
  title?: string;
  order?: number;
  after?: string;
  when?: (props: { kind: KindInfo; object: O }) => boolean;
  render: ComponentType<{ kind: KindInfo; object: O }>;
}

/** A section of these kinds' objects' views. */
export function section<const KS extends Kinds>(spec: { kinds: KS } & SectionOf<ObjectOfAny<KS>>): FillSpec<ObjectProps, PreactComponent, Target>;
/** A section of every kind's objects' views — or of kinds known only as it runs (its function gets any object). */
export function section(spec: { kinds?: readonly KindInfo[] } & SectionOf<KubeObject>): FillSpec<ObjectProps, PreactComponent, Target>;
export function section(spec: { kinds?: readonly KindInfo[] } & SectionOf<KubeObject>): FillSpec<ObjectProps, PreactComponent, Target> {
  const { kinds, ...rest } = spec;
  return { ...rest, slot: slots.object.sections.name, target: targetOf(kinds), render: spec.render as PreactComponent };
}

interface ActionOf<O extends KubeObject> {
  title: Label;
  icon?: string;
  order?: number;
  dangerous?: boolean;
  when?: (object: O) => boolean;
  run: (object: O) => Promise<unknown> | unknown;
}

/** An action on these kinds' objects: the page draws its button. */
export function action<const KS extends Kinds>(spec: { kinds: KS } & ActionOf<ObjectOfAny<KS>>): ActionSpec;
/** An action on every kind's objects — or of kinds known only as it runs (its function gets any object). */
export function action(spec: { kinds?: readonly KindInfo[] } & ActionOf<KubeObject>): ActionSpec;
export function action(spec: { kinds?: readonly KindInfo[] } & ActionOf<KubeObject>): ActionSpec {
  const { kinds, ...rest } = spec;
  return { ...rest, target: targetOf(kinds) };
}

/** Something on a page's region: a tile of the overview, a panel. */
export function tile(
  page: string,
  region: string,
  spec: { title?: string; order?: number; after?: string; when?: () => boolean; render: ComponentType<Record<string, never>> },
): FillSpec<Record<string, never>, PreactComponent, Target> {
  return { ...spec, slot: slots.page(page, region).name, render: spec.render as PreactComponent };
}
