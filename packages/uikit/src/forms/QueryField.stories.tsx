import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { QueryField, type QueryPart, type QueryProblem, type QuerySuggestions } from './QueryField';

/*
 * A toy language of its own (the kit knows none): field op value, joined by
 * and / or — what each word is, what is wrong, what may come next, as an
 * owner (a filter's CEL) would say them.
 */

const FIELDS: Record<string, { type: 'string' | 'number' | 'bool'; values?: [string, number][] }> = {
  status: {
    type: 'string',
    values: [
      ['Running', 42],
      ['Pending', 3],
      ['CrashLoopBackOff', 2],
      ['Error', 1],
      ['Completed', 7],
    ],
  },
  restarts: { type: 'number' },
  node: {
    type: 'string',
    values: [
      ['kube-1', 20],
      ['kube-2', 18],
      ['kube-3', 17],
    ],
  },
  namespace: {
    type: 'string',
    values: [
      ['shop', 12],
      ['kube-system', 21],
      ['media', 9],
    ],
  },
  ready: {
    type: 'bool',
    values: [
      ['true', 48],
      ['false', 7],
    ],
  },
  'labels.app': {
    type: 'string',
    values: [
      ['web', 6],
      ['db', 2],
      ['cache', 2],
    ],
  },
};
const OPS = ['=', '!=', '>', '<', 'in'];
const JOINS = ['and', 'or'];

interface Word {
  text: string;
  start: number;
  end: number;
}

const wordsOf = (text: string): Word[] => [...text.matchAll(/"[^"]*"?|[=!<>]+|[^\s=!<>"]+/g)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));

/** What each word is: field, op, value, join, by its place (field op value, again after a join). */
function read(text: string) {
  const parts: QueryPart[] = [];
  const problems: QueryProblem[] = [];
  let field: string | undefined;
  wordsOf(text).forEach((w, i) => {
    const place = i % 4;
    if (place === 0) {
      field = w.text;
      parts.push({ ...w, kind: 'field' });
      if (!FIELDS[w.text]) problems.push({ ...w, message: `pods.v1 has no field ${w.text}` });
    } else if (place === 1) {
      parts.push({ ...w, kind: 'op' });
      if (!OPS.includes(w.text)) problems.push({ ...w, message: `${w.text} is not an operator: ${OPS.join(' ')}` });
    } else if (place === 2) {
      const spec = field ? FIELDS[field] : undefined;
      const number = /^-?\d+(\.\d+)?$/.test(w.text);
      parts.push({ ...w, kind: number ? 'number' : 'string' });
      if (spec?.type === 'number' && !number) problems.push({ ...w, message: `${field} is a number` });
      else if (spec?.values && !spec.values.some(([v]) => v === w.text.replace(/"/g, ''))) problems.push({ ...w, tone: 'warn', message: `no pod has ${field} ${w.text} now` });
    } else {
      parts.push({ ...w, kind: 'keyword' });
      if (!JOINS.includes(w.text)) problems.push({ ...w, message: 'and, or' });
    }
  });
  return { parts, problems };
}

/** What may go at the caret: the word it is in (or a new one), by its place. */
function suggest(text: string, caret: number): QuerySuggestions | undefined {
  const words = wordsOf(text);
  const inWord = words.findIndex((w) => caret >= w.start && caret <= w.end);
  const index = inWord >= 0 ? inWord : words.filter((w) => w.end < caret).length;
  const word = inWord >= 0 ? words[inWord] : { text: '', start: caret, end: caret };
  const typed = text.slice(word.start, caret).toLowerCase();
  const place = index % 4;
  const field = words[index - (place === 2 ? 2 : 1)]?.text;
  const all =
    place === 0
      ? Object.entries(FIELDS).map(([f, s]) => ({ value: `${f} `, title: f, hint: s.type, kind: 'field' as const }))
      : place === 1
        ? OPS.map((o) => ({ value: `${o} `, title: o, kind: 'op' as const }))
        : place === 2
          ? (FIELDS[field ?? '']?.values ?? []).map(([v, n]) => ({ value: `${v} `, title: v, hint: String(n) }))
          : JOINS.map((j) => ({ value: `${j} `, title: j, kind: 'keyword' as const }));
  const items = all.filter((s) => (s.title ?? s.value).toLowerCase().includes(typed) && s.value.trim() !== word.text);
  return items.length ? { from: word.start, to: word.end, items } : undefined;
}

function Toy({ initial = '', code = false }: { initial?: string; code?: boolean }) {
  const [value, setValue] = useState(initial);
  const [asked, setAsked] = useState('');
  const { parts, problems } = read(value);
  return (
    <div style={{ maxWidth: '560px', display: 'grid', gap: '12px' }}>
      <QueryField
        label="Filter pods"
        placeholder="status = Running and restarts > 3"
        value={value}
        onChange={setValue}
        onSubmit={setAsked}
        parts={parts}
        problems={problems}
        suggest={suggest}
        code={code}
      />
      <span class="uk-muted">asked: {asked || '—'}</span>
    </div>
  );
}

const meta = {
  title: 'Forms/QueryField',
  component: Toy,
} satisfies Meta<typeof Toy>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Typed: Story = { args: { initial: 'status = CrashLoopBackOff and restarts > 3' } };
export const Wrong: Story = { args: { initial: 'phase = Running and restarts > many and node = kube-9' } };
export const Code: Story = { args: { initial: 'status = Running or labels.app = web', code: true } };
