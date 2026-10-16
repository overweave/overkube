import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Highlight } from '../display/Highlight';
import { Icon } from '../display/Icon';
import { uid } from '../lib/focus';
import { Layer, usePlacedBy } from '../lib/layers';

/*
 * A query typed in one line, as its language has it (the kit knows none:
 * what each part of it is, what is wrong where, what may come next — its
 * owner's say). Its parts coloured as they are (a field, an operator, a
 * value), the part being typed marked, what is wrong underlined; and under
 * the part the caret is in — not under the whole field — a small card:
 * what is wrong with it, what may go there (arrows move, Tab or a press
 * takes one, Escape closes it); what is wrong under the pointer too. Enter:
 * the query asked, as it is (what is offered left open). A ) or , typed
 * right after a suggestion taken (its space after it): in that space's place.
 *
 * The text is an input's (the browser's caret, selection, undo), drawn
 * over a copy of it (the colours, the marks) that scrolls with it.
 */

/** What a part of the query is (its colour). */
export type QueryPartKind = 'field' | 'op' | 'keyword' | 'string' | 'number' | 'value' | 'function' | 'punct';

/** A part of the query: its characters, from start to end, what it is. */
export interface QueryPart {
  start: number;
  end: number;
  kind: QueryPartKind;
}

/** What is wrong (an error) or doubtful (a warning) with the query's characters, from start to end. */
export interface QueryProblem {
  start: number;
  end: number;
  message: string;
  tone?: 'error' | 'warn';
}

/** What may go in place of the characters from..to: its text (as put there), what it says, beside it what it is. */
export interface QuerySuggestion {
  value: string;
  title?: string;
  hint?: string;
  kind?: QueryPartKind;
}

export interface QuerySuggestions {
  from: number;
  to: number;
  items: readonly QuerySuggestion[];
}

export interface QueryFieldLabels {
  clear: string;
}

export const QUERY_FIELD_LABELS: QueryFieldLabels = { clear: 'Clear' };

export interface QueryFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter: the query asked, as it is (what is offered not taken). */
  onSubmit?: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Its parts, as its language reads it. */
  parts?: readonly QueryPart[];
  problems?: readonly QueryProblem[];
  /** What may go where the caret is (the text, the caret in it); none: nothing. */
  suggest?: (value: string, caret: number) => QuerySuggestions | undefined;
  /** At its start (its icon). */
  icon?: string;
  /** At its end (its tools: a mode, history), before its clear button. */
  end?: ComponentChildren;
  /** Its text as code (a language's: monospace). */
  code?: boolean;
  labels?: QueryFieldLabels;
}

/** Where the text is cut: at each part's, problem's, the current part's edges. */
function pieces(text: string, cuts: number[]): [number, number][] {
  const at = [...new Set([0, text.length, ...cuts.filter((c) => c > 0 && c < text.length)])].sort((a, b) => a - b);
  return at.slice(1).map((end, i) => [at[i], end]);
}

export function QueryField({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  parts = [],
  problems = [],
  suggest,
  icon = 'search',
  end,
  code = false,
  labels = QUERY_FIELD_LABELS,
}: QueryFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  /** Escape'd: closed till the text or the caret changes. */
  const [shut, setShut] = useState<string | null>(null);
  /** The problem under the pointer (its index), said as the caret's is. */
  const [hovered, setHovered] = useState<number>();
  /** Where a suggestion taken ended with a space it put there (a ) or , typed there: in its place). */
  const spaced = useRef<number | null>(null);
  const ids = useMemo(() => ({ list: uid('uk-query-list'), option: uid('uk-query-option'), note: uid('uk-query-note') }), []);

  const focused = caret !== null;
  const offered = focused && suggest ? suggest(value, caret) : undefined;
  const items = offered?.items ?? [];
  // The problem the caret is in (at its end too: just typed); else, none — the underline says it.
  const here = focused ? problems.find((p) => caret >= p.start && caret <= p.end) : undefined;
  const key = `${value}\u0000${caret}`;
  const listing = focused && shut !== key && items.length > 0;
  // Under the pointer (nothing offered meanwhile): said too.
  const pointed = !listing && hovered !== undefined ? problems[hovered] : undefined;
  const said = pointed ?? (focused && shut !== key ? here : undefined);
  const open = listing || said !== undefined;
  const range = (listing ? offered : undefined) ?? (said ? { from: said.start, to: said.end } : undefined);
  const pick = Math.min(active, Math.max(0, items.length - 1));

  // The one picked in sight (moved to by the arrows, down a long list).
  useLayoutEffect(() => {
    if (open) list.current?.children[pick]?.scrollIntoView?.({ block: 'nearest' });
  }, [pick, open]);

  const attach = usePlacedBy(anchor, { gap: 4 });
  // The part it is under moves as it is typed: placed again.
  useLayoutEffect(() => {
    if (open && card.current) attach(card.current);
  }, [open, range?.from, value]);

  /** The copy scrolled as the input is. */
  const follow = () => {
    const el = input.current;
    if (el && copy.current) copy.current.style.transform = `translateX(${-el.scrollLeft}px)`;
  };
  const track = () => {
    follow();
    setCaret(input.current?.selectionStart ?? null);
  };
  useLayoutEffect(follow, [value]);

  const take = (s: QuerySuggestion) => {
    if (!offered) return;
    const next = value.slice(0, offered.from) + s.value + value.slice(offered.to);
    const at = offered.from + s.value.length;
    spaced.current = s.value.endsWith(' ') ? at : null;
    onChange(next);
    setActive(0);
    requestAnimationFrame(() => {
      input.current?.setSelectionRange(at, at);
      track();
    });
  };

  const keydown = (e: KeyboardEvent) => {
    if (listing && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((pick + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (listing && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      take(items[pick]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setShut(key);
    } else if (e.key === 'Enter') {
      // Asked as it is (what is offered left as it is: Tab takes it).
      e.preventDefault();
      onSubmit?.(value);
    } else if ((e.key === ')' || e.key === ',' || e.key === ']') && caret !== null && spaced.current === caret && value[caret - 1] === ' ') {
      // Closing what a suggestion was taken into (in (web|): no space before it.
      e.preventDefault();
      const at = caret;
      spaced.current = null;
      onChange(value.slice(0, at - 1) + e.key + value.slice(at));
      requestAnimationFrame(() => {
        input.current?.setSelectionRange(at, at);
        track();
      });
    }
  };

  /** The problem under the pointer, of those drawn underlined (by where their characters are). */
  const point = (e: PointerEvent) => {
    const under = [...(copy.current?.querySelectorAll<HTMLElement>('[data-problem-at]') ?? [])].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const at = under ? Number(under.dataset.problemAt) : undefined;
    if (at !== hovered) setHovered(at);
  };

  // The copy: the text cut where a part, a problem, the current part begins or ends; the anchor where the card goes.
  const from = range?.from ?? caret ?? 0;
  const cuts = [...parts.flatMap((p) => [p.start, p.end]), ...problems.flatMap((p) => [p.start, p.end]), from, ...(range ? [range.to] : [])];
  const drawn = pieces(value, cuts).map(([s, e]) => {
    const part = parts.find((p) => s >= p.start && e <= p.end);
    const wrongAt = problems.findIndex((p) => s >= p.start && e <= p.end);
    const wrong = problems[wrongAt];
    const current = range && s >= range.from && e <= range.to && range.to > range.from;
    return (
      <span
        key={s}
        data-kind={part?.kind}
        data-problem={wrong ? (wrong.tone ?? 'error') : undefined}
        data-problem-at={wrong ? wrongAt : undefined}
        data-current={current || undefined}
      >
        {s === from && <span ref={anchor} class="uk-query-at" />}
        {value.slice(s, e)}
      </span>
    );
  });
  const errors = problems.filter((p) => (p.tone ?? 'error') === 'error');
  const typed = offered ? value.slice(offered.from, caret ?? offered.to) : '';

  return (
    <div class="uk-query" ref={box} data-code={code || undefined} data-error={errors.length > 0 || undefined}>
      <Icon name={icon} />
      <div class="uk-query-line">
        <div class="uk-query-copy" ref={copy} aria-hidden="true">
          {drawn}
          {/* The card at the end (nothing after it to begin there): after the last of it. */}
          {from >= value.length && <span class="uk-query-at" ref={anchor} />}
        </div>
        <input
          ref={input}
          class="uk-query-input"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listing}
          aria-controls={listing ? ids.list : undefined}
          aria-activedescendant={listing ? `${ids.option}-${pick}` : undefined}
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby={open && said ? ids.note : undefined}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => {
            spaced.current = null;
            onChange((e.currentTarget as HTMLInputElement).value);
            setActive(0);
            track();
          }}
          onKeyDown={keydown}
          onKeyUp={track}
          onClick={track}
          onSelect={track}
          onScroll={follow}
          onFocus={track}
          onBlur={() => setCaret(null)}
          onPointerMove={point}
          onPointerLeave={() => setHovered(undefined)}
        />
      </div>
      {end}
      {value && (
        <button
          type="button"
          class="uk-query-tool"
          aria-label={labels.clear}
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <Icon name="x" />
        </button>
      )}
      {open && (
        <Layer
          class="uk-query-card"
          focus="none"
          anchor={box}
          onDismiss={() => {
            setShut(key);
            setHovered(undefined);
          }}
          onLayer={(el) => {
            card.current = el;
            attach(el);
          }}
        >
          {said && (
            <div class="uk-query-note" id={ids.note} data-tone={said.tone ?? 'error'}>
              <Icon name={(said.tone ?? 'error') === 'error' ? 'circle-x' : 'warning'} />
              <span>{said.message}</span>
            </div>
          )}
          {listing && (
            <div class="uk-query-list" ref={list} role="listbox" id={ids.list} aria-label={label} tabIndex={-1}>
              {items.map((s, i) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard picks in the input (aria-activedescendant).
                <div
                  key={`${s.value}-${i}`}
                  id={`${ids.option}-${i}`}
                  class="uk-query-option"
                  role="option"
                  aria-selected={i === pick}
                  tabIndex={-1}
                  data-kind={s.kind}
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => i !== pick && setActive(i)}
                  onClick={() => take(s)}
                >
                  <span class="uk-query-option-title">
                    <Highlight text={s.title ?? s.value} query={typed} />
                  </span>
                  {s.hint && <span class="uk-query-option-hint">{s.hint}</span>}
                </div>
              ))}
            </div>
          )}
        </Layer>
      )}
    </div>
  );
}
