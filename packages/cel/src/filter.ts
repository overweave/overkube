import { serialize } from '@marcbachmann/cel-js';
import type { FieldName, FieldType, KindRef, Where } from '@overkube/query';
import type { Cel } from './cel.ts';
import { CelError } from './cel.ts';

/*
 * A user's filter of a kind's objects: CEL over the kind's fields by short
 * names (status, restarts, node; name, namespace; labels, a map of them;
 * self, the object) — typed as a user types it (desugar: = for ==, and / or
 * / not, words for strings where a value goes, in (a, b), labels.<key>, a
 * label selector as kubectl takes it, words alone: a name's), always made
 * CEL before anything else sees it (what is kept, sent, asked: CEL only).
 * Then planned: what of it a query can ask (a where: by the fields, the
 * indexes, the server) and what is left (CEL, worked out of each object
 * the where lets through).
 */

/** A kind's field as a filter's variable: its short name, the field it is (its value as given to the filter's CEL: a list, [] where it has none, if many; labels: {} where none). */
export interface FilterVariable {
  name: string;
  field: FieldName;
  type: FieldType;
  many: boolean;
}

/** Variables of their own: the object's labels (a map), the object itself. */
const OWN = ['labels', 'self'];
const LABELS: FieldName = 'core.labels';
const LABEL_KEYS: FieldName = 'core.label.keys';
/** CEL's reserved words (a variable may not be one): a field of such a name, its variable's with _ after (namespace_), a user's word for it the same. */
const RESERVED = new Set([
  'as',
  'break',
  'const',
  'continue',
  'else',
  'false',
  'for',
  'function',
  'if',
  'import',
  'in',
  'let',
  'loop',
  'null',
  'package',
  'namespace',
  'return',
  'true',
  'var',
  'void',
  'while',
]);

/** A kind's fields as a filter's variables: core.name name, pods.v1.cpu-requests cpu_requests (its kind's or every kind's — one name of both: its kind's; paths and labels aside). */
export function filterVariables(kind: KindRef, fields: Readonly<Record<FieldName, { type: FieldType; many?: boolean }>>): FilterVariable[] {
  const out = new Map<string, FilterVariable>();
  for (const [field, spec] of Object.entries(fields)) {
    if (field.startsWith('.') || field === LABELS || field === LABEL_KEYS) continue;
    const short = field.startsWith(`${kind}.`) ? field.slice(kind.length + 1) : field.startsWith('core.') ? field.slice(5) : undefined;
    if (!short) continue;
    const plain = short.replace(/[^A-Za-z0-9_]/g, '_');
    const name = RESERVED.has(plain) ? `${plain}_` : plain;
    if (!/^[A-Za-z_]/.test(name) || OWN.includes(name)) continue;
    // One name, two fields (core.ready, pods.v1.ready): the kind's own.
    const had = out.get(name);
    if (had && (had.field.startsWith(`${kind}.`) || !field.startsWith(`${kind}.`))) continue;
    out.set(name, { name, field, type: spec.type, many: spec.many === true });
  }
  return [...out.values()];
}

/** A filter's variables as CEL declares them (checked so: a string compared to a number, wrong; a number any of CEL's), labels a map, now a time (the answer's: given by whoever works it out). */
export function declared(variables: readonly FilterVariable[]): Record<string, string> {
  const type = (v: FilterVariable) => (v.many ? 'list' : v.type === 'string' ? 'string' : v.type === 'bool' ? 'bool' : v.type === 'time' ? 'google.protobuf.Timestamp' : 'dyn');
  return { ...Object.fromEntries(variables.map((v) => [v.name, type(v)])), labels: 'map', now: 'google.protobuf.Timestamp' };
}

// ── Times: as a user says them, as CEL has them ────────────────────────────

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/** A duration as typed (30m, 2h, 1d12h, 1w), in seconds; none: not one. */
function secondsOf(text: string): number | undefined {
  if (!/^(\d+[smhdw])+$/.test(text)) return undefined;
  return [...text.matchAll(/(\d+)([smhdw])/g)].reduce((all, [, n, unit]) => all + Number(n) * UNITS[unit], 0);
}

/** Seconds as a user types them: the largest units first (1d1h, 30m). */
function durationText(seconds: number): string {
  let left = seconds;
  let out = '';
  for (const unit of ['d', 'h', 'm', 's']) {
    const n = Math.floor(left / UNITS[unit]);
    if (n) out += `${n}${unit}`;
    left -= n * UNITS[unit];
  }
  return out || '0s';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A time of the page's clock, as RFC 3339 says it with its offset (2026-10-01T00:00:00+03:00). */
function localStamp(d: Date): string {
  const off = -d.getTimezoneOffset();
  const zone = `${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${zone}`;
}

/**
 * A time as typed, as CEL: now, now-2h, now+1d (as it is when worked out);
 * today, yesterday, a day (2026-10-01), a day and time (2026-10-01 14:00)
 * — of the page's clock; RFC 3339 with its zone, as it is. None: not one.
 */
function timeOf(text: string, now = new Date()): string | undefined {
  const relative = /^now(?:\s*([+-])\s*((?:\d+[smhdw])+))?$/.exec(text);
  if (relative) return relative[1] ? `now ${relative[1]} duration("${secondsOf(relative[2])}s")` : 'now';
  const midnight = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const named = { today: 0, yesterday: -1, tomorrow: 1 }[text.toLowerCase()];
  if (named !== undefined) return `timestamp("${localStamp(midnight(named))}")`;
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (local) {
    const [y, mo, d, h = '0', mi = '0', sec = '0'] = local.slice(1).map((x) => x ?? undefined) as string[];
    const at = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
    // A day and time there is (not Feb 30th; not one a clock skips: 02:30 as summer time begins).
    const there = at.getMonth() === Number(mo) - 1 && at.getDate() === Number(d) && at.getHours() === Number(h) && at.getMinutes() === Number(mi);
    return there ? `timestamp("${localStamp(at)}")` : undefined;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(text) ? `timestamp(${JSON.stringify(text)})` : undefined;
}

/** A time as a user would type it (as timeOf takes it back): a day, a day and time of the page's clock; else as given. */
function timeText(stamp: string): string {
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime()) || localStamp(at) !== stamp) return stamp;
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  if (!at.getHours() && !at.getMinutes() && !at.getSeconds()) return day;
  return at.getSeconds() ? `"${day} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}"` : `"${day} ${pad(at.getHours())}:${pad(at.getMinutes())}"`;
}

/** What is said of a time's value not one, of an age's. */
const TIME_SAYS = (name: string) => `${name} is a time: 2026-10-01, "2026-10-01 14:00", today, now-2h — or age > 2h`;
const AGE_SAYS = 'age is a duration: 30m, 2h, 7d, 1w';

/** An object's age (how long since it was made: as kubectl's AGE), a variable of none: now less when it was made. */
const AGE = 'age';
const CREATED: FieldName = 'core.created';

// ── Desugar: a user's text, CEL ────────────────────────────────────────────

/** A user's text as CEL, each of its characters' place in the text (an error found in the CEL: where it is in what was typed). */
export interface Desugared {
  cel: string;
  at: number[];
}

const KEY = /[A-Za-z0-9._/-]/;
const WORD_END = /[\s(),\]&|]/;
const COMPARE = ['==', '!=', '<=', '>=', '<', '>'];

/** A label's value, none where it has none: "" (labels[?"app"].orValue("")) — a label test on an object without it false (or, negated, true), not an error. */
const labelValue = (key: string) => `labels[?${JSON.stringify(key)}].orValue("")`;

/** A number as CEL has it (1, -2, 1.5, 1e3, 3u, 0x1f), nothing of a word after it (2nd-node: a word). */
const NUMBER = /^-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)u?(?![\w.-])/;

/** A value as typed after a comparison: a string as it is, a number, else a word (a string). */
const VALUE = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s(),\]&|]+)/;

/**
 * A user's text as CEL: = as ==; and, or, not as &&, ||, !; a word where a
 * value goes (after a comparison, in a list of in) a string ("Running");
 * in (a, b) a list; labels.<key> (its key with dots and slashes) the
 * label's value ("" where it has none); a field of many values compared
 * (images = nginx) one of them ("nginx" in images); a label selector as
 * kubectl takes it (app=web,tier in (a,b),!canary — its keys none of the
 * variables) the labels' CEL; words alone, in a name (ASCII's case aside).
 * Anything else, as it is: CEL is all of it.
 */
export function desugar(text: string, given: readonly FilterVariable[]): Desugared {
  const variables = new Set(given.map((v) => v.name));
  const many = new Set(given.filter((v) => v.many).map((v) => v.name));
  const times = new Set(given.filter((v) => v.type === 'time' && !v.many).map((v) => v.name));
  // Its age: of when it was made (none such: no age).
  const created = variables.has(AGE) ? undefined : given.find((v) => v.field === CREATED)?.name;
  /** A list's one (images in (a, b): images.exists(<it>, <it> in [a, b])), named as no variable is. */
  let one = 'it';
  while (variables.has(one)) one += '_';
  const selector = fromSelector(text, variables);
  if (selector) return selector;
  const words = alone(text, variables);
  if (words) return words;
  let cel = '';
  const at: number[] = [];
  /** CEL said for the text from..to (its last character at to's end: an error of all of it, all of what was typed). */
  const emit = (s: string, from: number, copy: boolean | number = false) => {
    cel += s;
    for (let i = 0; i < s.length; i++) at.push(copy === true ? from + i : typeof copy === 'number' && i === s.length - 1 ? copy - 1 : from);
  };
  /** Opened, what each ( is: a list of in's (closed as ]; a list's in a list: as ])), or as it is. */
  const opened: ('list' | 'exists' | 'group')[] = [];
  /** A list's in a list being made (its list's ( next). */
  let exists = false;
  /** A time's comparison: its value a timestamp (created > 2026-10-01: timestamp("…")); an age's: a duration (age > 2h). */
  let time: 'time' | 'age' | undefined;
  /** The variable compared (what a value not one of its is said of). */
  let subject: string | undefined;
  /** A value as a time's or an age's (from..to of what was typed), as CEL; none of it: wrong, said there. */
  const timed = (raw: string, from: number, to: number) => {
    const said = time === 'age' ? ((n) => (n === undefined ? undefined : `duration("${n}s")`))(secondsOf(raw)) : timeOf(raw);
    if (!said) throw new CelError('bad_cel', time === 'age' ? AGE_SAYS : TIME_SAYS(subject ?? ''), { start: from, end: to });
    emit(said, from, to);
  };
  /** The variable just named (whose comparison follows). */
  let named: string | undefined;
  /** A not's, open till its part ends (an and, an or, a ) of its own, the end: not a = b is !(a == b), not (!a) == b). */
  const nots: number[] = [];
  const closeNots = (from: number) => {
    while (nots.length && nots.at(-1) === opened.length) {
      nots.pop();
      emit(')', from);
    }
  };
  let value = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      emit(ch, i, true);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      if (value && time) timed(text.slice(i + 1, j), i, j + 1);
      else emit(text.slice(i, j + 1), i, true);
      i = j + 1;
      value = false;
      continue;
    }
    const rest = text.slice(i);
    const op = COMPARE.find((o) => rest.startsWith(o));
    if (op || ch === '=') {
      emit(op ?? '==', i, op !== undefined);
      i += op?.length ?? 1;
      value = true;
      time = named === AGE ? 'age' : named !== undefined && times.has(named) ? 'time' : undefined;
      subject = named?.endsWith('_') ? named.slice(0, -1) : named;
      named = undefined;
      continue;
    }
    if (ch === '(') {
      const list = /\bin\s*$/.test(cel);
      opened.push(list ? (exists ? 'exists' : 'list') : 'group');
      emit(list ? '[' : '(', i);
      exists = false;
      value = list;
      i++;
      continue;
    }
    if (ch === ')') {
      closeNots(i);
      const was = opened.pop();
      emit(was === 'exists' ? '])' : was === 'list' ? ']' : ')', i);
      i++;
      value = false;
      continue;
    }
    if (ch === ',') {
      emit(',', i, true);
      value = opened.at(-1) === 'list' || opened.at(-1) === 'exists' || value;
      i++;
      continue;
    }
    const number = NUMBER.exec(rest)?.[0];
    if (number && (value || ch !== '-')) {
      if (value && time) throw new CelError('bad_cel', time === 'age' ? AGE_SAYS : TIME_SAYS(subject ?? ''), { start: i, end: i + number.length });
      emit(number, i, true);
      i += number.length;
      value = false;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)?.[0];
    const after = text[i - 1] === '.';
    if (word === 'labels' && !after && text[i + word.length] === '.' && KEY.test(text[i + word.length + 1] ?? '')) {
      let j = i + word.length + 1;
      while (j < text.length && KEY.test(text[j])) j++;
      // labels.size(), labels.app.startsWith(…): CEL's own (a method of it).
      if (text[j] !== '(') {
        emit(labelValue(text.slice(i + word.length + 1, j)), i, j);
        i = j;
        value = false;
        continue;
      }
    }
    // A field of many values compared as a user does (images = nginx, images != nginx; not CEL's ==): one of them is (none is) — a value, not a list or a variable.
    const compared = word && !after && !value && many.has(word) ? /^(\s*)(!=|=(?!=))(\s*)/.exec(text.slice(i + word.length)) : null;
    const said = word && compared ? VALUE.exec(text.slice(i + word.length + compared[0].length))?.[0] : undefined;
    if (word && compared && said && !/^[[{(]/.test(said) && !variables.has(said)) {
      const value1 = /^["']/.test(said) || NUMBER.test(said) || ['true', 'false'].includes(said) ? said : JSON.stringify(said);
      const end = i + word.length + compared[0].length + said.length;
      emit(compared[2] === '!=' ? `!(${value1} in ${word})` : `${value1} in ${word}`, i, end);
      i = end;
      value = false;
      continue;
    }
    // A field of many values in a list (images in (a, b)): one of them in it.
    if (word && !after && !value && many.has(word) && /^\s+in\s*\(/i.test(text.slice(i + word.length))) {
      emit(`${word}.exists(${one}, ${one}`, i);
      i += word.length;
      exists = true;
      time = undefined;
      continue;
    }
    // now and a duration, spaced (now - 2h): one time.
    const spaced = value && time === 'time' ? /^now\s*[+-]\s*(?:\d+[smhdw])+/.exec(rest)?.[0] : undefined;
    if (spaced) {
      timed(spaced, i, i + spaced.length);
      i += spaced.length;
      value = false;
      continue;
    }
    // A word where a value goes: a string (a time's: a timestamp) — unless it is CEL's own (true, false, null), a variable, self's, a call.
    if (value && !/^["'[{(!]/.test(ch) && !NUMBER.test(rest)) {
      let j = i;
      while (j < text.length && !WORD_END.test(text[j])) j++;
      const bare = text.slice(i, j);
      const own = ['true', 'false', 'null'].includes(bare) || variables.has(bare) || bare === 'self' || bare.startsWith('self.') || text[j] === '(';
      if (time && !own) timed(bare, i, j);
      else if (own) emit(bare, i, true);
      else emit(time ? `timestamp(${JSON.stringify(bare)})` : JSON.stringify(bare), i, j);
      i = j;
      value = false;
      continue;
    }
    if (rest.startsWith('&&') || rest.startsWith('||')) closeNots(i);
    if (word && /^(and|or|not)$/i.test(word) && !after) {
      const said = { and: '&&', or: '||', not: '!(' }[word.toLowerCase() as 'and' | 'or' | 'not'];
      if (said === '!(') nots.push(opened.length);
      else closeNots(i);
      emit(said, i);
      i += word.length;
      value = false;
      continue;
    }
    if (word && !after && /^in$/i.test(word)) {
      // A list's values (status in (a, b)): not a time's, whatever was compared before.
      time = undefined;
      emit('in', i);
      i += word.length;
      value = false;
      continue;
    }
    if (word === AGE && !after && created) {
      emit(`(now - ${created})`, i, i + word.length);
      named = AGE;
      i += word.length;
      value = false;
      continue;
    }
    if (word && !after && RESERVED.has(word) && variables.has(`${word}_`)) {
      emit(`${word}_`, i);
      named = `${word}_`;
      i += word.length;
      value = false;
      continue;
    }
    if (word) {
      emit(word, i, true);
      named = !after && variables.has(word) ? word : undefined;
      i += word.length;
      value = false;
      continue;
    }
    emit(ch, i, true);
    i++;
  }
  while (nots.length) {
    nots.pop();
    emit(')', text.length);
  }
  return { cel, at };
}

/** ASCII's capitals small (CEL's lowerAscii: other letters as they are). */
const lowerAscii = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Words alone (no operator, no call, no variable: web api, web.shop), each in an object's name, ASCII's case aside. */
function alone(text: string, variables: ReadonlySet<string>): Desugared | undefined {
  const words = [...text.matchAll(/"[^"]*"|'[^']*'|[^\s"']+/g)];
  const own = (w: string) => {
    const head = w.split('.')[0];
    return variables.has(head) || variables.has(`${head}_`) || OWN.includes(head) || RESERVED.has(head) || head === 'now' || head === AGE;
  };
  if (!words.length || words.some(([w]) => (!/^["']/.test(w) && (/[=<>!()[\]&|,]/.test(w) || /^[-+*/%?:]+$/.test(w) || own(w))) || /^(and|or|not|in)$/i.test(w))) return undefined;
  let cel = '';
  const at: number[] = [];
  words.forEach((m, n) => {
    const raw = m[0];
    const part = `${n ? ' && ' : ''}name.lowerAscii().contains(${JSON.stringify(lowerAscii(/^["']/.test(raw) ? raw.slice(1, -1) : raw))})`;
    cel += part;
    for (let i = 0; i < part.length; i++) at.push(m.index ?? 0);
  });
  return { cel, at };
}

/** A label selector as kubectl takes it (key=value, key!=value, key in (a,b), key notin (a,b), key, !key — by commas), its keys none of the variables; else none. */
function fromSelector(text: string, variables: ReadonlySet<string>): Desugared | undefined {
  const parts: [string, number][] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (i === text.length || (ch === ',' && depth === 0)) {
      parts.push([text.slice(from, i), from]);
      from = i + 1;
    }
  }
  const key = '([A-Za-z0-9][A-Za-z0-9._/-]*)';
  const val = '([A-Za-z0-9._-]*)';
  const one = '[A-Za-z0-9._-]+';
  const list = `\\(\\s*(${one}(?:\\s*,\\s*${one})*)\\s*\\)`;
  const values = (m: RegExpExecArray) => JSON.stringify(m[2].split(',').map((v) => v.trim()));
  const forms: [RegExp, (m: RegExpExecArray) => string][] = [
    [new RegExp(`^\\s*${key}\\s*==?\\s*${val}\\s*$`), (m) => `${labelValue(m[1])} == ${JSON.stringify(m[2])}`],
    [new RegExp(`^\\s*${key}\\s*!=\\s*${val}\\s*$`), (m) => `${labelValue(m[1])} != ${JSON.stringify(m[2])}`],
    [new RegExp(`^\\s*${key}\\s+in\\s*${list}\\s*$`), (m) => `${labelValue(m[1])} in ${values(m)}`],
    [new RegExp(`^\\s*${key}\\s+notin\\s*${list}\\s*$`), (m) => `!(${labelValue(m[1])} in ${values(m)})`],
    [new RegExp(`^\\s*!\\s*${key}\\s*$`), (m) => `!(${JSON.stringify(m[1])} in labels)`],
    [new RegExp(`^\\s*${key}\\s*$`), (m) => `${JSON.stringify(m[1])} in labels`],
  ];
  let cel = '';
  const at: number[] = [];
  let operated = false;
  for (const [part, start] of parts) {
    const hit = forms.findIndex(([re]) => re.test(part));
    if (hit < 0) return undefined;
    const m = forms[hit][0].exec(part) as RegExpExecArray;
    // A variable's (status=Running, labels.app=web): CEL's, not a selector's — a key with a prefix (node.kubernetes.io/role) a label's.
    const head = m[1].split('.')[0];
    if (OWN.includes(head) || (!m[1].includes('/') && (variables.has(head) || variables.has(`${head}_`)))) return undefined;
    // A word alone is a name's (web), not a label had: a selector says something more of one of its keys.
    if (hit < 5) operated = true;
    const said = `${cel ? ' && ' : ''}${forms[hit][1](m)}`;
    cel += said;
    for (let i = 0; i < said.length; i++) at.push(start);
  }
  return operated ? { cel, at } : undefined;
}

// ── Plan: what a query asks, what is left ──────────────────────────────────

/** A filter planned: what a query can ask of it (where), what is left of it (CEL, of each object the where lets through). */
export interface FilterPlan {
  /** The filter as CEL (what is kept, sent). */
  cel: string;
  where?: Where;
  rest?: string;
  /** Its rest reads now (an age, now-2h): worked out as of each answer, anew as time goes. */
  now?: true;
}

interface Node {
  op: string;
  args: unknown;
  start: number;
  end: number;
}

const isNode = (x: unknown): x is Node => typeof x === 'object' && x !== null && 'op' in x;

/**
 * A user's filter planned: made CEL (desugar), checked in the environment of
 * the kind's variables (an error where it is in what was typed), then split
 * — of its parts and-ed together, those a where says (a field compared to a
 * value, of a list, a label had or of a value, a name's words; and, or, not
 * of those) asked of the query; the rest, CEL to work out of each object.
 */
export function planFilter(text: string, variables: readonly FilterVariable[], cel: Cel): FilterPlan {
  const { cel: expression, at } = desugar(text, variables);
  const env = cel.withVariables(declared(variables));
  let tree: unknown;
  try {
    const checked = env.tree(expression);
    if (checked.type !== 'bool' && checked.type !== 'dyn') throw new CelError('bad_cel', `a filter is true or false, not a ${checked.type}`);
    // Of any type (a number's variable, a label's value), said alone where true or false goes: wrong, there.
    const alone = notTrueOrFalse(checked.tree as Node, new Map(variables.map((v) => [v.name, v])));
    if (alone) throw new CelError('bad_cel', 'a filter is true or false: compare it (= value)', { start: alone.start, end: alone.end });
    tree = checked.tree;
  } catch (e) {
    const err = e as CelError;
    // Where it is in what was typed (past the end: at the end; none known: all of it).
    const start = err.at ? (at[err.at.start] ?? text.length) : 0;
    const end = err.at ? Math.min((at[Math.max(err.at.end - 1, err.at.start)] ?? text.length) + 1, text.length) : text.length;
    throw new CelError(err.code, err.message, { start, end });
  }
  const byName = new Map(variables.map((v) => [v.name, v]));
  const asked: Where[] = [];
  const left: string[] = [];
  let now = false;
  for (const part of conjuncts(tree as Node)) {
    const said: Said = { loose: false, partial: false };
    const where = whereOf(part, byName, said);
    if (where) asked.push(where);
    // Not said by the where, or said more loosely (a where's contains: ASCII's case aside): worked out of each object too.
    if (!where || said.loose) {
      left.push(`(${serialize(part as never)})`);
      now ||= readsNow(part);
    }
  }
  const where = asked.length === 0 ? undefined : asked.length === 1 ? asked[0] : ({ op: 'and', args: asked } as Where);
  return { cel: expression, ...(where ? { where } : {}), ...(left.length ? { rest: left.join(' && ') } : {}), ...(now ? { now: true as const } : {}) };
}

/** Whether a part reads now (the variable, not a word of a string). */
function readsNow(n: unknown): boolean {
  if (Array.isArray(n)) return n.some(readsNow);
  if (!isNode(n)) return false;
  return (n.op === 'id' && n.args === 'now') || readsNow(n.args);
}

/** A part said where true or false goes (and, or, not's, the whole) that is a value of another type: a variable not a bool's, a label's value; none: none such. */
function notTrueOrFalse(n: Node, byName: ReadonlyMap<string, FilterVariable>): Node | undefined {
  if (n.op === '&&' || n.op === '||') {
    for (const a of n.args as Node[]) {
      const wrong = notTrueOrFalse(a, byName);
      if (wrong) return wrong;
    }
    return undefined;
  }
  if (n.op === '!_') return notTrueOrFalse(n.args as Node, byName);
  if (n.op === 'id') {
    const v = byName.get(n.args as string);
    return n.args === 'labels' || (v && (v.type !== 'bool' || v.many)) ? n : undefined;
  }
  return labelOf(n) !== undefined ? n : undefined;
}

/** An expression's parts and-ed together (a && (b && c): a, b, c). */
function conjuncts(n: Node): Node[] {
  return n.op === '&&' ? (n.args as Node[]).flatMap(conjuncts) : [n];
}

/** A literal's value (a string, a number, a bool; -1 too); none: not a literal. */
function literal(n: unknown): string | number | boolean | undefined {
  if (!isNode(n)) return undefined;
  if (n.op === '-_') {
    const v = literal(n.args);
    return typeof v === 'number' ? -v : undefined;
  }
  if (n.op !== 'value') return undefined;
  const v = n.args as unknown;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return undefined;
}

/** A list of literals (in's right), none: not one. */
function literals(n: unknown): (string | number | boolean)[] | undefined {
  if (!isNode(n) || n.op !== 'list') return undefined;
  const all = (n.args as unknown[]).map(literal);
  return all.every((v) => v !== undefined) ? (all as (string | number | boolean)[]) : undefined;
}

/** A variable (of a field) a node names; none: not one. */
const variableOf = (n: unknown, byName: ReadonlyMap<string, FilterVariable>) => (isNode(n) && n.op === 'id' ? byName.get(n.args as string) : undefined);

/** A label's key a node reads, "" where it has none (labels[?"app"].orValue("")); none: not one (labels["app"]: an error where it has none, left as CEL). */
function labelOf(n: unknown): string | undefined {
  if (!isNode(n) || n.op !== 'rcall') return undefined;
  const [method, of, given] = n.args as [string, Node, Node[]];
  if (method !== 'orValue' || given.length !== 1 || literal(given[0]) !== '' || !isNode(of) || of.op !== '[?]') return undefined;
  const [map, key] = of.args as [Node, Node];
  const k = literal(key);
  return isNode(map) && map.op === 'id' && map.args === 'labels' && typeof k === 'string' ? k : undefined;
}

/** A value of a field's type, as a where compares it (a time: as RFC 3339). */
function fits(field: FilterVariable, v: unknown): boolean {
  if (field.type === 'number') return typeof v === 'number';
  if (field.type === 'bool') return typeof v === 'boolean';
  return field.type === 'string' && typeof v === 'string';
}

/** A duration's literal (duration("7200s")): its seconds; none: not one (or not of seconds). */
function durationLiteral(n: unknown): number | undefined {
  if (!isNode(n) || n.op !== 'call') return undefined;
  const [fn, given] = n.args as [string, Node[]];
  const v = fn === 'duration' && given.length === 1 ? literal(given[0]) : undefined;
  const s = typeof v === 'string' ? /^(\d+)s$/.exec(v) : null;
  return s ? Number(s[1]) : undefined;
}

/** now, now - duration("7200s"), now + …: as typed (now, now-2h); none: not one. */
function nowText(n: unknown): string | undefined {
  if (!isNode(n)) return undefined;
  if (n.op === 'id' && n.args === 'now') return 'now';
  if (n.op !== '-' && n.op !== '+') return undefined;
  const [a, b] = n.args as Node[];
  const by = durationLiteral(b);
  return isNode(a) && a.op === 'id' && a.args === 'now' && by !== undefined ? `now${n.op}${durationText(by)}` : undefined;
}

/** A time's literal (timestamp("2026-01-01T00:00:00Z")): its text; none: not one. */
function timeLiteral(n: unknown): string | undefined {
  if (!isNode(n) || n.op !== 'call') return undefined;
  const [fn, given] = n.args as [string, Node[]];
  const v = fn === 'timestamp' && given.length === 1 ? literal(given[0]) : undefined;
  return typeof v === 'string' ? v : undefined;
}

/** A field compared (one side a variable of one value, the other its type's literal): the field, the value; none: not one. */
function comparedOf(a: Node, b: Node, byName: ReadonlyMap<string, FilterVariable>): { field: FilterVariable; value: string | number | boolean; left: boolean } | undefined {
  const left = single(variableOf(a, byName));
  const field = left ?? single(variableOf(b, byName));
  if (!field) return undefined;
  const other = left ? b : a;
  const value = field.type === 'time' ? timeLiteral(other) : literal(other);
  return value !== undefined && (field.type === 'time' || fits(field, value)) ? { field, value, left: left !== undefined } : undefined;
}

/** A field of one value (of many: a where's eq is one of them, CEL's == the list). */
const single = (f: FilterVariable | undefined) => (f && !f.many ? f : undefined);

const FLIP: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
const BOUND: Record<string, 'lt' | 'lte' | 'gt' | 'gte'> = { '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };

/** What a part's where is: looser than its CEL (a where's contains, ASCII's case aside: more objects); of a field's value only (a range, contains, a bool: CEL's none where it has none — not, of none, not its where's). */
interface Said {
  loose: boolean;
  partial: boolean;
}

/**
 * What a where says of a part, if it says all of it (else none: the part
 * left as CEL) — the same objects, or (loose) more of them, never fewer;
 * under a not, only the same, and only of what CEL says of an object
 * without the value (eq, ne, in; a label's).
 */
function whereOf(n: Node, byName: ReadonlyMap<string, FilterVariable>, said: Said): Where | undefined {
  const args = n.args as Node[];
  switch (n.op) {
    case '&&':
    case '||': {
      const all = args.map((a) => whereOf(a, byName, said));
      return all.every(Boolean) ? { op: n.op === '&&' ? 'and' : 'or', args: all as Where[] } : undefined;
    }
    case '!_': {
      // !ready: false, as CEL's (none where it has none: neither — not of it, not the same).
      const bool = single(variableOf(n.args, byName));
      if (bool?.type === 'bool') {
        said.partial = true;
        return { field: bool.field, op: 'eq', value: false };
      }
      const inner: Said = { loose: false, partial: false };
      const arg = whereOf(n.args as Node, byName, inner);
      return arg && !inner.loose && !inner.partial ? { op: 'not', arg } : undefined;
    }
    case '==':
    case '!=': {
      const [a, b] = args;
      const label = labelOf(a) ?? labelOf(b);
      const v = literal(a) ?? literal(b);
      // A label of a value ("" its having none: not a where's).
      if (label !== undefined) {
        if (typeof v !== 'string' || v === '') return undefined;
        const eq: Where = { field: LABELS, op: 'eq', value: `${label}=${v}` };
        return n.op === '==' ? eq : { op: 'not', arg: eq };
      }
      const it = comparedOf(a, b, byName);
      if (!it) return undefined;
      return { field: it.field.field, op: n.op === '==' ? 'eq' : 'ne', value: it.value };
    }
    case '<':
    case '<=':
    case '>':
    case '>=': {
      // Numbers' and times' (a where orders strings as names are: not as CEL does).
      const [a, b] = args;
      const it = comparedOf(a, b, byName);
      if (!it || (it.field.type !== 'number' && it.field.type !== 'time')) return undefined;
      said.partial = true;
      return { field: it.field.field, op: 'range', [BOUND[it.left ? n.op : FLIP[n.op]]]: it.value } as Where;
    }
    case 'in': {
      const [a, b] = args;
      const list = literals(b);
      const label = labelOf(a);
      if (label !== undefined)
        return list?.length && list.every((x) => typeof x === 'string' && x !== '') ? { field: LABELS, op: 'in', values: list.map((x) => `${label}=${x}`) } : undefined;
      const field = single(variableOf(a, byName));
      if (field && list?.every((x) => fits(field, x))) return { field: field.field, op: 'in', values: list };
      const v = literal(a);
      if (typeof v === 'string' && isNode(b) && b.op === 'id' && b.args === 'labels') return { field: LABEL_KEYS, op: 'eq', value: v };
      const many = variableOf(b, byName);
      if (many?.many && fits(many, v)) return { field: many.field, op: 'eq', value: v as string | number | boolean };
      return undefined;
    }
    case 'rcall': {
      // x.contains("v"): a where's, more loosely (ASCII's case aside); x.lowerAscii().contains("v", small): just as it.
      const [method, receiver, given] = n.args as [string, Node, Node[]];
      const v = given.length === 1 ? literal(given[0]) : undefined;
      if (method !== 'contains' || typeof v !== 'string') return undefined;
      const lowered = isNode(receiver) && receiver.op === 'rcall' && (receiver.args as [string, Node, Node[]])[0] === 'lowerAscii';
      const field = single(variableOf(lowered ? (receiver.args as [string, Node])[1] : receiver, byName));
      if (field?.type !== 'string') return undefined;
      if (!lowered || lowerAscii(v) !== v) said.loose = true;
      said.partial = true;
      return { field: field.field, op: 'contains', value: v };
    }
    case 'id': {
      const field = single(variableOf(n, byName));
      if (field?.type !== 'bool') return undefined;
      said.partial = true;
      return { field: field.field, op: 'eq', value: true };
    }
    default:
      return undefined;
  }
}

// ── Back: CEL as a user would type it ──────────────────────────────────────

/** Precedence: or, and, what is under them (a comparison, a not). */
const OR = 1;
const AND = 2;
const UNDER = 3;

/** A word that is a value as it is (a string's, unquoted): none of CEL's, a variable's, a number's. */
function bare(v: string, variables: ReadonlyMap<string, FilterVariable>): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/:-]*$/.test(v) && !NUMBER.test(v) && !/^(true|false|null|and|or|not|in|notin)$/i.test(v) && !variables.has(v) && !v.startsWith('self');
}

/** A value as a user types it (desugar takes it back to the same): a word as it is where it may be, else as CEL says it (a string quoted). */
export function filterValue(v: string | number | boolean, variables: readonly FilterVariable[]): string {
  return typeof v === 'string' && bare(v, new Map(variables.map((x) => [x.name, x]))) ? v : JSON.stringify(v);
}

/**
 * A filter's CEL as a user would type it (what desugar takes back to the
 * same CEL): a variable's own name (namespace, not namespace_), = for ==,
 * and / or / not, values unquoted where they may be, in (a, b),
 * labels.<key>, one of a list's values (images = nginx), words alone (a
 * name's); what has no other way, as CEL. Not taken back to the same: the
 * CEL as it is (as good to type).
 */
export function resugar(expression: string, variables: readonly FilterVariable[], cel: Cel): string {
  const env = cel.withVariables(declared(variables));
  let tree: Node;
  try {
    tree = env.tree(expression).tree as Node;
  } catch {
    return expression;
  }
  const byName = new Map(variables.map((v) => [v.name, v]));
  const said = wordsOf(tree) ?? sugarOf(tree, byName, 0);
  try {
    return serialize(env.tree(desugar(said, variables).cel).tree as never) === serialize(tree as never) ? said : expression;
  } catch {
    return expression;
  }
}

/** Words alone (name.lowerAscii().contains("web") && …: web …), if it is all of them. */
function wordsOf(n: Node): string | undefined {
  const words: string[] = [];
  for (const part of conjuncts(n)) {
    if (part.op !== 'rcall') return undefined;
    const [method, receiver, given] = part.args as [string, Node, Node[]];
    const lowered = isNode(receiver) && receiver.op === 'rcall' ? (receiver.args as [string, Node, Node[]]) : undefined;
    const v = given.length === 1 ? literal(given[0]) : undefined;
    if (method !== 'contains' || lowered?.[0] !== 'lowerAscii' || !isNode(lowered[1]) || lowered[1].op !== 'id' || lowered[1].args !== 'name' || typeof v !== 'string')
      return undefined;
    words.push(/^[^\s"']+$/.test(v) ? v : JSON.stringify(v));
  }
  return words.join(' ');
}

function sugarOf(n: Node, byName: ReadonlyMap<string, FilterVariable>, outer: number): string {
  const name = (v: FilterVariable) => (v.name.endsWith('_') && RESERVED.has(v.name.slice(0, -1)) ? v.name.slice(0, -1) : v.name);
  const value = (v: string | number | boolean) => (typeof v === 'string' && bare(v, byName) ? v : JSON.stringify(v));
  const label = (k: string) => (/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(k) ? `labels.${k}` : undefined);
  const wrap = (s: string, mine: number) => (mine < outer ? `(${s})` : s);
  const args = n.args as Node[];
  switch (n.op) {
    case '||':
      return wrap(args.map((a) => sugarOf(a, byName, OR)).join(' or '), OR);
    case '&&':
      return wrap(args.map((a) => sugarOf(a, byName, AND)).join(' and '), AND);
    case '!_': {
      const inner = n.args as Node;
      const bool = variableOf(inner, byName);
      if (bool) return `not ${name(bool)}`;
      // !("v" in images): images != v.
      if (inner.op === 'in') {
        const [a, b] = inner.args as Node[];
        const many = variableOf(b, byName);
        const v = literal(a);
        if (many?.many && v !== undefined) return `${name(many)} != ${value(v)}`;
      }
      return `not ${sugarOf(inner, byName, UNDER + 1)}`;
    }
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const [a, b] = args;
      const op = n.op === '==' ? '=' : n.op;
      // (now - created) > duration("7200s"): age > 2h.
      const since = durationLiteral(b);
      if (
        since !== undefined &&
        a.op === '-' &&
        (a.args as Node[])[0]?.op === 'id' &&
        (a.args as Node[])[0].args === 'now' &&
        variableOf((a.args as Node[])[1], byName)?.field === CREATED
      )
        return `${AGE} ${op} ${durationText(since)}`;
      const key = labelOf(a);
      const said = key !== undefined ? label(key) : variableOf(a, byName) && name(variableOf(a, byName) as FilterVariable);
      if (said && variableOf(a, byName)?.type === 'time') {
        const at = timeLiteral(b);
        if (at !== undefined) return `${said} ${op} ${timeText(at)}`;
        const relative = nowText(b);
        if (relative) return `${said} ${op} ${relative}`;
      }
      const v = literal(b);
      if (said && v !== undefined) return `${said} ${op} ${value(v)}`;
      return serialize(n as never);
    }
    case 'in': {
      const [a, b] = args;
      const list = literals(b);
      const key = labelOf(a);
      const said = key !== undefined ? label(key) : variableOf(a, byName) && name(variableOf(a, byName) as FilterVariable);
      if (said && list?.length) return `${said} in (${list.map(value).join(', ')})`;
      const many = variableOf(b, byName);
      const v = literal(a);
      if (many?.many && v !== undefined) return `${name(many)} = ${value(v)}`;
      return serialize(n as never);
    }
    case 'id': {
      const v = variableOf(n, byName);
      return v ? name(v) : serialize(n as never);
    }
    default:
      return wrap(serialize(n as never), UNDER);
  }
}

// ── Typing: what each part of a filter is, what may go at the caret ─────────

/** What a part of a filter's text is (a field, an operator, …: as a query field colours it). */
export interface FilterPart {
  start: number;
  end: number;
  kind: 'field' | 'op' | 'keyword' | 'string' | 'number' | 'value' | 'function' | 'punct';
}

/** A filter's text in its parts (what each is: a variable, an operator, a value — a word where a value goes). */
export function filterParts(text: string, variables: readonly FilterVariable[]): FilterPart[] {
  const names = new Set([...variables.map((v) => v.name), ...variables.filter((v) => v.name.endsWith('_')).map((v) => v.name.slice(0, -1)), ...OWN, 'now', AGE]);
  const parts: FilterPart[] = [];
  let value = false;
  let i = 0;
  const push = (end: number, kind: FilterPart['kind']) => {
    parts.push({ start: i, end, kind });
    i = end;
  };
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      push(Math.min(j + 1, text.length), 'string');
      value = false;
      continue;
    }
    const number = NUMBER.exec(rest)?.[0];
    if (number && (value || ch !== '-')) {
      push(i + number.length, 'number');
      value = false;
      continue;
    }
    const op = /^(==|!=|<=|>=|&&|\|\||[=<>!])/.exec(rest)?.[0];
    if (op) {
      push(i + op.length, 'op');
      value = !['&&', '||', '!'].includes(op);
      continue;
    }
    if (/[()[\],.?{}:]/.test(ch)) {
      push(i + 1, 'punct');
      if (ch !== ',' && ch !== '(') value = false;
      continue;
    }
    const word = /^[A-Za-z_][\w]*/.exec(rest)?.[0];
    if (!word) {
      // A word where a value goes, of what CEL has no word for (kube-1.a/b): as it is typed, to its end.
      const end = /^[^\s(),\]&|]+/.exec(rest)?.[0] ?? ch;
      push(i + end.length, 'value');
      value = false;
      continue;
    }
    const after = text[i - 1] === '.';
    if (!after && /^(and|or|not|in|notin|true|false|null)$/i.test(word)) {
      push(i + word.length, 'keyword');
      value = /^(in|notin)$/i.test(word);
      continue;
    }
    if (word === 'labels' && text[i + word.length] === '.' && text[i + word.length + 1] !== undefined) {
      let j = i + word.length + 1;
      while (j < text.length && KEY.test(text[j])) j++;
      if (text[j] !== '(') {
        push(j, 'field');
        value = false;
        continue;
      }
    }
    if (value && !after) {
      const end = /^[^\s(),\]&|]+/.exec(rest)?.[0] ?? word;
      push(i + (text[i + word.length] === '(' ? word.length : end.length), text[i + word.length] === '(' ? 'function' : 'value');
      value = false;
      continue;
    }
    push(i + word.length, text[i + word.length] === '(' ? 'function' : after || names.has(word) ? 'field' : 'value');
  }
  return parts;
}

/** What may go at the caret: the characters it takes the place of (from..to, typed so far), and what goes there — a field (a label's key: label), an operator (of a variable, of a label), a value (of one), and or or. */
export interface FilterCaret {
  from: number;
  to: number;
  typed: string;
  want: 'field' | 'label' | 'op' | 'value' | 'join';
  variable?: FilterVariable;
  /** A label's key (labels.<key>): its operators, its values. */
  label?: string;
  /** The field's word (an operator's, a value's): age, a variable's name, labels.<key>. */
  field?: string;
}

/** What may go at the caret of a filter's text (none: nothing known to go there — in a string, after CEL of its own). */
export function filterCaret(text: string, caret: number, variables: readonly FilterVariable[]): FilterCaret | undefined {
  // A label's key being typed (labels.|, labels.ap|): the labels' keys.
  const key = /(?:^|[\s(!&|])labels\.([A-Za-z0-9._/-]*)$/.exec(text.slice(0, caret));
  if (key) {
    const from = caret - key[1].length;
    let to = caret;
    while (to < text.length && KEY.test(text[to])) to++;
    return { from, to, typed: key[1], want: 'label' };
  }
  const parts = filterParts(text, variables);
  const at = parts.find((p) => p.start < caret && caret <= p.end && p.kind !== 'punct' && p.kind !== 'op');
  if (at?.kind === 'string' && caret < at.end) return undefined;
  const from = at?.start ?? caret;
  const to = at?.end ?? caret;
  const typed = text.slice(from, caret);
  const before = parts.filter((p) => p.end <= from);
  const last = before.at(-1);
  const word = (p: FilterPart | undefined) => (p ? text.slice(p.start, p.end) : '');
  const byName = new Map(variables.map((v) => [v.name.endsWith('_') ? v.name.slice(0, -1) : v.name, v]));
  /** The field a value goes to: the one before the operator (or before in's list). */
  const fieldBefore = () => {
    let k = before.length - 1;
    while (
      k >= 0 &&
      (before[k].kind === 'op' ||
        before[k].kind === 'punct' ||
        before[k].kind === 'value' ||
        before[k].kind === 'string' ||
        before[k].kind === 'number' ||
        /^(in|notin)$/i.test(word(before[k])))
    )
      k--;
    const f = before[k];
    if (f?.kind !== 'field') return {};
    const w = word(f);
    return { field: w, ...(w.startsWith('labels.') ? { label: w.slice('labels.'.length) } : byName.has(w) ? { variable: byName.get(w) } : {}) };
  };
  const field = { from, to, typed };
  /** In an in's list (in (a, |): the ( open before the caret is one after in. */
  const inList = () => {
    let depth = 0;
    for (let k = before.length - 1; k >= 0; k--) {
      const w = word(before[k]);
      if (w === ')') depth++;
      else if (w === '(' && depth-- === 0) return /^(in|notin)$/i.test(word(before[k - 1]));
    }
    return false;
  };
  if (last && (word(last) === '(' || word(last) === ',') && inList()) return { ...field, want: 'value', ...fieldBefore() };
  if (!last || (last.kind === 'keyword' && /^(and|or|not)$/i.test(word(last))) || ['&&', '||', '!', '('].includes(word(last))) return { ...field, want: 'field' };
  if (last.kind === 'field') {
    const w = word(last);
    return { ...field, want: 'op', field: w, ...(w.startsWith('labels.') ? { label: w.slice('labels.'.length) } : byName.has(w) ? { variable: byName.get(w) } : {}) };
  }
  if (last.kind === 'op') return { ...field, want: 'value', ...fieldBefore() };
  if (last.kind === 'value' || last.kind === 'string' || last.kind === 'number' || (last.kind === 'keyword' && /^(true|false|null)$/.test(word(last))) || word(last) === ')')
    return { ...field, want: 'join' };
  return undefined;
}
