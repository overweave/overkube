import { CelError, declared, filterVariables, planFilter } from '@overkube/cel';
import { type FieldError, predicateOf, type QueryError, valuesReader } from '@overkube/query';
import { signal } from '@preact/signals';
import type { KindFields } from './fields.ts';

/*
 * A query's filter (CEL) as a source answers it: planned — what of it a
 * where says, and what is left, worked out of each object the where lets
 * through (the variables it reads: those fields' values, a time a time;
 * labels, the object's) — once for each kind's fields and filter. The
 * query itself as it is asked (its where, its cursors): the filter keeps
 * the objects it is answered of. One it cannot be worked out of (an
 * error, as 1 / 0): not kept, and told (the query's fieldErrors, filter).
 * One of now (an age, now-2h): worked out as of each answer, answered anew
 * as time goes (ticking: a while, not each moment).
 */

/** What is told of objects a filter could not be worked out of. */
export const FILTER_ERRORS = 'filter';

/** A filter made: whether it keeps an object as of now (an error thrown: it could not be worked out of it); whether it is of now (timed). */
export type MadeFilter = ((object: unknown, now: Date) => boolean) & { readonly timed?: boolean };

/** How often a filter of now is answered anew. */
export const TICK_MS = 30_000;
const tick = signal(0);
let ticks: ReturnType<typeof setInterval> | undefined;

/** Time as it goes, read (what reads it, answered anew each tick): one clock for every filter of now, from when the first is read. */
export function ticking(): number {
  if (!ticks) {
    ticks = setInterval(() => tick.value++, TICK_MS);
    (ticks as { unref?: () => void }).unref?.();
  }
  return tick.value;
}

const made = new WeakMap<KindFields, Map<string, MadeFilter | QueryError>>();
/** Filters kept made, for each kind's fields (those asked last). */
const KEPT = 32;

/** A kind's filter made, or why it is none (bad_filter: where it is wrong in it). */
export function makeFilter(fields: KindFields, filter: string): MadeFilter | QueryError {
  const mine = made.get(fields) ?? new Map<string, MadeFilter | QueryError>();
  made.set(fields, mine);
  const had = mine.get(filter) ?? make(fields, filter);
  // Asked last: kept longest.
  mine.delete(filter);
  mine.set(filter, had);
  if (mine.size > KEPT) mine.delete(mine.keys().next().value as string);
  return had;
}

function make(fields: KindFields, filter: string): MadeFilter | QueryError {
  const variables = filterVariables(fields.ref, Object.fromEntries(fields.fields));
  try {
    const plan = planFilter(filter, variables, fields.cel);
    const holds = predicateOf(plan.where, fields.fields);
    if (!plan.rest) return (object) => holds(object);
    const rest = plan.rest;
    // The variables it reads (a word of it that names one), their readers made once.
    const read = variables.filter((v) => new RegExp(`\\b${v.name}\\b`).test(rest)).map((v) => ({ v, values: valuesReader(fields.fields, v.field) ?? (() => []) }));
    const run = fields.cel.withVariables(declared(variables)).compile(rest);
    const keeps = (object: unknown, now: Date) => {
      if (!holds(object)) return false;
      const values: Record<string, unknown> = { now };
      for (const { v, values: of } of read) {
        const all = of(object).map((x) => (v.type === 'time' && typeof x === 'number' ? new Date(x) : x));
        values[v.name] = v.many ? all : (all[0] ?? null);
      }
      values.labels = (object as { metadata?: { labels?: unknown } } | null)?.metadata?.labels ?? {};
      return run(object, values) === true;
    };
    return Object.assign(keeps, { timed: plan.now === true });
  } catch (e) {
    const err = e instanceof CelError ? e : new CelError('bad_filter', (e as Error).message);
    return { code: err.code === 'too_costly' ? 'too_costly' : 'bad_filter', message: err.message, ...(err.at ? { at: err.at } : {}) };
  }
}

/** Whether it is an error (not a filter made). */
export const isError = (f: MadeFilter | QueryError): f is QueryError => typeof f !== 'function';

/** Those of these objects a filter keeps as of now (none: all; of now: read as time goes), the errors it met counted. */
export function filtered<O>(objects: Iterable<O>, keeps: MadeFilter | undefined): { objects: Iterable<O>; told: () => Record<string, FieldError> | undefined } {
  if (!keeps) return { objects, told: () => undefined };
  if (keeps.timed) ticking();
  const now = new Date();
  let count = 0;
  let first = '';
  function* kept() {
    for (const o of objects) {
      try {
        if (keeps?.(o, now)) yield o;
      } catch (e) {
        count++;
        first ||= (e as Error).message;
      }
    }
  }
  return { objects: kept(), told: () => (count ? { [FILTER_ERRORS]: { count, code: 'filter_error', message: first } } : undefined) };
}

/** A result's field errors with a filter's. */
export function withTold<R extends { fieldErrors?: Readonly<Record<string, FieldError>> }>(result: R, told: Record<string, FieldError> | undefined): R {
  return told ? { ...result, fieldErrors: { ...result.fieldErrors, ...told } } : result;
}
