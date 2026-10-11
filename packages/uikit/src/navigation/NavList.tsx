import { type ComponentChildren, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { uid } from '../lib/focus';

/*
 * A menu down a page's side: groups under their headings, each entry a
 * link — the one the page is at marked (aria-current). What follows an
 * entry's name (a count) is its own.
 */

export interface NavListItem {
  key: string;
  label: ComponentChildren;
  href: string;
  /** What it is, in full (a tooltip). */
  title?: string;
  icon?: string;
  /** Shown after its name (a count). */
  extra?: ComponentChildren;
}

export interface NavListGroup {
  key: string;
  title: string;
  items: NavListItem[];
}

export interface NavListProps {
  groups: NavListGroup[];
  /** The one the page is at. */
  current?: string;
  /** What it is, for those who cannot see it ("Kinds"). */
  label: string;
  /** An entry chosen (none: its link is followed). */
  onOpen?: (item: NavListItem, event: MouseEvent) => void;
}

export function NavList({ groups, current, label, onOpen }: NavListProps) {
  const id = useMemo(() => uid('uk-navlist'), []);
  return (
    <nav class="uk-navlist" aria-label={label}>
      {groups.map((g) => (
        <Fragment key={g.key}>
          <h2 class="uk-navlist-group" id={`${id}-${g.key}`}>
            {g.title}
          </h2>
          <ul aria-labelledby={`${id}-${g.key}`}>
            {g.items.map((item) => (
              <li key={item.key}>
                <a
                  class="uk-navlist-item"
                  href={item.href}
                  title={item.title}
                  aria-current={current === item.key ? 'page' : undefined}
                  onClick={onOpen ? (e) => onOpen(item, e) : undefined}
                >
                  {item.icon && <Icon name={item.icon} />}
                  <span class="uk-navlist-label">{item.label}</span>
                  {item.extra !== undefined && <span class="uk-navlist-extra">{item.extra}</span>}
                </a>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </nav>
  );
}
