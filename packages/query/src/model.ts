/*
 * What is asked of a cluster's data, as data — so that whoever answers it
 * (the page, from what it watches; a server, from its indexes) answers the
 * same: a field (what a value of an object is), a query (get one, list a
 * window, count), its result. Data only: what a field computes is the
 * server's to know, how it looks the page's (a cell made of four fields
 * filters by one of them, whatever it shows).
 *
 * The same answer wherever it is worked out, so values are held to rules
 * of their own, not a platform's:
 * - a number: a finite JSON number, or one in decimal (-12, 0.5): not 0x10,
 *   1e3, " 12 ", a quantity (100m, 1Gi), nor one past a double (none);
 * - a time: RFC 3339 as Go's time.RFC3339 takes it (T, Z or a zone to
 *   23:59, any year from 0000), or ms since the epoch; ordered by its ms
 *   (finer than ms cut off: the same);
 * - a bool: a JSON true or false, or "true"/"false" (a condition's status —
 *   True, False, Unknown — is a string);
 * - a string field's literal: a string (a value of the object: a number or a
 *   bool as JS writes it, String(v));
 * - a string as Go reads it of JSON (a lone surrogate: U+FFFD), ordered by
 *   its natural key — ASCII letters with their case
 *   aside; a run of digits as the number it is (x-2 before x-10, x-01 as
 *   x-1), before any character but U+0000, however long — then as it is;
 *   each by code point (as UTF-8's bytes: Go's, SQLite's BINARY): a total
 *   order, the same in any locale; contains: its words in it, ASCII case
 *   aside (a string's only).
 * Kinds of value apart, in this order: bool, number, string.
 *
 * A server answering by SQL keeps these as columns of their own: a value's
 * kind (its rank), a string's natural key (and its ASCII-folded text, for
 * contains), a time as ms; a many field's values a table of their own (its
 * least and greatest, to sort by). A cursor past a place of a sort — none
 * last either way, desc a field at a time — is a chain of ORs, not one
 * row-value comparison.
 */

/** A value a field has. */
export type Value = string | number | boolean;

/** What a field's values are: how they compare and sort (a time: ms since the epoch). */
export type FieldType = 'string' | 'number' | 'time' | 'bool';

/** A path in an object, as kubectl's JSONPath says it (.status.conditions[?(@.type=="Ready")].status): a field of every kind, declared or not. */
export type Path = `.${string}`;

/** A field: its declared name (core.ready), or a path. */
export type FieldName = string;

/** A kind, as its ref says it (pods.v1, deployments.v1.apps). */
export type KindRef = string;

/**
 * A field: a value of an object, of these kinds (none: every kind). Of the
 * object alone — no now, no other object (an age is its creation time; how
 * many pods a deployment runs, a count) — so it is worked out once for each
 * version of an object, and indexed. A path, a server answers by itself; a
 * function, only where its code is (the core's, its kinds'; an addon's: the
 * page's only). A spec is not changed once made: another one, another field
 * (worked out anew); its version says what it works out, so two sides that
 * have a field of one name know whether they mean the same by it.
 */
export interface FieldSpec<O = unknown> {
  kinds?: readonly KindRef[];
  type: FieldType;
  /** More than one value (owners, the secrets a pod uses): a condition holds if one of them does. */
  many?: boolean;
  value: Path | ((object: O) => Value | readonly Value[] | undefined);
  version?: string;
}

/** What a field's values are counted in (a quantity: CPU in cores, memory and storage in bytes), for whoever shows them. */
export type Unit = 'cores' | 'bytes';

/**
 * A field as it is defined — data only, so whoever answers queries (the
 * page; a server, sent it) has it as it is: a path (a value where it is in
 * the object), or CEL (a value worked out of it: self, the object), no
 * code. Its version: what it is, hashed (fieldVersion) — the same
 * definition, the same version, anywhere.
 */
export interface FieldDef {
  kinds?: readonly KindRef[];
  type: FieldType;
  many?: boolean;
  unit?: Unit;
  value: Path | { readonly cel: string };
  version: string;
}

/**
 * Fields as one gives them to whoever answers queries: their definitions,
 * the functions of CEL they call (by name, CEL), what answers mean there
 * (the CEL engine's semantics: a field's version is of it).
 */
export interface FieldCatalog {
  fields: Readonly<Record<FieldName, FieldDef>>;
  functions: Readonly<Record<string, string>>;
  semantics: string;
}

/** A range: those of its bounds that are given (a time: as RFC 3339, or ms). */
export interface Bounds {
  readonly gt?: number | string;
  readonly gte?: number | string;
  readonly lt?: number | string;
  readonly lte?: number | string;
}

/**
 * What a field's values are held to — one of them holding (a many field:
 * one value holding it all; a range, every bound on that one): equal to,
 * one of, in a range, there at all, these words in it; ne: none of them
 * this (none there: holds).
 */
export type Test =
  | { readonly op: 'eq'; readonly value: Value }
  | { readonly op: 'ne'; readonly value: Value }
  | { readonly op: 'in'; readonly values: readonly Value[] }
  | ({ readonly op: 'range' } & Bounds)
  | { readonly op: 'exists' }
  | { readonly op: 'contains'; readonly value: string };

export type Op = Test['op'] | 'and' | 'or' | 'not';

/** Which objects: a test of a field; all of these (none: every one), any of these (none: no one), not this. */
export type Where =
  | ({ readonly field: FieldName } & Test)
  | { readonly op: 'and'; readonly args: readonly Where[] }
  | { readonly op: 'or'; readonly args: readonly Where[] }
  | { readonly op: 'not'; readonly arg: Where };

/** By these fields, in turn (a many field: by its least value, its greatest descending; none: last either way); ties by key, then by uid (objects of one key, with no uid: one of them only past a cursor — a cluster's have one). */
export type Sort = readonly { readonly field: FieldName; readonly desc?: boolean }[];

/** Where in the cluster: every namespace (of those allowed), these. Not a cluster-scoped kind's. */
export type Scope = 'all' | { readonly namespaces: readonly string[] };

/** Where a window starts: so many in, or past the last one of a window before (its next: the same order, whatever came or went since). */
export type Cursor = string;

/** A window of them, never all: at most limit, from offset (none: 0) or after a cursor. */
export interface Page {
  readonly limit: number;
  readonly offset?: number;
  readonly after?: Cursor;
}

/** One object, by its name. */
export interface GetQuery {
  kind: KindRef;
  namespace?: string;
  name: string;
}

/** A window of them: where, which, in what order. */
export interface ListQuery {
  kind: KindRef;
  scope?: Scope;
  where?: Where;
  /** Which objects, as CEL says it (a user's filter: the kind's fields by short names, labels, self) — of those the where lets through. */
  filter?: string;
  sort?: Sort;
  page: Page;
  /** The fields wanted of each, not the object (none: the object). */
  select?: readonly FieldName[];
}

/**
 * How many of them, in all and by a field's values (the most first: top of
 * them, the rest in one) — and, of them, number fields summed (sum: in all,
 * and in each group; a many field's values all of them; none, nothing).
 */
export interface CountQuery {
  kind: KindRef;
  scope?: Scope;
  where?: Where;
  /** As a list's. */
  filter?: string;
  groupBy?: FieldName;
  top?: number;
  /** Number fields declared (not paths), summed of those counted. */
  sum?: readonly FieldName[];
}

export type Query = GetQuery | ListQuery | CountQuery;

/**
 * How a result is doing: on its way; live; stale (live no more: shown as it
 * was); partial (some of it: the rest not allowed); denied (none of it
 * allowed); error.
 */
export type State = 'loading' | 'live' | 'stale' | 'partial' | 'denied' | 'error';

/** Why a result is not all it was asked to be. */
export interface QueryError {
  status?: number;
  code: string;
  message: string;
  /** Where in the query's filter it is wrong (its characters, from start to end), when it is the filter's. */
  at?: { start: number; end: number };
}

/** How many: counted, or about so many (a server may say so, not count). */
export interface Total {
  readonly count: number;
  readonly exact: boolean;
}

/** What every result says: how it is doing, what of the cluster it covers (the rest: denied), as of which revision of it. */
export interface Result {
  state: State;
  coverage: { readonly namespaces: 'all' | readonly string[]; readonly denied: readonly string[] };
  revision?: string;
  error?: QueryError;
  /** Fields it asked by that could not be worked out of some objects (an error, not a value missing): how many, the first error. Those objects: none of it. */
  fieldErrors?: Readonly<Record<FieldName, FieldError>>;
}

/** A field that could not be worked out of some objects: how many of them, the first error. */
export interface FieldError {
  readonly count: number;
  readonly code: string;
  readonly message: string;
}

export interface GetResult<O = unknown> extends Result {
  object?: O;
}

/** One of a list: its key (namespace/name), its uid; the object — or, fields selected, their values (a many field's, a path's: all of them; none: null). */
export interface Item<O = unknown> {
  key: string;
  uid?: string;
  object?: O;
  values?: Readonly<Record<FieldName, Value | readonly Value[] | null>>;
}

export interface ListResult<O = unknown> extends Result {
  items: readonly Item<O>[];
  /** How many there are in all (none: not known yet). */
  total?: Total;
  /** Where the next window starts (none: this one is the last). */
  next?: Cursor;
}

/** A value of a field and how many have it (null: those with none); the fields summed of them. */
export interface Group {
  readonly value: Value | null;
  readonly count: number;
  readonly sums?: Readonly<Record<FieldName, number>>;
}

export interface CountResult extends Result {
  total?: Total;
  /** The fields summed (sum) of all of them counted (one past a double: not here — its overflow in fieldErrors). */
  sums?: Readonly<Record<FieldName, number>>;
  /** The most first (a many field: an object in each of its values' groups, its sums in each); past top, the rest: their counts summed, and their sums (a many field's object there as often as its values are). */
  groups?: readonly Group[];
  rest?: number;
  restSums?: Readonly<Record<FieldName, number>>;
}

/** A result as it is now, and as it changes: read while wanted (a signal is one). */
export interface Live<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

/**
 * What a source can answer by itself: fields (by name, their version),
 * paths or not, its tests. A query it cannot answer all of is answered
 * where all of it can be — never a window of its answer filtered after
 * (what the window left out would be lost).
 */
export interface Capabilities {
  fields: Readonly<Record<FieldName, string>>;
  paths: boolean;
  ops: readonly Op[];
}

/**
 * A column a kind's own definition says it is shown with (a CRD's
 * additionalPrinterColumns): of which field, its name, its type and format
 * as the definition says them (integer, date; int64, byte…), its priority
 * (0: shown; 1: only when wide), what it is.
 */
export interface KindColumn {
  field: FieldName;
  name: string;
  type: string;
  format?: string;
  priority: number;
  description?: string;
}

/** A kind's fields, as its queries are answered by them: their definitions, those left out (why); the columns its own definition says. */
export interface FieldsResult extends Result {
  catalog?: FieldCatalog;
  rejected?: Readonly<Record<FieldName, string>>;
  columns?: readonly KindColumn[];
}

/** Whoever answers queries: the page, or a server. */
export interface Source {
  readonly capabilities: Capabilities;
  get<O>(query: GetQuery): Live<GetResult<O>>;
  list<O>(query: ListQuery): Live<ListResult<O>>;
  count(query: CountQuery): Live<CountResult>;
  /** A kind's fields (by its ref): what its queries may ask by. */
  fields(kind: KindRef): Live<FieldsResult>;
  /** The kinds (refs) whose objects were seen owned by an object of this kind (their ownerReferences), of those it has read: what it may own. */
  owned(kind: KindRef): Live<readonly KindRef[]>;
}
