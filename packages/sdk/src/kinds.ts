import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { TOKENS, type Tokens } from '@overkube/uikit';
import { defineKind, type Problem } from '@overweave/core';
import { uiKinds } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';
import type { Notification } from './addon.ts';
import type { Say } from './say.ts';
import type { NavTabProps, ResourceProps } from './slots.ts';
import { canonicalLocale, isLabel, isPhrase, KEY, type Label, type Phrase } from './text.ts';

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
/** A region's name: its slot's last part (page.<page>.<region>), so no "." or ":"; its title, a label. */
const regions: Check = (v) => Array.isArray(v) && v.every((r) => typeof r?.name === 'string' && /^[^.:]+$/.test(r.name) && (r.title === undefined || isLabel(r.title)));
/** A path: from the root, its parts fixed or :named, a last * taking the rest (no query: that is the page's own). */
const path: Check = (v) => typeof v === 'string' && /^\/([^/*:?]+\/|:[\w-]+\/)*([^/*:?]*|:[\w-]+|\*)$/.test(v);

/** A validation of some fields: each, if given, as it should be (its code: what it should be). */
function fields(checks: Record<string, [Check, string]>) {
  return (spec: object): Problem[] | undefined => {
    const problems = Object.entries(checks)
      .filter(([field, [check]]) => (spec as Record<string, unknown>)[field] !== undefined && !check((spec as Record<string, unknown>)[field]))
      .map(([field, [, code]]) => ({ code, field }));
    return problems.length ? problems : undefined;
  };
}

const looks = { title: [isLabel, 'notText'], icon: [text, 'notText'], order: [finite, 'notANumber'] } as Record<string, [Check, string]>;

/** How an object is doing: the dots on tabs, "3 need a look". */
export interface Health {
  level: 'ok' | 'warn' | 'error';
  reason?: string;
}

/** How a kind of the cluster is shown. Named by the kind's id. */
export interface KindViewSpec {
  title: Label;
  /** Its Category's name. */
  category?: string;
  /** An icon's name (the kit's icons). */
  icon?: string;
  order?: number;
  hidden?: boolean;
  /** Kept at hand: a tab of its own (the user pins and unpins, as with a table's widths). */
  pinned?: boolean;
  health?: (object: KubeObject) => Health | undefined;
}

export const KindView = defineKind<KindViewSpec>()('KindView', {
  required: ['title'],
  createRight: behaviour,
  validate: fields({ ...looks, category: [text, 'notText'], hidden: [flag, 'notAFlag'], pinned: [flag, 'notAFlag'], health: [fn, 'notAFunction'] }),
  patchRights: { title: configure, category: configure, icon: configure, order: configure, hidden: configure, pinned: configure, health: behaviour },
});

/** A group of kinds, as the picker shows them. */
export interface CategorySpec {
  title: Label;
  icon?: string;
  order?: number;
}

export const Category = defineKind<CategorySpec>()('Category', {
  required: ['title'],
  validate: fields(looks),
  patchRights: { title: configure, icon: configure, order: configure },
});

/**
 * A column's value not there yet — its own data on its way (metrics, an
 * image's tags): its cell drawn waiting, sorted last. value: (pod) =>
 * metrics.get(pod) ?? PENDING.
 */
export const PENDING: unique symbol = Symbol.for('overkube.pending');

/** What a column's render is drawn with: the object, its kind, the column's value of it. */
export interface ColumnRenderProps<O extends KubeObject = KubeObject> {
  object: O;
  kind: KindInfo;
  value: unknown;
}

/** A column of kinds' tables: its value of each object (PENDING: not there yet), drawn as text unless it has a render (given ColumnRenderProps). */
export interface ColumnSpec {
  target: Target;
  header: Label;
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
    header: [isLabel, 'notText'],
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

/** A region of a page: a slot of its own, page.<page>.<region> (its name: no "." or ":"), drawn under what fills the page when something fills it. */
export interface Region {
  name: string;
  title?: Label;
  order?: number;
  layout?: 'stack' | 'row' | 'grid';
}

/**
 * Where a page is, what its slots (and its regions') are given: the path's
 * parameters, what its * took, the page's own path (its query too, but what
 * is opened over it: that is the frame's); the kind its
 * :kind names, found (none: not served, or not yet known — what fills the
 * page says so).
 */
export interface PageProps {
  params: Readonly<Record<string, string>>;
  rest: string;
  path: string;
  kind?: KindInfo;
}

/**
 * A page of the dashboard at a path: '/k/:kind' (KIND_PAGE: a :kind is a
 * kind's ref), '/certs/*' (an addon's own, its pages under it:
 * usePageProps().rest). Empty but for what fills it: its slot (page.<name>,
 * slots.page(name)), in order — then its regions, each a slot of its own.
 * Its name is its addon's, as any (cert-manager.certs); its path its own
 * (none patches it: links to it stay links). Its slots are declared by its
 * owner (Slot page.<name>, page.<name>.<region>) for the user to arrange
 * what is in them — the core declares its own. The most specific path takes
 * a path (more fixed parts first); between equals, the stronger layer's, by
 * order, then name. A title: it is shown where pages are (the navigation),
 * as a kind is — pinned (kept at hand: a tab), hidden (not listed). A
 * resource opened (?open=) is drawn over any page.
 */
export interface PageSpec {
  path: string;
  title?: Label;
  icon?: string;
  order?: number;
  /** Kept at hand: a tab of its own. */
  pinned?: boolean;
  /** Not listed in the navigation (still there at its path). */
  hidden?: boolean;
  regions?: Region[];
}

export const Page = defineKind<PageSpec>()('Page', {
  required: ['path'],
  createRight: behaviour,
  validate: fields({ ...looks, path: [path, 'notAPath'], pinned: [flag, 'notAFlag'], hidden: [flag, 'notAFlag'], regions: [regions, 'notRegions'] }),
  patchRights: { title: configure, icon: configure, order: configure, pinned: configure, hidden: configure, regions: configure },
  merge: { lists: { regions: { key: 'name' } } },
});

/** Something done to an object (its view's actions): the page draws its button, asks first when it is dangerous, tells the cluster's refusal. */
export interface ActionSpec {
  target: Target;
  title: Label;
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

/**
 * What a context menu is opened on (its subject), and what its items are
 * given about it. An addon may say one of its own (an interface merged into
 * this one: declare module '@overkube/sdk').
 */
export interface MenuSubjects {
  'resource.context': ResourceContext;
  'nav.tabs.tab.context': NavTabContext;
}

/** A resource of the cluster, its menu opened (a table's row; one opened over the page: opened): its kind, the object. */
export interface ResourceContext extends ResourceProps {
  opened?: boolean;
}

/** A tab of the navigation, its menu opened: as it is drawn (where it leads, pinned, the page there), and what can be done to it — pinned or not, closed (focus kept on it, or given to its neighbour). */
export interface NavTabContext extends NavTabProps {
  pin(on: boolean): void;
  close(): void;
}
export type MenuSubject = keyof MenuSubjects & string;

/**
 * An item of the context menu of a subject: shown where when says (none:
 * always), in its group — open, state, copy, one of its own (after those),
 * danger last whatever it says. Its title, icon, order, group, keys and
 * whether it is hidden are anyone's to change; what it does, the addon's.
 */
export interface MenuItemSpec {
  on: string;
  title: Label;
  icon?: string;
  /** Its group: open (to go somewhere), state (a thing's state: pinned), copy, or one of its own. */
  group?: string;
  order?: number;
  /** Its keys, shown at its end ("delete"). */
  keys?: string;
  /** What it does cannot be taken back: last, apart. */
  danger?: boolean;
  hidden?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: given its subject's (menuItem() types it).
  when?: (subject: any) => boolean;
  // biome-ignore lint/suspicious/noExplicitAny: given its subject's (menuItem() types it).
  run: (subject: any, page: MenuPage) => Promise<unknown> | unknown;
}

/** What a menu's item may do on the page: where it is, go elsewhere, tell the user (in the page's language: say). */
export interface MenuPage {
  readonly path: string;
  navigate(to: string): void;
  notify(notification: Notification): string;
  say: Say;
}

export const MenuItem = defineKind<MenuItemSpec>()('MenuItem', {
  required: ['on', 'title', 'run'],
  createRight: behaviour,
  validate: fields({
    ...looks,
    on: [text, 'notText'],
    group: [text, 'notText'],
    keys: [text, 'notText'],
    danger: [flag, 'notAFlag'],
    hidden: [flag, 'notAFlag'],
    when: [fn, 'notAFunction'],
    run: [fn, 'notAFunction'],
  }),
  patchRights: {
    on: behaviour,
    title: configure,
    icon: configure,
    group: configure,
    order: configure,
    keys: configure,
    hidden: configure,
    danger: behaviour,
    when: behaviour,
    run: behaviour,
  },
});

/** How the page's navigation is drawn: as tabs across the top, or down the side — there collapsed (marks only) or pinned (wide) at first. One, named 'default'. */
export interface NavViewSpec {
  mode?: 'tabs' | 'side';
  side?: 'collapsed' | 'pinned';
}

export const NavView = defineKind<NavViewSpec>()('NavView', {
  validate: fields({ mode: [(v) => v === 'tabs' || v === 'side', 'notAMode'], side: [(v) => v === 'collapsed' || v === 'pinned', 'notASide'] }),
  patchRights: { mode: configure, side: configure },
});

/**
 * A colour scheme (and corners, fonts): the kit's tokens it changes, in its
 * dark and its light variant — those it says not, the kit's own; its corners
 * and fonts, said in either, are the same in both. Added by
 * an addon (behaviour); its tokens patched by anyone, the user too
 * (configure): one colour changed, the others kept (key by key).
 */
export interface ThemeSpec {
  title: string;
  dark?: Tokens;
  light?: Tokens;
}

/** The kit's tokens, by name (one it has not: refused — not dropped unseen), each a CSS value. */
const tokens: Check = (v) => mapOf(text)(v) && Object.keys(v as object).every((name) => (TOKENS as readonly string[]).includes(name));

export const Theme = defineKind<ThemeSpec>()('Theme', {
  required: ['title'],
  createRight: behaviour,
  validate: fields({ title: [text, 'notText'], dark: [tokens, 'notTokens'], light: [tokens, 'notTokens'] }),
  patchRights: { title: configure, dark: configure, light: configure },
  merge: { maps: ['dark', 'light'] },
});

/** How the page looks: its theme (by name), dark, light or as the system is. One, named 'default'. */
export interface AppearanceSpec {
  theme?: string;
  mode?: 'system' | 'dark' | 'light';
}

export const Appearance = defineKind<AppearanceSpec>()('Appearance', {
  validate: fields({ theme: [text, 'notText'], mode: [(v) => v === 'system' || v === 'dark' || v === 'light', 'notAMode'] }),
  patchRights: { theme: configure, mode: configure },
});

/**
 * What is said in a language, of one addon's keys: named <locale>:<addon>
 * (pl:images, de:core) — its language in its name, its keys that addon's
 * (images.…). An addon's own, or a language pack's for another (in that
 * addon's name; one it ships itself, a pack patches). Its phrases patched
 * by anyone, the user too, key by key.
 */
export interface MessagesSpec {
  messages: Readonly<Record<string, Phrase>>;
}

const phrases: Check = (v) => mapOf(isPhrase)(v) && Object.keys(v as object).every((key) => KEY.test(key));

export const Messages = defineKind<MessagesSpec>()('Messages', {
  required: ['messages'],
  validate: fields({ messages: [phrases, 'notPhrases'] }),
  patchRights: { messages: configure },
  merge: { maps: ['messages'] },
});

/** The language the page is in: one named 'default' (system: the browser's). */
export interface LanguageSpec {
  locale?: string;
}

export const Language = defineKind<LanguageSpec>()('Language', {
  validate: fields({ locale: [(v) => v === 'system' || (typeof v === 'string' && canonicalLocale(v) !== undefined), 'notALocale'] }),
  patchRights: { locale: configure },
});

/** The dashboard's own kinds (the UI's beside them). */
export const kubeOwnKinds = [KindView, Category, Column, TableView, Page, Action, MenuItem, NavView, Theme, Appearance, Messages, Language] as const;

/** Every kind the dashboard has: its registry is made of them. */
export const kubeKinds = [ui.Slot, ui.Fill, ui.Wrap, ...kubeOwnKinds] as const;
export type KubeKinds = typeof kubeKinds;
