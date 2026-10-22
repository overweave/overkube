import { type ComponentChildren, createContext } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';

/*
 * Fields at a glance, laid out by what they hold: each field's natural
 * width measured (its label and its value on one line), then as many
 * columns as fit, each as wide as its widest field — aligned down the rows
 * as a table's, what is left shared out; nothing cut while there is room
 * (a narrower grid: more rows, not shorter fields). One wider than half the
 * grid: a row of its own, after the rest. Laid out again as its width or
 * what is in it changes; till it is measured (not drawn yet, no layout), as
 * many columns of 120px as fit.
 *
 * Its fields: any .uk-field in it (Field, a Meter, an addon's own). A
 * Field's value on one line, always: one wider than its line cut with an
 * ellipsis, Show all at the line's end — opened, on as many lines as it
 * takes, Show less.
 */

export interface FieldsLabels {
  more: string;
  less: string;
}

const LABELS: FieldsLabels = { more: 'Show all', less: 'Show less' };

const Labels = createContext<FieldsLabels>(LABELS);

/** Each Field's check (cut or not), by its element: run as its grid is laid out (its line's width set then — not left to an observer's next call). */
const checks = new WeakMap<Element, () => void>();

/** Between its columns (px): .uk-fields' column gap. */
const GAP = 20;

/** Fields of these natural widths, in order, in as many columns as fit: each column its widest field's width (one: the widest, at most the grid's). */
export function columnsOf(widths: readonly number[], width: number, gap = GAP): number[] {
  for (let k = widths.length; k > 1; k--) {
    const cols = Array.from({ length: k }, (_, c) => Math.ceil(Math.max(0, ...widths.filter((_, i) => i % k === c))));
    if (cols.reduce((a, b) => a + b, 0) + gap * (k - 1) <= width) return cols;
  }
  return [Math.min(width, Math.ceil(Math.max(0, ...widths)))];
}

/** Its fields laid out: measured on one line each, its columns set, those wider than half of it a row of their own. */
function layout(dl: HTMLElement) {
  const width = dl.clientWidth;
  // Not drawn (hidden, no layout): as it is.
  if (!width) return;
  const fields = [...dl.querySelectorAll<HTMLElement>('.uk-field')].filter((f) => f.parentElement?.closest('.uk-fields') === dl);
  dl.setAttribute('data-measure', '');
  // As laid out, not as drawn: a transform over it (a dialog opening, scaled up) would make each narrower than it is — and nothing lays it out again once it ends.
  const scale = dl.offsetWidth ? dl.getBoundingClientRect().width / dl.offsetWidth : 1;
  const natural = fields.map((f) => f.getBoundingClientRect().width / (scale || 1));
  dl.removeAttribute('data-measure');
  const wide = natural.map((w) => w > width / 2);
  fields.forEach((f, i) => {
    f.toggleAttribute('data-wide', wide[i]);
  });
  const template = columnsOf(
    natural.filter((_, i) => !wide[i]),
    width,
  )
    .map((w) => `minmax(${w}px, 1fr)`)
    .join(' ');
  if (dl.style.gridTemplateColumns !== template) dl.style.gridTemplateColumns = template;
  for (const f of fields) checks.get(f)?.();
}

export function Fields({ labels = LABELS, children }: { labels?: FieldsLabels; children: ComponentChildren }) {
  const dl = useRef<HTMLDListElement>(null);
  useLayoutEffect(() => {
    const el = dl.current;
    if (!el) return;
    const run = () => layout(el);
    run();
    // Its width, what is in it (a field come, a value changed, one opened), its fonts come: laid out again.
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(run);
    resized?.observe(el);
    const changed = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(run);
    changed?.observe(el, { subtree: true, childList: true, characterData: true });
    void document.fonts?.ready.then(run);
    return () => {
      resized?.disconnect();
      changed?.disconnect();
    };
  }, []);
  return (
    <Labels.Provider value={labels}>
      <dl ref={dl} class="uk-fields">
        {children}
      </dl>
    </Labels.Provider>
  );
}

/** A field: its label over its value, on one line — cut where it is wider than its line, Show all at its end. */
export function Field({ label, children }: { label: ComponentChildren; children: ComponentChildren }) {
  const labels = useContext(Labels);
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const dd = line.current;
    const v = value.current;
    if (!dd || !v || open) return;
    // Its value's width against its whole line's (not the room its Show all leaves: drawn, it would stay cut).
    const check = () => setCut(v.scrollWidth > dd.clientWidth + 1);
    check();
    const field = box.current;
    if (field) checks.set(field, check);
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(check);
    resized?.observe(dd);
    const changed = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(check);
    changed?.observe(v, { subtree: true, childList: true, characterData: true });
    return () => {
      if (field) checks.delete(field);
      resized?.disconnect();
      changed?.disconnect();
    };
  }, [open]);
  return (
    <div ref={box} class="uk-field" data-open={open ? '' : undefined}>
      <dt>{label}</dt>
      <dd ref={line} class="uk-field-line">
        <span ref={value} class="uk-field-value">
          {children}
        </span>
        {(cut || open) && (
          <button type="button" class="uk-link uk-field-more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? labels.less : labels.more}
          </button>
        )}
      </dd>
    </div>
  );
}
