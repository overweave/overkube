import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { checkFieldDef, type FieldName, type FieldType, type Path, type Unit, type Value, type Where } from '@overkube/query';
import { TOKENS, TONES, type Tokens, type Tone } from '@overkube/uikit';
import { defineKind, type Problem } from '@overweave/core';
import { uiKinds } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
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
 *   behaviour    what they do: fields, formats, renders, actions (addons, not the user)
 *   access       whether the one signed in may have it (the access layer's alone, over everyone's)
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

export const RIGHTS = { configure: 'configure', behaviour: 'behaviour', access: 'access' } as const;
export type Right = (typeof RIGHTS)[keyof typeof RIGHTS];

/** Which kinds of the cluster something is for, by their ids ('v1/Pod'); no kinds: every one. */
export interface Target {
  kinds?: readonly string[];
}

/** The UI's own kinds (Slot, Fill, Wrap), drawn with Preact, their targets kinds of the cluster; strict: a render is behaviour all through. */
export const ui = uiKinds<PreactComponent, Target>()({ configure: RIGHTS.configure, behaviour: RIGHTS.behaviour }, { strict: true });

const { configure, behaviour, access } = RIGHTS;

/**
 * What something needs of the cluster to be of use: a verb on a resource
 * (none: the kind it is shown for), its subresource ('log'), of an API
 * group ('' the core's; none: the kind's). Its definer says it; the access
 * layer says whether the one signed in may (its access).
 */
export interface Need {
  verb: string;
  group?: string;
  resource?: string;
  subresource?: string;
}

/** Whether it is shown, as the one signed in may: allowed; denied (not shown); marked (shown, marked as denied: debugging). */
export type Access = 'allowed' | 'denied' | 'marked';

/** What access is asked of: a kind's object, or a kind (in a namespace; none: anywhere). */
export interface AccessSubject {
  kind?: KindInfo;
  object?: KubeObject;
  namespace?: string;
}

/** Whether a definition is shown for this, as its access says (none, or one that throws: allowed — the API server still decides). */
export function accessOf(definition: { spec: { access?: (subject: AccessSubject) => Access } }, subject: AccessSubject): Access {
  try {
    return definition.spec.access?.(subject) ?? 'allowed';
  } catch {
    return 'allowed';
  }
}

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
const needs: Check = (v) =>
  Array.isArray(v) &&
  v.every(
    (n) => typeof n === 'object' && n !== null && typeof n.verb === 'string' && ['group', 'resource', 'subresource'].every((k) => n[k] === undefined || typeof n[k] === 'string'),
  );
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
}

export const KindView = defineKind<KindViewSpec>()('KindView', {
  required: ['title'],
  createRight: behaviour,
  validate: fields({ ...looks, category: [text, 'notText'], hidden: [flag, 'notAFlag'], pinned: [flag, 'notAFlag'] }),
  patchRights: { title: configure, category: configure, icon: configure, order: configure, hidden: configure, pinned: configure },
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
 * How a state is shown wherever a status is (a table's cell, a resource's
 * summary): the words it is for — as said ("CrashLoopBackOff"), or those a
 * pattern takes, * any run of them ("Init:*", "*,SchedulingDisabled") —
 * its tone and icon; for the kinds its target takes (none: every kind).
 * The words as said before a pattern, a kind's own before every kind's,
 * then by order. Data only: a user's to change (its tone, its icon).
 */
export interface StatusLookSpec {
  target?: Target;
  match: string;
  tone: Tone;
  icon?: string;
  order?: number;
}

export const StatusLook = defineKind<StatusLookSpec>()('StatusLook', {
  required: ['match', 'tone'],
  validate: fields({
    target: [target, 'notATarget'],
    match: [text, 'notText'],
    tone: [(v) => (TONES as readonly unknown[]).includes(v), 'notATone'],
    icon: [text, 'notText'],
    order: [finite, 'notANumber'],
  }),
  patchRights: { target: configure, match: configure, tone: configure, icon: configure, order: configure },
});

/** A value of a field as a list gives it: one, several (a many field), none (null). */
export type CellValue = Value | readonly Value[] | null;

/** What a Wrap of a column's cell is given: the kind, the column's values, its text (drawn as more than text: its values as text). */
export interface CellProps {
  kind: KindInfo;
  values: readonly CellValue[];
  display: string;
}

/** What a column's format is given beside its values: when it is (a format that reads it is drawn again as it changes), the kind, how to say things in the page's language. */
export interface ColumnContext {
  readonly now: number;
  readonly kind: KindInfo;
  readonly say: Say;
}

/**
 * A column of kinds' tables — of the kinds its target takes, those its when
 * does (none: all). Its data are fields (@overkube/query: a field's name,
 * or a path): what it sorts and filters by (sort; none: not sortable),
 * what its cell is made of (values; none: [sort]) — answered wherever
 * queries are, the page or a server. Its cell is the page's: format, of
 * those values only (never the object: a table holds no objects of its
 * own), a text or anything drawn; none — as their field's type says it (a
 * time: an age; bytes: 1.5Gi). Wide: shown only when the table is (kubectl's
 * -o wide); for some kinds only, a function of the kind.
 */
export interface ColumnSpec {
  target: Target;
  header: Label;
  sort?: FieldName;
  values?: readonly FieldName[];
  format?: (values: readonly CellValue[], context: ColumnContext) => ComponentChildren;
  when?: (kind: KindInfo) => boolean;
  wide?: boolean | ((kind: KindInfo) => boolean);
  /** Not kubectl's: more than it says (labels, an owner, containers' states) — not shown till asked, among the More in the columns' settings. */
  more?: boolean;
  width?: number;
  order?: number;
}

export const Column = defineKind<ColumnSpec>()('Column', {
  required: ['target', 'header'],
  createRight: behaviour,
  validate: (spec) => {
    const problems = fields({
      target: [target, 'notATarget'],
      header: [isLabel, 'notText'],
      sort: [text, 'notAField'],
      values: [(v) => texts(v) && (v as string[]).length > 0, 'notFields'],
      format: [fn, 'notAFunction'],
      when: [fn, 'notAFunction'],
      wide: [(v) => flag(v) || fn(v), 'notAFlag'],
      more: [flag, 'notAFlag'],
      width: [finite, 'notANumber'],
      order: [finite, 'notANumber'],
    })(spec);
    // Something to show: a field sorted by, or those its cell is made of.
    const empty = spec.sort === undefined && spec.values === undefined ? [{ code: 'noFields', field: 'values' }] : [];
    return problems || empty.length ? [...(problems ?? []), ...empty] : undefined;
  },
  patchRights: {
    target: behaviour,
    header: configure,
    width: configure,
    order: configure,
    sort: behaviour,
    values: behaviour,
    format: behaviour,
    when: behaviour,
    wide: configure,
    more: configure,
  },
});

/**
 * A field addons ask by, beside the kinds' own (@overkube/kube-fields):
 * named as it is asked by (its addon's: images.tag), of these kinds' refs
 * (none: every kind), its value a path or CEL (self: the object) — data, so
 * that whoever answers queries (the page; a server) works it out; held to
 * CEL's bound there, its errors told with the answers that ask by it.
 */
export interface FieldSpec {
  kinds?: readonly string[];
  type: FieldType;
  many?: boolean;
  unit?: Unit;
  value: Path | { readonly cel: string };
}

export const Field = defineKind<FieldSpec>()('Field', {
  required: ['type', 'value'],
  createRight: behaviour,
  validate: (spec) => (checkFieldDef(spec) ? [{ code: 'notAField', field: 'value' }] : undefined),
  patchRights: { kinds: behaviour, type: behaviour, many: behaviour, unit: behaviour, value: behaviour },
});

/** How a table is set out: a kind's (named by the kind's id), or one of no one kind (named for itself: core.overview.unhealthy). */
export interface TableViewSpec {
  /** Columns first in this order (by name); the others after, in theirs. */
  columns?: string[];
  hidden?: Record<string, boolean>;
  widths?: Record<string, number>;
  sort?: { column: string; descending?: boolean };
  /** Which objects it shows (none: all), as a query says it. */
  where?: Where;
}

export const TableView = defineKind<TableViewSpec>()('TableView', {
  createRight: behaviour,
  validate: fields({
    columns: [texts, 'notNames'],
    hidden: [mapOf(flag), 'notFlags'],
    widths: [mapOf(finite), 'notNumbers'],
    sort: [sort, 'notASort'],
    where: [(v) => typeof v === 'object' && v !== null && !Array.isArray(v), 'notAWhere'],
  }),
  patchRights: { columns: configure, hidden: configure, widths: configure, sort: configure, where: configure },
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
  /** What it needs of the cluster (each). */
  needs?: Need[];
  /** Whether the one signed in may have it (the access layer's): denied, its place says so. */
  access?: (subject: AccessSubject) => Access;
}

export const Page = defineKind<PageSpec>()('Page', {
  required: ['path'],
  createRight: behaviour,
  validate: fields({
    ...looks,
    path: [path, 'notAPath'],
    pinned: [flag, 'notAFlag'],
    hidden: [flag, 'notAFlag'],
    regions: [regions, 'notRegions'],
    needs: [needs, 'notNeeds'],
    access: [fn, 'notAFunction'],
  }),
  patchRights: { title: configure, icon: configure, order: configure, pinned: configure, hidden: configure, regions: configure, needs: behaviour, access },
  merge: { lists: { regions: { key: 'name' } } },
});

/**
 * A tab of a resource's view: what it is called, its icon, where among the
 * others (the core's: Overview first, YAML last), for which kinds (none:
 * every one), whether it is for this object. Empty but for what fills it:
 * its slot (resource.view.tab.<name>, slots.resource.view.tab(name)), given
 * the resource. Hidden: not drawn (another's, the user's).
 */
export interface ResourceTabSpec {
  target: Target;
  title: Label;
  icon?: string;
  order?: number;
  hidden?: boolean;
  /** Whether it is for this object (none: always). */
  when?: (object: KubeObject) => boolean;
  /** What it needs of the cluster (each), for the object's kind unless it says. */
  needs?: Need[];
  /** Whether the one signed in may have it, for an object (the access layer's). */
  access?: (subject: AccessSubject) => Access;
}

export const ResourceTab = defineKind<ResourceTabSpec>()('ResourceTab', {
  required: ['target', 'title'],
  createRight: behaviour,
  validate: fields({ ...looks, target: [target, 'notATarget'], hidden: [flag, 'notAFlag'], when: [fn, 'notAFunction'], needs: [needs, 'notNeeds'], access: [fn, 'notAFunction'] }),
  patchRights: { target: behaviour, title: configure, icon: configure, order: configure, hidden: configure, when: behaviour, needs: behaviour, access },
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
  /** What it needs of the cluster (each), for the object's kind unless it says. */
  needs?: Need[];
  /** Whether the one signed in may, for an object (the access layer's). */
  access?: (subject: AccessSubject) => Access;
}

export const Action = defineKind<ActionSpec>()('Action', {
  required: ['target', 'title', 'run'],
  createRight: behaviour,
  validate: fields({
    ...looks,
    target: [target, 'notATarget'],
    dangerous: [flag, 'notAFlag'],
    when: [fn, 'notAFunction'],
    run: [fn, 'notAFunction'],
    needs: [needs, 'notNeeds'],
    access: [fn, 'notAFunction'],
  }),
  patchRights: { target: behaviour, title: configure, icon: configure, order: configure, dangerous: behaviour, when: behaviour, run: behaviour, needs: behaviour, access },
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
  /** What it needs of the cluster (each), for its subject's kind unless it says (a subject with a kind: a resource's menu). */
  needs?: Need[];
  /** Whether the one signed in may, for its subject (the access layer's). */
  access?: (subject: AccessSubject) => Access;
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
    needs: [needs, 'notNeeds'],
    access: [fn, 'notAFunction'],
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
    needs: behaviour,
    access,
  },
});

/** How the page's navigation is drawn: as tabs across the top, or down the side — there collapsed (marks only) or pinned (wide); the tabs pinned, in order (none said: as the KindViews and Pages say). One, named 'default'. */
export interface NavViewSpec {
  mode?: 'tabs' | 'side';
  side?: 'collapsed' | 'pinned';
  /** The tabs pinned, in order (a kind's id, a page's path): those the KindViews and Pages pin and not said here come after (one an addon pins later, too). */
  pinned?: string[];
  /** Those the KindViews and Pages pin, unpinned. */
  unpinned?: string[];
}

/**
 * The namespaces one may use without listing them (the one signed in may
 * not list the cluster's): each by name, true — false: taken back. The
 * page's guess (a ServiceAccount's own namespace, where it has rights) and
 * those the user adds, layered key by key. One, named 'default'.
 */
export interface NamespacesSpec {
  known?: Record<string, boolean>;
}

export const Namespaces = defineKind<NamespacesSpec>()('Namespaces', {
  createRight: behaviour,
  validate: fields({ known: [mapOf(flag), 'notFlags'] }),
  patchRights: { known: configure },
  merge: { maps: ['known'] },
});

/** The namespaces one may use without listing them, of a Namespaces definition: those said true, in order. */
export const knownNamespaces = (spec: NamespacesSpec | undefined): string[] =>
  Object.entries(spec?.known ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort();

export const NavView = defineKind<NavViewSpec>()('NavView', {
  validate: fields({
    mode: [(v) => v === 'tabs' || v === 'side', 'notAMode'],
    side: [(v) => v === 'collapsed' || v === 'pinned', 'notASide'],
    pinned: [texts, 'notKeys'],
    unpinned: [texts, 'notKeys'],
  }),
  patchRights: { mode: configure, side: configure, pinned: configure, unpinned: configure },
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

/** How the page looks: its theme (by name), dark, light or as the system is, how big (its text, its room: compact as given). One, named 'default'. */
export interface AppearanceSpec {
  theme?: string;
  mode?: 'system' | 'dark' | 'light';
  size?: 'compact' | 'comfortable' | 'large';
}

export const Appearance = defineKind<AppearanceSpec>()('Appearance', {
  validate: fields({
    theme: [text, 'notText'],
    mode: [(v) => v === 'system' || v === 'dark' || v === 'light', 'notAMode'],
    size: [(v) => v === 'compact' || v === 'comfortable' || v === 'large', 'notASize'],
  }),
  patchRights: { theme: configure, mode: configure, size: configure },
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
export const kubeOwnKinds = [
  KindView,
  Category,
  Column,
  StatusLook,
  Field,
  TableView,
  Page,
  ResourceTab,
  Action,
  MenuItem,
  NavView,
  Namespaces,
  Theme,
  Appearance,
  Messages,
  Language,
] as const;

/** Every kind the dashboard has: its registry is made of them. */
export const kubeKinds = [ui.Slot, ui.Fill, ui.Wrap, ...kubeOwnKinds] as const;
export type KubeKinds = typeof kubeKinds;
