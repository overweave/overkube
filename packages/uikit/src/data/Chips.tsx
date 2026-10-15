import { type ComponentChildren, createContext, Fragment } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { copyText } from '../lib/clipboard';
import { Tip } from '../overlays/Tip';

/*
 * Labels or annotations as chips: each its key (its prefix — a domain and
 * a slash — quieter) and its value, cut short when long (in full under the
 * pointer: a tip). A click copies "key=value" (the chip glows a moment). By key; so many
 * at first, the rest behind "+N", and back. Compact (a table's cell, one
 * line): every one, cut in the middle — a key's prefix its start and end
 * (app…io/name), a long value too (9b8ee5cb…bbd6fee4) — in full under the
 * pointer; no "+N", what does not fit cut at its edge.
 */

export interface ChipsLabels {
  /** The button showing the rest. */
  more: (count: number) => string;
  /** The button hiding them again. */
  less: string;
  /** A chip's name: what a click on it does. */
  copy: (text: string) => string;
  /** Said over a chip a moment, once copied. */
  copied: string;
}

const LABELS: ChipsLabels = { more: (n) => `+${n}`, less: 'Show less', copy: (t) => `Copy ${t}`, copied: '✓ Copied' };

/** A value longer than this may be cut short. */
const LONG = 24;

/** Cut in the middle, its start and end kept (short enough: as it is). */
export const middle = (text: string, head: number, tail: number) => (text.length > head + tail + 1 ? `${text.slice(0, head)}…${text.slice(-tail)}` : text);

/** How long a copied chip says so. */
const COPIED_MS = 1200;

export interface ChipsProps {
  items?: Record<string, string>;
  /** Shown at first; the rest behind "+N". */
  max?: number;
  labels?: ChipsLabels;
  /** One line: every one, prefixes folded, no "+N". */
  compact?: boolean;
  /** Each item as it is drawn (none: a Chip). */
  chip?: (key: string, value: string) => ComponentChildren;
}

/** The one of them last copied (marked a moment) — one at a time, however each is drawn — and what is said of it (one place to say it). */
interface Copying {
  key: string | undefined;
  said: string;
  set: (key: string | undefined, said?: string) => void;
}
const Copied = createContext<Copying | null>(null);

export function Chips({ items, max = 8, compact = false, labels = LABELS, chip }: ChipsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<{ key: string | undefined; said: string }>({ key: undefined, said: '' });
  const entries = Object.entries(items ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <span class="uk-muted">—</span>;
  const shown = open || compact ? entries : entries.slice(0, max);
  const rest = entries.length - shown.length;
  return (
    <Copied.Provider value={{ ...copied, set: (key, said = '') => setCopied({ key, said: key ? said : '' }) }}>
      <span class="uk-chips">
        {shown.map(([k, v]) => (
          <Fragment key={k}>{chip ? chip(k, v) : <Chip name={k} value={v} folded={compact} labels={labels} />}</Fragment>
        ))}
        {rest > 0 && (
          <button type="button" class="uk-chip uk-chip-more" onClick={() => setOpen(true)}>
            {labels.more(rest)}
          </button>
        )}
        {open && !compact && entries.length > max && (
          <button type="button" class="uk-chip uk-chip-more" onClick={() => setOpen(false)}>
            {labels.less}
          </button>
        )}
      </span>
      {/* Said to those who cannot see it (the mark over a chip is only seen): one place for all of them. */}
      <span class="uk-sr-only" role="status">
        {copied.said}
      </span>
    </Copied.Provider>
  );
}

/** One of them: its key (its prefix quieter; folded, cut in its middle), its value (folded and long: cut in its middle) (cut short when long); a click copies "key=value". */
export function Chip({ name, value, folded = false, labels = LABELS }: { name: string; value: string; folded?: boolean; labels?: Pick<ChipsLabels, 'copy' | 'copied'> }) {
  // Among others (Chips): one marked at a time, said once for all of them; alone, its own (and said by itself).
  const shared = useContext(Copied);
  const [own, setOwn] = useState<string>();
  const copied = (shared ? shared.key : own) === name;
  const mark = (key: string | undefined) => (shared ? shared.set(key, labels.copied) : setOwn(key));
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => mark(undefined), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  const slash = name.lastIndexOf('/');
  const text = `${name}=${value}`;
  return (
    <>
      <Tip content={() => text}>
        <button
          type="button"
          class="uk-chip"
          aria-label={labels.copy(text)}
          data-copied={copied ? '' : undefined}
          data-copied-label={labels.copied}
          onClick={() => copyText(text).then((done) => done && mark(name))}
        >
          {/* Its key: its prefix (giving way first, short of room) and its name (never cut). */}
          {slash >= 0 && <span class="uk-chip-key uk-chip-prefix">{folded ? `${middle(name.slice(0, slash), 3, 2)}/` : name.slice(0, slash + 1)}</span>}
          <span class="uk-chip-key uk-chip-name">{name.slice(slash + 1)}</span>
          {/* A short value is never cut (the key's prefix gives way); a long one (a JSON, a certificate) is. */}
          {value !== '' && (
            <span class="uk-chip-value" data-long={!folded && value.length > LONG ? '' : undefined}>
              {folded && value.length > LONG ? middle(value, 8, 8) : value}
            </span>
          )}
        </button>
      </Tip>
      {/* Alone: said to those who cannot see it by itself (among others, Chips says it). */}
      {!shared && (
        <span class="uk-sr-only" role="status">
          {copied ? labels.copied : ''}
        </span>
      )}
    </>
  );
}
