import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { defineKind, type Problem } from '@overweave/core';
import { uiKinds } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';

/*
 * What the dashboard is made of, as kinds of overweave: anything shown is a
 * definition of one of them, and anyone — the core, the built-in features,
 * addons, the user — adds definitions of their own or patches others',
 * each at its priority, with its rights:
 *
 *   configure    how things look: titles, order, widths, what is hidden (everyone, the user too)
 *   behaviour    what they do: values, renders, health, filters, actions (addons, not the user)
 *
 * Adding something that does anything (a Column, an Action, a kind's views,
 * the UI's Fill and Wrap) is behaviour too — an add says every field at
 * once — and so is what it is for (a target): a value or a render is written
 * for its kinds' objects, not moved to others. Each kind checks its fields'
 * values: what would only break when drawn is refused when said.
 *
 * A kind's views (KindView, TableView) are one definition per kind of the
 * cluster, named by its id ('v1/Pod', 'apps/v1/Deployment'): the core adds
 * them for every kind the cluster serves, the others patch the ones they
 * know of — so what each says of a kind is layered by overweave itself.
 */

export const RIGHTS = { configure: 'configure', behaviour: 'behaviour' } as const;
export type Right = (typeof RIGHTS)[keyof typeof RIGHTS];

/** Which kinds of the cluster something is for, by their ids ('v1/Pod'); no kinds: every one. */
export interface Target {
  kinds?: readonly string[];
}

/** The UI's own kinds (Slot, Fill, Wrap), drawn with Preact, their targets kinds of the cluster; strict: a render is behaviour all through. */
export const ui = uiKinds<PreactComponent, Target>()(RIGHTS, { strict: true });

const { configure, behaviour } = RIGHTS;

// ── Checks of the fields' values ───────────────────────────────────────────

type Check = (value: unknown) => boolean;
const text: Check = (v) => typeof v === 'string';
const finite: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const flag: Check = (v) => typeof v === 'boolean';
const fn: Check = (v) => typeof v === 'function';
const texts: Check = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const mapOf =
  (check: Check): Check =>
  (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(check);
const target: Check = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && ((v as Target).kinds === undefined || texts((v as Target).kinds));
const sort: Check = (v) =>
  typeof v === 'object' && v !== null && text((v as { column?: unknown }).column) && [undefined, true, false].includes((v as { descending?: unknown }).descending as never);
/** A region's name: a slot's part, so no ":" (page:<page>:<region>). */
const regions: Check = (v) => Array.isArray(v) && v.every((r) => typeof r?.name === 'string' && /^[^:]+$/.test(r.name));

/** A validation of some fields: each, if given, as it should be (its code: what it should be). */
function fields(checks: Record<string, [Check, string]>) {
  return (spec: object): Problem[] | undefined => {
    const problems = Object.entries(checks)
      .filter(([field, [check]]) => (spec as Record<string, unknown>)[field] !== undefined && !check((spec as Record<string, unknown>)[field]))
      .map(([field, [, code]]) => ({ code, field }));
    return problems.length ? problems : undefined;
  };
}

const looks = { title: [text, 'notText'], icon: [text, 'notText'], order: [finite, 'notANumber'] } as Record<string, [Check, string]>;

/** How an object is doing: the dots on tabs, "3 need a look". */
export interface Health {
  level: 'ok' | 'warn' | 'error';
  reason?: string;
}

/** How a kind of the cluster is shown. Named by the kind's id. */
export interface KindViewSpec {
  title: string;
  /** Its Category's name. */
  category?: string;
  /** An icon's name (the kit's icons). */
  icon?: string;
  order?: number;
  hidden?: boolean;
  health?: (object: KubeObject) => Health | undefined;
}

export const KindView = defineKind<KindViewSpec>()('KindView', {
  required: ['title'],
  createRight: behaviour,
  validate: fields({ ...looks, category: [text, 'notText'], hidden: [flag, 'notAFlag'], health: [fn, 'notAFunction'] }),
  patchRights: { title: configure, category: configure, icon: configure, order: configure, hidden: configure, health: behaviour },
});

/** A group of kinds, as the picker shows them. */
export interface CategorySpec {
  title: string;
  icon?: string;
  order?: number;
}

export const Category = defineKind<CategorySpec>()('Category', {
  required: ['title'],
  validate: fields(looks),
  patchRights: { title: configure, icon: configure, order: configure },
});

/** What a column's render is drawn with: the object, its kind, the column's value of it. */
export interface ColumnRenderProps<O extends KubeObject = KubeObject> {
  object: O;
  kind: KindInfo;
  value: unknown;
}

/** A column of kinds' tables: its value of each object, drawn as text unless it has a render (given ColumnRenderProps). */
export interface ColumnSpec {
  target: Target;
  header: string;
  value: (object: KubeObject) => unknown;
  render?: PreactComponent;
  width?: number;
  order?: number;
}

export const Column = defineKind<ColumnSpec>()('Column', {
  required: ['target', 'header', 'value'],
  createRight: behaviour,
  validate: fields({
    target: [target, 'notATarget'],
    header: [text, 'notText'],
    value: [fn, 'notAFunction'],
    render: [fn, 'notAFunction'],
    width: [finite, 'notANumber'],
    order: [finite, 'notANumber'],
  }),
  patchRights: { target: behaviour, header: configure, width: configure, order: configure, value: behaviour, render: behaviour },
});

/** How a kind's table is set out. Named by the kind's id. */
export interface TableViewSpec {
  /** Columns first in this order (by name); the others after, in theirs. */
  columns?: string[];
  hidden?: Record<string, boolean>;
  widths?: Record<string, number>;
  sort?: { column: string; descending?: boolean };
  /** Which objects it shows (none: all). */
  filter?: (object: KubeObject) => boolean;
}

export const TableView = defineKind<TableViewSpec>()('TableView', {
  createRight: behaviour,
  validate: fields({
    columns: [texts, 'notNames'],
    hidden: [mapOf(flag), 'notFlags'],
    widths: [mapOf(finite), 'notNumbers'],
    sort: [sort, 'notASort'],
    filter: [fn, 'notAFunction'],
  }),
  patchRights: { columns: configure, hidden: configure, widths: configure, sort: configure, filter: behaviour },
  merge: { maps: ['hidden', 'widths'] },
});

/** A region of a page: a slot of its own, page:<page>:<region> (its name: no ":"). */
export interface Region {
  name: string;
  title?: string;
  order?: number;
  layout?: 'stack' | 'row' | 'grid';
}

/** A page: its regions are slots others fill (slots.page). */
export interface PageSpec {
  title: string;
  /** Shown as a tab of its own. */
  tab?: boolean;
  icon?: string;
  order?: number;
  regions: Region[];
}

export const Page = defineKind<PageSpec>()('Page', {
  required: ['title', 'regions'],
  validate: fields({ ...looks, tab: [flag, 'notAFlag'], regions: [regions, 'notRegions'] }),
  patchRights: { title: configure, tab: configure, icon: configure, order: configure, regions: configure },
  merge: { lists: { regions: { key: 'name' } } },
});

/** Something done to an object (its view's actions): the page draws its button, asks first when it is dangerous, tells the cluster's refusal. */
export interface ActionSpec {
  target: Target;
  title: string;
  icon?: string;
  order?: number;
  dangerous?: boolean;
  /** Whether it applies to this object (none: always). */
  when?: (object: KubeObject) => boolean;
  run: (object: KubeObject) => Promise<unknown> | unknown;
}

export const Action = defineKind<ActionSpec>()('Action', {
  required: ['target', 'title', 'run'],
  createRight: behaviour,
  validate: fields({ ...looks, target: [target, 'notATarget'], dangerous: [flag, 'notAFlag'], when: [fn, 'notAFunction'], run: [fn, 'notAFunction'] }),
  patchRights: { target: behaviour, title: configure, icon: configure, order: configure, dangerous: behaviour, when: behaviour, run: behaviour },
});

/** The dashboard's own kinds (the UI's beside them). */
export const kubeOwnKinds = [KindView, Category, Column, TableView, Page, Action] as const;

/** Every kind the dashboard has: its registry is made of them. */
export const kubeKinds = [ui.Slot, ui.Fill, ui.Wrap, ...kubeOwnKinds] as const;
export type KubeKinds = typeof kubeKinds;
