import type { ComponentChildren } from 'preact';
import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { uid } from '../lib/focus';
import { Layer, useLeave } from '../lib/layers';

/*
 * A search over the page, as macOS's Spotlight: a panel floating high in
 * the middle (a modal layer: over everything, the page behind it inert,
 * Escape and a click beside it close it), a large field, what is
 * found under it by group — one active, moved by the arrows (Home, End),
 * the pointer; Enter or a click chooses it. It comes in with a little
 * spring, its first rows one after another; Escape or a click beside it
 * fades it out before it goes (a choice closes it at once). The field is a combobox, the
 * results its listbox. What is found is the page's (it searches, it says
 * when it is still searching); the words are its.
 */

export interface SpotlightItem {
  key: string;
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  icon?: string;
  /** Its group: those of a group follow each other, under its name. */
  group?: string;
  /** Put on it (marks of where it comes from). */
  attrs?: Record<string, string | undefined>;
}

export interface SpotlightProps {
  query: string;
  onQuery: (query: string) => void;
  items: SpotlightItem[];
  onChoose: (item: SpotlightItem) => void;
  onClose: () => void;
  /** Its name (the field's, the dialog's). */
  label: string;
  /** The results' name. */
  resultsLabel?: string;
  placeholder?: string;
  /** Said when a query finds nothing (and nothing is being searched). */
  empty?: ComponentChildren;
  /** Still searching: a line runs under the field. */
  busy?: boolean;
  /** Under the results (how to use it: ↑↓ ↵ esc). */
  footer?: ComponentChildren;
}

/** How long it takes to fade out (the CSS's). */
const OUT_MS = 140;
/** How long a row new to the list is coming in (its animation and its delay, at most). */
const ENTER_MS = 600;

export function Spotlight({ query, onQuery, items, onChoose, onClose, label, resultsLabel = label, placeholder, empty, busy = false, footer }: SpotlightProps) {
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => ({ list: uid('uk-spot-list'), item: uid('uk-spot-item') }), []);
  const [active, setActive] = useState(0);
  // Opening: its first rows come one after another (not those a search brings later). Closing: it fades, then goes.
  const [opening, setOpening] = useState(true);
  const { closing, leave } = useLeave(onClose, OUT_MS);
  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 500);
    return () => clearTimeout(t);
  }, []);

  // A new search: the first is active again.
  const keys = items.map((i) => i.key).join('\n');
  useEffect(() => setActive(0), [keys]);
  const at = Math.max(0, Math.min(active, items.length - 1));
  // The active one in view; the first, with its group's name over it (the list at its top).
  useLayoutEffect(() => {
    const box = list.current;
    if (!box) return;
    if (at === 0) box.scrollTop = 0;
    else box.querySelector(`#${ids.item}-${at}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [at, keys]);

  const key = (e: KeyboardEvent) => {
    const last = items.length - 1;
    if (e.key === 'ArrowDown') setActive(Math.min(at + 1, last));
    else if (e.key === 'ArrowUp') setActive(Math.max(at - 1, 0));
    else if (e.key === 'Home' && items.length) setActive(0);
    else if (e.key === 'End' && items.length) setActive(last);
    else if (e.key === 'Enter' && !e.isComposing && items[at]) onChoose(items[at]);
    else return;
    e.preventDefault();
  };
  const nothing = query.trim() !== '' && items.length === 0 && !busy;

  // What a search changes moves, not jumps: a row new to the list comes in (after those before it, one after another); one
  // still there slides from where it was to where it is (FLIP); one gone goes at once.
  // When each came, and its place in the line of those that came with it: marked as coming in for a while (drawn again
  // meanwhile — a new search makes the first active — it keeps coming in).
  const born = useRef(new Map<string, { at: number; i: number }>());
  const tops = useRef(new Map<string, number>());
  const height = useRef<number>();
  const now = Date.now();
  let entering = 0;
  /** A row's (or a group name's) marks: whether it is coming in, and when. */
  const enter = (key: string) => {
    let b = born.current.get(key);
    if (!b) {
      b = { at: now, i: Math.min(entering++, 8) };
      born.current.set(key, b);
    }
    return now - b.at < ENTER_MS ? { 'data-enter': '', style: { '--uk-spot-i': b.i } } : {};
  };
  useLayoutEffect(() => {
    const box = list.current;
    // Not there yet (a layer: drawn at the root's end once it knows where): nothing to measure — what it measures first is where things start, not where they come from.
    if (!shown) return;
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const places = new Map<string, number>();
    for (const el of box?.querySelectorAll<HTMLElement>('[data-key]') ?? []) {
      const key = el.dataset.key as string;
      const top = el.offsetTop;
      places.set(key, top);
      const was = tops.current.get(key);
      if (was !== undefined && was !== top && !still && !el.hasAttribute('data-enter') && typeof el.animate === 'function') {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(.2, 0, 0, 1)' });
      }
    }
    tops.current = places;
    for (const key of born.current.keys()) if (!places.has(key)) born.current.delete(key);
    // The list from the height it shows to the height of what it holds now (its content, as far as its max-height lets it).
    if (!box) return;
    const css = getComputedStyle(box);
    const max = Number.parseFloat(css.maxHeight) || Number.POSITIVE_INFINITY;
    // Its content by its last child (scrollHeight would say the height an animation holds it at, were it taller).
    const last = box.lastElementChild as HTMLElement | null;
    const content = last ? last.offsetTop + last.offsetHeight + (Number.parseFloat(css.paddingBottom) || 0) : 0;
    const natural = Math.min(content, max) + (Number.parseFloat(css.borderTopWidth) || 0);
    if (height.current !== undefined && natural !== height.current && !still && typeof box.animate === 'function') {
      // From where it was: the height it last held, or, mid-way, the height it shows (the running animation's).
      const running = box.getAnimations?.() ?? [];
      const shown = running.length ? box.getBoundingClientRect().height : height.current;
      for (const a of running) a.cancel();
      box.animate([{ height: `${shown}px` }, { height: `${natural}px` }], { duration: 240, easing: 'cubic-bezier(.2, 0, 0, 1)' });
    }
    height.current = natural;
  });

  return (
    <Layer
      modal
      focus="field"
      class="uk-spot"
      role="dialog"
      label={label}
      onLayer={() => setShown(true)}
      onDismiss={leave}
      closing={closing}
      data-phase={opening ? 'opening' : undefined}
      onClick={(e) => e.target === e.currentTarget && leave()}
    >
      <div class="uk-spot-panel">
        <div class="uk-spot-field" data-busy={busy ? '' : undefined}>
          <Icon name="search" />
          <input
            ref={field}
            role="combobox"
            aria-label={label}
            aria-expanded={items.length > 0}
            aria-controls={ids.list}
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `${ids.item}-${at}` : undefined}
            placeholder={placeholder}
            value={query}
            spellcheck={false}
            autocomplete="off"
            onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
            onKeyDown={key}
          />
        </div>
        <div class="uk-spot-results" role="listbox" id={ids.list} aria-label={resultsLabel} ref={list} data-empty={items.length ? undefined : ''}>
          {items.map((item, i) => (
            <Fragment key={item.key}>
              {item.group && item.group !== items[i - 1]?.group && (
                <div class="uk-spot-group" role="presentation" data-key={`group:${item.group}`} {...enter(`group:${item.group}`)}>
                  {item.group}
                </div>
              )}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard chooses through the field (aria-activedescendant). */}
              <div
                id={`${ids.item}-${i}`}
                class="uk-spot-item"
                role="option"
                aria-selected={i === at}
                tabIndex={-1}
                data-key={item.key}
                {...enter(item.key)}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={() => onChoose(item)}
                {...item.attrs}
              >
                <span class="uk-spot-icon" aria-hidden="true">
                  <Icon name={item.icon ?? 'search'} />
                </span>
                <span class="uk-spot-title">{item.title}</span>
                {item.subtitle && <span class="uk-spot-subtitle">{item.subtitle}</span>}
                <span class="uk-spot-enter" aria-hidden="true">
                  <Icon name="enter" />
                </span>
              </div>
            </Fragment>
          ))}
          {nothing && <div class="uk-spot-empty">{empty}</div>}
        </div>
        {footer && <div class="uk-spot-footer">{footer}</div>}
      </div>
    </Layer>
  );
}
