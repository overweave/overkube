import type { ComponentChildren } from 'preact';

/** Text with what matches a query marked: its first match (one query), or every match of any of them (words). */
export function Highlight({ text, query }: { text: string; query: string | readonly string[] }) {
  const words = (typeof query === 'string' ? [query] : query).map((q) => q.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const lower = text.toLowerCase();
  // Where each mark is (one query: its first; words: each of each, the longest where they meet).
  const marks: [number, number][] = [];
  for (const w of words) {
    for (let at = lower.indexOf(w); at >= 0; at = typeof query === 'string' ? -1 : lower.indexOf(w, at + w.length)) marks.push([at, at + w.length]);
  }
  marks.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: ComponentChildren[] = [];
  let from = 0;
  for (const [start, end] of marks) {
    if (start < from) continue;
    out.push(text.slice(from, start), <mark class="uk-mark">{text.slice(start, end)}</mark>);
    from = end;
  }
  out.push(text.slice(from));
  return <>{out}</>;
}
