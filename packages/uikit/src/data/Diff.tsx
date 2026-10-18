import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';

/*
 * Two texts compared, as a code host shows a file's changes: its head (its
 * name, how many lines come and go, a bar of them); its hunks, each headed
 * as git heads them (@@ -from,lines +from,lines @@), a button before it
 * showing the unchanged lines it skips; a row a line — its number before
 * and after, its mark, its text (not wrapped: it scrolls sideways) — those
 * gone an error's tint, those come an ok's, deeper in their numbers; a line
 * changed into another, what changed in it deeper still. The gone before
 * the come where both are.
 */

type Mark = ' ' | '-' | '+';
type Line = [mark: Mark, text: string];

/** Past this many cells (lines before × after, between what both start and end with), no run in common sought: all gone, all come. */
const MOST = 4_000_000;

/** Their lines compared (the longest run in common kept; what both start and end with first set aside). */
export function diffLines(a: string, b: string): Line[] {
  const x = a.split('\n');
  const y = b.split('\n');
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
  const same = (lines: string[]) => lines.map((l): Line => [' ', l]);
  const [xs, ys] = [x.slice(head, x.length - tail), y.slice(head, y.length - tail)];
  const middle: Line[] = xs.length * ys.length > MOST ? [...xs.map((l): Line => ['-', l]), ...ys.map((l): Line => ['+', l])] : lcsOf(xs, ys);
  return [...same(x.slice(0, head)), ...middle, ...same(x.slice(x.length - tail))];
}

function lcsOf(x: string[], y: string[]): Line[] {
  const [n, m] = [x.length, y.length];
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  const at = (i: number, j: number) => lcs[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] as Uint32Array;
    for (let j = m - 1; j >= 0; j--) row[j] = x[i] === y[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const out: Line[] = [];
  let [i, j] = [0, 0];
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      out.push([' ', x[i] ?? '']);
      i++;
      j++;
    } else if (i < n && (j >= m || at(i + 1, j) >= at(i, j + 1))) out.push(['-', x[i++] ?? '']);
    else out.push(['+', y[j++] ?? '']);
  }
  return out;
}

/** Lines kept around a change, each side. */
const CONTEXT = 3;

interface Row {
  mark: Mark;
  text: string;
  before?: number;
  after?: number;
  /** Lines before and after so far (this one too): where a hunk with none on one side starts, as git says it. */
  seen: [before: number, after: number];
  /** What changed in it, of a line changed into another: [start, end) of its text. */
  changed?: [number, number];
}

const WORD = /[\w.-]/;

/** A line changed into another (a run gone, the same many come; what changed: whole words): what differs between them, past what they share at each end. */
function paired(rows: Row[]) {
  for (let k = 0; k < rows.length; ) {
    let gone = k;
    while (rows[gone]?.mark === '-') gone++;
    let come = gone;
    while (rows[come]?.mark === '+') come++;
    if (gone > k && come - gone === gone - k)
      for (let i = 0; i < gone - k; i++) {
        const [a, b] = [rows[k + i] as Row, rows[gone + i] as Row];
        let s = 0;
        while (s < a.text.length && a.text[s] === b.text[s]) s++;
        let e = 0;
        while (e < a.text.length - s && e < b.text.length - s && a.text[a.text.length - 1 - e] === b.text[b.text.length - 1 - e]) e++;
        // Whole words: back to where the first one starts, on to where the last one ends.
        while (s > 0 && WORD.test(a.text[s - 1] ?? '')) s--;
        while (e > 0 && WORD.test(a.text[a.text.length - e] ?? '') && WORD.test(b.text[b.text.length - e] ?? '')) e--;
        a.changed = [s, a.text.length - e];
        b.changed = [s, b.text.length - e];
      }
    k = Math.max(come, k + 1);
  }
}

/** A hunk: its rows, those before it it skips. */
interface Hunk {
  rows: Row[];
  skipped: Row[];
}

const BLOCKS = 5;

/** Two texts' lines compared, numbered, paired, cut into hunks (those after the last: its tail). */
function laidOut(before: string, after: string) {
  const lines = diffLines(before, after);
  let [b, a] = [0, 0];
  const rows: Row[] = lines.map(([mark, text]) => {
    if (mark !== '+') b++;
    if (mark !== '-') a++;
    return { mark, text, seen: [b, a], ...(mark !== '+' ? { before: b } : {}), ...(mark !== '-' ? { after: a } : {}) };
  });
  paired(rows);
  const near = (k: number) => lines.slice(Math.max(0, k - CONTEXT), k + CONTEXT + 1).some(([d]) => d !== ' ');
  const hunks: Hunk[] = [];
  let skipped: Row[] = [];
  for (const [k, r] of rows.entries()) {
    if (!near(k)) {
      skipped.push(r);
      continue;
    }
    const last = hunks[hunks.length - 1];
    if (last && !skipped.length) last.rows.push(r);
    else hunks.push({ rows: [r], skipped });
    skipped = [];
  }
  return { lines, rows, hunks, tail: skipped };
}

export function Diff({
  before,
  after,
  title,
  same = 'No differences.',
  expand = 'Show the lines skipped',
}: {
  before: string;
  after: string;
  /** Its head's name (a file's): none, no head. */
  title?: ComponentChildren;
  same?: string;
  /** The skip button's name, for those who cannot see it. */
  expand?: string;
}) {
  const { lines, rows, hunks, tail } = useMemo(() => laidOut(before, after), [before, after]);
  // Hunks opened, of these texts (others given: none).
  const [opened, setOpened] = useState<{ of: Row[]; hunks: ReadonlySet<number> }>({ of: rows, hunks: new Set() });
  const open = opened.of === rows ? opened.hunks : new Set<number>();
  const setOpen = (hunks: ReadonlySet<number>) => setOpened({ of: rows, hunks });
  const [added, removed] = [lines.filter(([d]) => d === '+').length, lines.filter(([d]) => d === '-').length];
  const total = added + removed;
  const green = total ? Math.round((added / total) * BLOCKS) : 0;
  const line = (r: Row, key: string) => (
    <div key={key} class="uk-diff-row" data-d={r.mark}>
      <span class="uk-diff-n">{r.before ?? ''}</span>
      <span class="uk-diff-n">{r.after ?? ''}</span>
      <span class="uk-diff-text">
        <span class="uk-diff-mark">{r.mark === '-' ? '−' : r.mark === '+' ? '+' : ' '}</span>
        {r.changed && r.changed[1] > r.changed[0] ? (
          <>
            {r.text.slice(0, r.changed[0])}
            <mark>{r.text.slice(r.changed[0], r.changed[1])}</mark>
            {r.text.slice(r.changed[1])}
          </>
        ) : (
          r.text
        )}
      </span>
    </div>
  );
  /** A hunk's head, as git says it: where it starts and how many lines, before and after. */
  const head = (h: Hunk) => {
    const count = (side: 'before' | 'after') => h.rows.filter((r) => r[side] !== undefined).length;
    // None on a side: the line it comes after.
    const from = (side: 'before' | 'after', k: 0 | 1) => (count(side) ? (h.rows.find((r) => r[side] !== undefined)?.[side] ?? 0) : (h.rows[0]?.seen[k] ?? 0));
    return `@@ -${from('before', 0)},${count('before')} +${from('after', 1)},${count('after')} @@`;
  };
  return (
    <div class="uk-diff">
      {title !== undefined && (
        <div class="uk-diff-head">
          <span class="uk-diff-title">{title}</span>
          <span class="uk-diff-counts">
            <b data-d="+">+{added}</b>
            <b data-d="-">−{removed}</b>
            <span class="uk-diff-blocks" aria-hidden="true">
              {Array.from({ length: BLOCKS }, (_, i) => (
                <i key={i} data-d={!total ? ' ' : i < green ? '+' : i < green + Math.round((removed / total) * BLOCKS) ? '-' : ' '} />
              ))}
            </span>
          </span>
        </div>
      )}
      {!total ? (
        <p class="uk-diff-same">{same}</p>
      ) : (
        <div class="uk-diff-body">
          <div class="uk-diff-lines">
            {hunks.flatMap((h, k) => [
              open.has(k) ? (
                h.skipped.map((r, i) => line(r, `${k}s${i}`))
              ) : (
                <div key={`${k}h`} class="uk-diff-row uk-diff-hunk">
                  <span class="uk-diff-expand">
                    {h.skipped.length > 0 && (
                      <button type="button" aria-label={expand} title={expand} onClick={() => setOpen(new Set([...open, k]))}>
                        <Icon name="unfold" />
                      </button>
                    )}
                  </span>
                  <span class="uk-diff-text">{head(h)}</span>
                </div>
              ),
              ...h.rows.map((r, i) => line(r, `${k}.${i}`)),
            ])}
            {tail.length > 0 &&
              (open.has(-1) ? (
                tail.map((r, i) => line(r, `t${i}`))
              ) : (
                <div class="uk-diff-row uk-diff-hunk">
                  <span class="uk-diff-expand">
                    <button type="button" aria-label={expand} title={expand} onClick={() => setOpen(new Set([...open, -1]))}>
                      <Icon name="unfold" />
                    </button>
                  </span>
                  <span class="uk-diff-text" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
