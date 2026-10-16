import { kindRef } from './scan.ts';

/*
 * What a loose search, a filter's sugar and a selector's link all take: a
 * label selector as kubectl takes it (its requirements, each where it is
 * in what was typed; held to labels as kubectl holds them), words (each in
 * a name, ASCII's case aside) — one grammar, one meaning, whoever asks (a
 * search's test here, a filter's CEL in @overkube/cel). And a kind by its
 * ref, among many, looked up once.
 */

/** A selector's requirement: a key equal to (eq), not equal to (ne), one of (in), none of (notin) the values; had (exists), not had (absent). Where it is in what was typed (at). */
export interface Requirement {
  readonly key: string;
  readonly op: 'eq' | 'ne' | 'in' | 'notin' | 'exists' | 'absent';
  readonly values: readonly string[];
  readonly at: number;
}

/** A selector as an object says it (a workload's: matchLabels, matchExpressions). */
export interface LabelSelector {
  matchLabels?: Readonly<Record<string, string>>;
  matchExpressions?: readonly { key: string; operator: string; values?: readonly string[] }[];
}

const KEY = '([A-Za-z0-9][A-Za-z0-9._/-]*)';
const VALUE = '([A-Za-z0-9._-]*)';
const ONE = '[A-Za-z0-9._-]+';
const LIST = `\\(\\s*(${ONE}(?:\\s*,\\s*${ONE})*)\\s*\\)`;
const FORMS: [RegExp, (m: RegExpExecArray) => Omit<Requirement, 'at'>][] = [
  [new RegExp(`^\\s*${KEY}\\s*!=\\s*${VALUE}\\s*$`), (m) => ({ key: m[1], op: 'ne', values: [m[2]] })],
  [new RegExp(`^\\s*${KEY}\\s*==?\\s*${VALUE}\\s*$`), (m) => ({ key: m[1], op: 'eq', values: [m[2]] })],
  [new RegExp(`^\\s*${KEY}\\s+in\\s*${LIST}\\s*$`), (m) => ({ key: m[1], op: 'in', values: m[2].split(',').map((v) => v.trim()) })],
  [new RegExp(`^\\s*${KEY}\\s+notin\\s*${LIST}\\s*$`), (m) => ({ key: m[1], op: 'notin', values: m[2].split(',').map((v) => v.trim()) })],
  [new RegExp(`^\\s*!\\s*${KEY}\\s*$`), (m) => ({ key: m[1], op: 'absent', values: [] })],
  [new RegExp(`^\\s*${KEY}\\s*$`), (m) => ({ key: m[1], op: 'exists', values: [] })],
];

/** A label selector as kubectl takes it (by commas: key=value, key!=value, key in (a,b), key notin (a,b), key, !key); none: not one (or of keys alone: words, not a selector). */
export function parseSelector(text: string): Requirement[] | undefined {
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
  const out: Requirement[] = [];
  for (const [part, at] of parts) {
    const form = FORMS.find(([re]) => re.test(part));
    if (!form) return undefined;
    out.push({ ...form[1](form[0].exec(part) as RegExpExecArray), at: at + (part.length - part.trimStart().length) });
  }
  // Keys alone (web): words, not labels had — a selector says more of one of its keys.
  return out.some((r) => r.op !== 'exists') ? out : undefined;
}

/** An object's selector as requirements (in the order it says them). */
export function requirementsOf(selector: LabelSelector | undefined): Requirement[] {
  const ops: Record<string, Requirement['op']> = { In: 'in', NotIn: 'notin', Exists: 'exists', DoesNotExist: 'absent' };
  return [
    ...Object.entries(selector?.matchLabels ?? {}).map(([key, v]): Requirement => ({ key, op: 'eq', values: [v], at: 0 })),
    ...(selector?.matchExpressions ?? []).flatMap(({ key, operator, values = [] }): Requirement[] => (ops[operator] ? [{ key, op: ops[operator], values, at: 0 }] : [])),
  ];
}

/** Whether labels hold to the requirements, as kubectl holds them: eq and in, of a label had; ne and notin, of one had with another value or not had. */
export function holdsTo(requirements: readonly Requirement[], labels: Readonly<Record<string, string>> | undefined): boolean {
  const l = labels ?? {};
  return requirements.every(({ key, op, values }) => {
    const had = Object.hasOwn(l, key);
    switch (op) {
      case 'eq':
        return had && l[key] === values[0];
      case 'ne':
        return !had || l[key] !== values[0];
      case 'in':
        return had && values.includes(l[key]);
      case 'notin':
        return !had || !values.includes(l[key]);
      case 'exists':
        return had;
      // absent
      default:
        return !had;
    }
  });
}

/** ASCII's capitals small (CEL's lowerAscii: other letters as they are). */
export const lowerAscii = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Words as typed (a quoted one whole, its quotes off), each where it is. */
export function wordsOf(text: string): { word: string; at: number; quoted: boolean }[] {
  return [...text.matchAll(/"[^"]*"|'[^']*'|[^\s"']+/g)].map((m) => {
    const quoted = /^["']/.test(m[0]);
    return { word: quoted ? m[0].slice(1, -1) : m[0], at: m.index ?? 0, quoted };
  });
}

/** A loose search's text: a label selector, or words (each in a name, as typed, ASCII's case aside); nothing typed: none. */
export type Loose = { readonly selector: readonly Requirement[] } | { readonly words: readonly string[] };

export function parseLoose(text: string): Loose | undefined {
  const selector = parseSelector(text);
  if (selector) return { selector };
  const words = wordsOf(text)
    .map((w) => lowerAscii(w.word))
    .filter(Boolean);
  return words.length ? { words } : undefined;
}

/** How well a name matches words (0: it is one of them; 1: it starts with one; 2: each is in it); none: not all of them are. */
export function rankOf(words: readonly string[], name: string): number | undefined {
  const n = lowerAscii(name);
  let worst = 0;
  for (const w of words) {
    const r = n === w ? 0 : n.startsWith(w) ? 1 : n.includes(w) ? 2 : undefined;
    if (r === undefined) return undefined;
    worst = Math.max(worst, r);
  }
  return worst;
}

// ── A kind by its ref, among many ──────────────────────────────────────────

type KindLike = { readonly group: string; readonly version: string; readonly plural: string };

const indexes = new WeakMap<ReadonlyMap<string, KindLike>, Map<string, KindLike>>();

/** The kind a ref names (pods.v1, deployments.v1.apps), of a map of kinds (discovery's: by id) — by an index made once for it. */
export function kindOfRef<K extends KindLike>(kinds: ReadonlyMap<string, K>, ref: string): K | undefined {
  let index = indexes.get(kinds);
  if (!index) {
    index = new Map([...kinds.values()].map((k) => [kindRef(k), k]));
    indexes.set(kinds, index);
  }
  return index.get(ref) as K | undefined;
}
