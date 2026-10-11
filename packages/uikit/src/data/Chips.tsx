import { useEffect, useState } from 'preact/hooks';
import { copyText } from '../lib/clipboard';

/*
 * Labels or annotations as chips: each its key (its prefix — a domain and
 * a slash — quieter) and its value, cut short when long (in full under the
 * pointer). A click copies "key=value" (the chip glows a moment). By key; so many
 * at first, the rest behind "+N", and back.
 */

export interface ChipsLabels {
  /** The button showing the rest. */
  more: (count: number) => string;
  /** The button hiding them again. */
  less: string;
  /** A chip's name: what a click on it does. */
  copy: (text: string) => string;
}

const LABELS: ChipsLabels = { more: (n) => `+${n}`, less: 'Show less', copy: (t) => `Copy ${t}` };

/** A value longer than this may be cut short. */
const LONG = 24;

/** How long a copied chip says so. */
const COPIED_MS = 1200;

export interface ChipsProps {
  items?: Record<string, string>;
  /** Shown at first; the rest behind "+N". */
  max?: number;
  labels?: ChipsLabels;
}

export function Chips({ items, max = 8, labels = LABELS }: ChipsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string>();
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(undefined), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  const entries = Object.entries(items ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <span class="uk-muted">—</span>;
  const shown = open ? entries : entries.slice(0, max);
  const rest = entries.length - shown.length;
  const copy = (key: string, text: string) => {
    copyText(text).then((done) => done && setCopied(key));
  };
  return (
    <span class="uk-chips">
      {shown.map(([k, v]) => {
        const slash = k.lastIndexOf('/');
        const text = `${k}=${v}`;
        return (
          <button type="button" class="uk-chip" key={k} title={text} aria-label={labels.copy(text)} data-copied={copied === k ? '' : undefined} onClick={() => copy(k, text)}>
            {/* Its key: its prefix (giving way first, short of room) and its name (never cut). */}
            {slash >= 0 && <span class="uk-chip-key uk-chip-prefix">{k.slice(0, slash + 1)}</span>}
            <span class="uk-chip-key uk-chip-name">{k.slice(slash + 1)}</span>
            {/* A short value is never cut (the key's prefix gives way); a long one (a JSON, a certificate) is. */}
            {v !== '' && (
              <span class="uk-chip-value" data-long={v.length > LONG ? '' : undefined}>
                {v}
              </span>
            )}
          </button>
        );
      })}
      {rest > 0 && (
        <button type="button" class="uk-chip uk-chip-more" onClick={() => setOpen(true)}>
          {labels.more(rest)}
        </button>
      )}
      {open && entries.length > max && (
        <button type="button" class="uk-chip uk-chip-more" onClick={() => setOpen(false)}>
          {labels.less}
        </button>
      )}
    </span>
  );
}
