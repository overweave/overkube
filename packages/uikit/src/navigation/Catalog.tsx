import type { ComponentChildren } from 'preact';
import { Highlight } from '../display/Highlight';
import { Icon } from '../display/Icon';

/*
 * Many things to pick one of, by group (kinds by category): a filter over
 * them (what follows it — a switch — beside it), the groups in columns,
 * each thing a row — its name (what matches the filter marked), what it is
 * given to show (a count), and a toggle (a pin: shown while on, else under
 * the pointer). A click or Enter on a name opens it; the arrows go from one
 * to the next, from the filter into the list. What is in it is the page's:
 * the filter is its (it says what matches), the words are its.
 */

export interface CatalogItem {
  key: string;
  label: string;
  /** Where it goes (a link: opened in a new tab too). */
  href?: string;
  /** What it is, in full (a tooltip). */
  title?: string;
  /** Drawn quieter (an empty kind). */
  muted?: boolean;
  /** Shown after its name (a count). */
  extra?: ComponentChildren;
  /** Its toggle is on (pinned). */
  on?: boolean;
  /** Put on its name (marks of where it comes from). */
  attrs?: Record<string, string | undefined>;
}

export interface CatalogGroup {
  key: string;
  title: ComponentChildren;
  items: CatalogItem[];
  /** Put on the group (marks of where it comes from). */
  attrs?: Record<string, string | undefined>;
}

export interface CatalogProps {
  groups: CatalogGroup[];
  query: string;
  onQuery: (query: string) => void;
  /** The filter's name and placeholder. */
  placeholder: string;
  /** Beside the filter (a switch). */
  aside?: ComponentChildren;
  /** Said with no group. */
  empty?: ComponentChildren;
  onOpen?: (item: CatalogItem) => void;
  /** Its toggle turned on or off; none without. */
  onToggle?: (item: CatalogItem, on: boolean) => void;
  /** The toggle's name for an item ("Pin Pods"). */
  toggleLabel?: (item: CatalogItem) => string;
  toggleIcon?: string;
  /** The toggle's icon while on (filled). */
  toggleOnIcon?: string;
}

export function Catalog({
  groups,
  query,
  onQuery,
  placeholder,
  aside,
  empty,
  onOpen,
  onToggle,
  toggleLabel = (i) => i.label,
  toggleIcon = 'pin',
  toggleOnIcon = 'pin-filled',
}: CatalogProps) {
  // The arrows: from name to name (round); down from the filter, the first.
  const arrows = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const box = (e.currentTarget as HTMLElement).closest('.uk-catalog');
    const names = [...(box?.querySelectorAll<HTMLElement>('.uk-catalog-name') ?? [])];
    const at = names.indexOf(e.target as HTMLElement);
    const down = e.key === 'ArrowDown';
    const next = at < 0 ? (down ? names[0] : undefined) : down ? (names[at + 1] ?? names[0]) : (names[at - 1] ?? names[names.length - 1]);
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between its names (each a link).
    <div class="uk-catalog" onKeyDown={arrows}>
      <div class="uk-catalog-top">
        <label class="uk-catalog-search">
          <Icon name="search" />
          <input aria-label={placeholder} placeholder={placeholder} value={query} onInput={(e) => onQuery((e.target as HTMLInputElement).value)} />
        </label>
        {aside}
      </div>
      <div class="uk-catalog-groups">
        {groups.length === 0 && <div class="uk-catalog-empty">{empty}</div>}
        {groups.map((g) => (
          <section class="uk-catalog-group" key={g.key} aria-label={typeof g.title === 'string' ? g.title : undefined} {...g.attrs}>
            <h4>{g.title}</h4>
            {g.items.map((item) => (
              <div class="uk-catalog-row" key={item.key} data-muted={item.muted ? '' : undefined} data-on={item.on ? '' : undefined}>
                <a
                  class="uk-catalog-name"
                  href={item.href}
                  title={item.title}
                  tabIndex={0}
                  onClick={(e) => {
                    if (!onOpen) return;
                    // A new tab, a new window: the browser's.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                    if (!item.href) e.preventDefault();
                    onOpen(item);
                  }}
                  {...item.attrs}
                >
                  <Highlight text={item.label} query={query} />
                </a>
                {item.extra !== undefined && <span class="uk-catalog-extra">{item.extra}</span>}
                {onToggle && (
                  <button
                    type="button"
                    class="uk-catalog-toggle"
                    aria-pressed={item.on ?? false}
                    aria-label={toggleLabel(item)}
                    title={toggleLabel(item)}
                    onClick={() => onToggle(item, !item.on)}
                  >
                    <Icon name={item.on ? toggleOnIcon : toggleIcon} />
                  </button>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
