import type { ComponentChildren, JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Kbd } from '../display/Kbd';
import { Tip } from '../overlays/Tip';

/*
 * Many things to pick one of, in two panes: a filter on top; down the side
 * the sections (each its count; the chosen one marked, the mark moving to
 * the next one chosen); beside them what is in the chosen one — under
 * headings, each thing a row (an icon, its name, what it is given to show,
 * a pin: under the pointer, kept while on), coming in one after another;
 * nothing in it, said so (EmptyState). The
 * arrows go from one row to the next, from the filter into the rows. Its
 * parts are the page's to put together (what is in each: the page's words,
 * its filtering, its sections).
 */

/** Its frame: the arrows go from one row to the next (round), down from the filter to the first. */
export function CatalogBox({ children }: { children?: ComponentChildren }) {
  const arrows = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const box = (e.currentTarget as HTMLElement).closest('.uk-catalog');
    const names = [...(box?.querySelectorAll<HTMLElement>('[data-catalog-item]') ?? [])];
    const at = names.indexOf(e.target as HTMLElement);
    const down = e.key === 'ArrowDown';
    const next = at < 0 ? (down ? names[0] : undefined) : down ? (names[at + 1] ?? names[0]) : (names[at - 1] ?? names[names.length - 1]);
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between its rows (each a link).
    <div class="uk-catalog" onKeyDown={arrows}>
      {children}
    </div>
  );
}

/** Its top: what is in it (the filter), Esc beside it. */
export function CatalogTop({ children }: { children?: ComponentChildren }) {
  return (
    <div class="uk-catalog-top">
      {children}
      <Kbd keys="Esc" />
    </div>
  );
}

/** The filter: what is typed, named and shown as its placeholder; focused as it opens. */
export function CatalogSearch({ query, onQuery, placeholder }: { query: string; onQuery: (query: string) => void; placeholder: string }) {
  return (
    <label class="uk-catalog-search">
      <Icon name="search" />
      {/* biome-ignore lint/a11y/noAutofocus: typed in as it opens (a picker). */}
      <input aria-label={placeholder} placeholder={placeholder} value={query} autoFocus onInput={(e) => onQuery((e.target as HTMLInputElement).value)} />
    </label>
  );
}

/** Its two panes: the sections down the side (named), what is in the chosen one beside them. */
export function CatalogBody({ side, label, children }: { side: ComponentChildren; label: string; children?: ComponentChildren }) {
  return (
    <div class="uk-catalog-body">
      <CatalogSide label={label}>{side}</CatalogSide>
      {children}
    </div>
  );
}

/** The sections, the chosen one's mark under it — moving to the next one chosen. */
function CatalogSide({ label, children }: { label: string; children?: ComponentChildren }) {
  const side = useRef<HTMLElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const chosen = side.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const next = chosen ? { top: chosen.offsetTop, height: chosen.offsetHeight } : null;
    if (next?.top !== mark?.top || next?.height !== mark?.height) setMark(next);
  });
  return (
    <nav class="uk-catalog-side" aria-label={label} ref={side}>
      {mark && <span class="uk-catalog-mark" style={{ transform: `translateY(${mark.top}px)`, height: `${mark.height}px` }} />}
      {children}
    </nav>
  );
}

/** A section down the side: its icon, its name, how many in it; chosen (marked), or with nothing in it (quieter). */
export function CatalogSection({
  icon,
  count,
  chosen = false,
  children,
  ...rest
}: { icon?: string; count?: number; chosen?: boolean; children?: ComponentChildren } & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'icon'>) {
  return (
    <button type="button" class="uk-catalog-section" aria-current={chosen} data-empty={count === 0 ? '' : undefined} {...rest}>
      {icon && <Icon name={icon} />}
      <span class="uk-catalog-label">{children}</span>
      {count !== undefined && <span class="uk-catalog-count">{count}</span>}
    </button>
  );
}

/** What is in the chosen section, scrolled; drawn anew as another is chosen (shown coming in): its key. */
export function CatalogPane({ children }: { children?: ComponentChildren }) {
  return <div class="uk-catalog-pane">{children}</div>;
}

/** A heading over some of the rows. */
export function CatalogHeading({ children }: { children?: ComponentChildren }) {
  return <div class="uk-catalog-heading">{children}</div>;
}

/** What a row's pin is: on or not, its name, turning it. */
export interface CatalogPin {
  on: boolean;
  label: string;
  onToggle: (on: boolean) => void;
}

/**
 * A row: a link (what it is given: where it goes, what it does — marked a
 * row the arrows go to), its icon, its name (what the page draws), what it
 * is given to show after it, its pin; quieter (empty); its place among the
 * rows (they come in one after another).
 */
export function CatalogRow({
  link,
  icon,
  muted = false,
  place = 0,
  extra,
  pin,
  children,
}: {
  link: JSX.AnchorHTMLAttributes<HTMLAnchorElement>;
  icon?: string;
  muted?: boolean;
  place?: number;
  extra?: ComponentChildren;
  pin?: CatalogPin;
  children?: ComponentChildren;
}) {
  return (
    <div class="uk-catalog-row" data-muted={muted ? '' : undefined} style={{ '--uk-catalog-i': Math.min(place, 12) }}>
      <a class="uk-catalog-name" data-catalog-item="" {...link}>
        {icon && <Icon name={icon} />}
        <span class="uk-catalog-label">{children}</span>
      </a>
      {extra !== undefined && <span class="uk-catalog-count">{extra}</span>}
      {pin && (
        <Tip content={() => pin.label}>
          <button type="button" class="uk-catalog-pin" aria-pressed={pin.on} aria-label={pin.label} onClick={() => pin.onToggle(!pin.on)}>
            <Icon name={pin.on ? 'pin-filled' : 'pin'} />
          </button>
        </Tip>
      )}
    </div>
  );
}
