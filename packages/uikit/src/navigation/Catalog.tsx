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
 * the filter is its (it says what matches), the words are its. Its parts
 * are the page's too, to put together otherwise (CatalogBox, CatalogTop,
 * CatalogSearch, CatalogGroups — an item drawn by the page: renderItem,
 * given what it does for its link).
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

/** What an item drawn by the page is given: what it does, for its link (where it goes, opening it, the arrows' mark). */
export interface CatalogItemParts {
  attrs: Record<string, unknown>;
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
  /** An item's link drawn by the page (none: its name, what matches marked). */
  renderItem?: (item: CatalogItem, parts: CatalogItemParts) => ComponentChildren;
}

/** Its frame: the arrows go from one item to the next (round), down from the filter to the first. */
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
    // biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between its items (each a link).
    <div class="uk-catalog" onKeyDown={arrows}>
      {children}
    </div>
  );
}

/** Its top: the filter, what follows it. */
export function CatalogTop({ children }: { children?: ComponentChildren }) {
  return <div class="uk-catalog-top">{children}</div>;
}

/** The filter: what is typed, named and shown as its placeholder. */
export function CatalogSearch({ query, onQuery, placeholder }: Pick<CatalogProps, 'query' | 'onQuery' | 'placeholder'>) {
  return (
    <label class="uk-catalog-search">
      <Icon name="search" />
      <input aria-label={placeholder} placeholder={placeholder} value={query} onInput={(e) => onQuery((e.target as HTMLInputElement).value)} />
    </label>
  );
}

/** The groups, in columns; an item's link the kit's or the page's (renderItem). */
export function CatalogGroups({
  groups,
  query,
  empty,
  onOpen,
  onToggle,
  toggleLabel = (i) => i.label,
  toggleIcon = 'pin',
  toggleOnIcon = 'pin-filled',
  renderItem,
}: Omit<CatalogProps, 'onQuery' | 'placeholder' | 'aside'>) {
  return (
    <div class="uk-catalog-groups">
      {groups.length === 0 && <div class="uk-catalog-empty">{empty}</div>}
      <div class="uk-catalog-columns">
        {groups.map((g) => (
          <section class="uk-catalog-group" key={g.key} aria-label={typeof g.title === 'string' ? g.title : undefined} {...g.attrs}>
            <h4>{g.title}</h4>
            {g.items.map((item) => {
              const attrs = {
                href: item.href,
                title: item.title,
                tabIndex: 0,
                'data-catalog-item': '',
                onClick: (e: MouseEvent) => {
                  if (!onOpen) return;
                  // A new tab, a new window: the browser's.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  if (!item.href) e.preventDefault();
                  onOpen(item);
                },
                ...item.attrs,
              };
              return (
                <div class="uk-catalog-row" key={item.key} data-muted={item.muted ? '' : undefined} data-on={item.on ? '' : undefined}>
                  {renderItem ? (
                    renderItem(item, { attrs })
                  ) : (
                    <a class="uk-catalog-name" {...attrs}>
                      <Highlight text={item.label} query={query} />
                    </a>
                  )}
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
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

export function Catalog({ query, onQuery, placeholder, aside, ...rest }: CatalogProps) {
  return (
    <CatalogBox>
      <CatalogTop>
        <CatalogSearch query={query} onQuery={onQuery} placeholder={placeholder} />
        {aside}
      </CatalogTop>
      <CatalogGroups query={query} {...rest} />
    </CatalogBox>
  );
}
