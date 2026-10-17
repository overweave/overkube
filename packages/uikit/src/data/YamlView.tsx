import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { Icon } from '../display/Icon';
import { copyText } from '../lib/clipboard';

/*
 * YAML as it reads best: each line numbered, its parts in their colours —
 * a key, a string, a number, true/false/null, a comment, a list's dash, a
 * block of text (| or >: the lines under it) — told apart line by line, as
 * the YAML the page writes is (block style, one thing a line: not a parser
 * of any YAML). A key with lines under it folds them away (its line's
 * chevron), how many said in their place. Over it: how long it is; wrap,
 * a download, a copy (said so a moment).
 */

export interface YamlViewLabels {
  /** How long it is: so many lines, so many bytes. */
  size: (lines: number, size: string) => string;
  copy: string;
  copied: string;
  download: string;
  wrap: string;
  /** In place of the lines folded away. */
  folded: (lines: number) => string;
  fold: string;
}

const LABELS: YamlViewLabels = {
  size: (lines, size) => `${lines.toLocaleString()} lines · ${size}`,
  copy: 'Copy',
  copied: 'Copied',
  download: 'Download',
  wrap: 'Wrap lines',
  folded: (n) => `${n.toLocaleString()} lines`,
  fold: 'Fold',
};

/** A line's part and its kind (none: as it is). */
type Part = [text: string, kind?: 'key' | 'string' | 'number' | 'word' | 'comment' | 'mark' | 'block'];

const NUMBER = /^-?(\d+(\.\d+)?([eE][-+]?\d+)?|\.inf|\.nan)$/;
const WORD = /^(true|false|null|~|yes|no|on|off)$/i;
/** A key, its list's dashes taken off first (each read once: no line of them makes it slow). */
const KEY = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^\s:#'"][^:#]*?)(:)(\s|$)/;
const DASHES = /^(?:- )+/;

/** Where a comment starts: a # after a space (none: -1). */
function commentAt(text: string): number {
  for (let at = text.indexOf('#', 1); at > 0; at = text.indexOf('#', at + 1)) if (/\s/.test(text[at - 1])) return at - 1;
  return -1;
}

/** A value's parts: a quoted string, a number, a word, a block's mark, else as it is — a comment after it apart. */
function partsOfValue(text: string): Part[] {
  const at = commentAt(text);
  const comment = at < 0 ? undefined : text.slice(at);
  const value = comment === undefined ? text : text.slice(0, at);
  const out: Part[] = [];
  const v = value.trim();
  const lead = value.slice(0, value.length - value.trimStart().length);
  if (lead) out.push([lead]);
  if (v) out.push([v, /^["']/.test(v) ? 'string' : NUMBER.test(v) ? 'number' : WORD.test(v) ? 'word' : /^[|>][-+]?$/.test(v) || v === '[]' || v === '{}' ? 'mark' : 'string']);
  if (value.length > lead.length + v.length) out.push([value.slice(lead.length + v.length)]);
  if (comment !== undefined) out.push([comment, 'comment']);
  return out;
}

/** The lines, each its parts and its indent; a block's lines (under | or >): text. */
function linesOf(text: string): { parts: Part[]; indent: number }[] {
  let block = -1;
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const indent = line.length - line.trimStart().length;
      if (block >= 0 && (indent > block || !line.trim())) return { parts: [[line, 'block']], indent };
      block = -1;
      const body = line.slice(indent);
      const parts: Part[] = indent ? [[line.slice(0, indent)]] : [];
      if (body.startsWith('#')) return { parts: [...parts, [body, 'comment']], indent };
      const dashes = DASHES.exec(body)?.[0] ?? '';
      const key = KEY.exec(body.slice(dashes.length));
      if (key) {
        if (dashes) parts.push([dashes, 'mark']);
        parts.push([key[1], 'key'], [':', 'mark']);
        const rest = body.slice(dashes.length + key[0].length - key[3].length);
        if (/^\s*[|>][-+]?\s*(#.*)?$/.test(rest)) block = indent + dashes.length;
        parts.push(...partsOfValue(rest));
        return { parts, indent };
      }
      const dash = dashes || (body === '-' ? '-' : '');
      if (dash) parts.push([dash, 'mark']);
      parts.push(...partsOfValue(body.slice(dash.length)));
      return { parts, indent };
    });
}

/** Bytes as said: B, KB, MB. */
const sizeOf = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function YamlView({
  text,
  name = 'object',
  labels = LABELS,
  tools,
}: {
  text: string /** Its file's name, downloaded (without .yaml). */;
  name?: string;
  labels?: YamlViewLabels /** More over it, before its own. */;
  tools?: ComponentChildren;
}) {
  const lines = useMemo(() => linesOf(text), [text]);
  // Folded, by where each is (its line and those it is under): the same key folded still as the text changes (a watched object's).
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Where each line's own lines end (those deeper under it): none, it has none. */
  const ends = useMemo(() => {
    const out = new Map<number, number>();
    // A blank line goes with what is around it (a block of text has some): it ends nothing — nor is it the last one folded.
    const blank = (j: number) => !lines[j].parts.some(([t]) => t.trim());
    for (let i = 0; i < lines.length; i++) {
      let j = i + 1;
      while (j < lines.length && (lines[j].indent > lines[i].indent || blank(j))) j++;
      while (j > i + 1 && blank(j - 1)) j--;
      if (j > i + 1) out.set(i, j);
    }
    return out;
  }, [lines]);
  /** Each line's place: its text, under those it is under. */
  const places = useMemo(() => {
    const out: string[] = [];
    const under: { indent: number; place: string }[] = [];
    for (const [i, line] of lines.entries()) {
      while (under.length && under[under.length - 1].indent >= line.indent) under.pop();
      out[i] = `${under.at(-1)?.place ?? ''}\n${line.parts
        .map(([t]) => t)
        .join('')
        .trim()}`;
      if (ends.has(i)) under.push({ indent: line.indent, place: out[i] });
    }
    return out;
  }, [lines, ends]);
  const toggle = (i: number) => {
    const next = new Set(folded);
    next.has(places[i]) ? next.delete(places[i]) : next.add(places[i]);
    setFolded(next);
  };
  const shown: { i: number; skip?: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    shown.push({ i });
    const end = ends.get(i);
    if (end && folded.has(places[i])) {
      shown.push({ i, skip: end - i - 1 });
      i = end - 1;
    }
  }
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/yaml' }));
    a.download = `${name}.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div class="uk-yaml" data-wrap={wrap ? '' : undefined}>
      <div class="uk-yaml-bar">
        <span class="uk-yaml-size">{labels.size(lines.length, sizeOf(new TextEncoder().encode(text).length))}</span>
        <span class="uk-yaml-tools">
          {tools}
          <Button size="sm" variant="ghost" icon="wrap" title={labels.wrap} aria-pressed={wrap} onClick={() => setWrap(!wrap)} />
          <Button size="sm" variant="ghost" icon="download" title={labels.download} onClick={download} />
          <Button
            size="sm"
            icon={copied ? 'check' : 'copy'}
            onClick={() => {
              void copyText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? labels.copied : labels.copy}
          </Button>
        </span>
      </div>
      <div class="uk-yaml-body">
        {shown.map(({ i, skip }) =>
          skip !== undefined ? (
            <button key={`${i}-skip`} type="button" class="uk-yaml-line uk-yaml-skip" onClick={() => toggle(i)}>
              <span class="uk-yaml-n" />
              <span style={{ paddingLeft: `${lines[i].indent + 2}ch` }}>… {labels.folded(skip)}</span>
            </button>
          ) : (
            <div key={i} class="uk-yaml-line">
              <span class="uk-yaml-n">
                {ends.has(i) && (
                  <button type="button" class="uk-yaml-fold" aria-expanded={!folded.has(places[i])} aria-label={labels.fold} onClick={() => toggle(i)}>
                    <Icon name="chevron" />
                  </button>
                )}
                {i + 1}
              </span>
              <code>
                {lines[i].parts.map(([t, kind], n) =>
                  kind ? (
                    <span key={n} data-k={kind}>
                      {t}
                    </span>
                  ) : (
                    t
                  ),
                )}
              </code>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
