import type { ComponentChildren } from 'preact';
import type { Level } from '../lib/level';
import { Icon } from './Icon';

/*
 * A number at a glance (a dashboard's tile): what it is, how many (of how
 * many), a note; coloured by a level. Loading, a shimmer where the number
 * goes. Clicked, it does what it is for: under the pointer its title
 * brightens and an arrow says where it goes (the tile around it is the
 * page's: it lights it).
 */

export interface StatProps {
  icon?: string;
  title: ComponentChildren;
  /** How many (none while loading). */
  value?: ComponentChildren;
  /** Of how many. */
  total?: ComponentChildren;
  note?: ComponentChildren;
  level?: Level;
  /** Not known yet: a shimmer for the number; no total, no note. */
  loading?: boolean;
  onClick?: () => void;
}

export function Stat({ icon, title, value, total, note, level, loading = false, onClick }: StatProps) {
  const body = (
    <>
      <span class="uk-stat-title">
        {icon && <Icon name={icon} />}
        <span>{title}</span>
        {onClick && (
          <span class="uk-stat-go" aria-hidden="true">
            <Icon name="chevron" />
          </span>
        )}
      </span>
      {loading ? (
        <span class="uk-stat-value">
          <span class="uk-stat-shimmer" />
        </span>
      ) : (
        <span class="uk-stat-value" data-level={level}>
          {value}
          {total !== undefined && <small> / {total}</small>}
        </span>
      )}
      {!loading && note !== undefined && (
        <span class="uk-stat-note" data-level={level}>
          {note}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" class="uk-stat" aria-busy={loading || undefined} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div class="uk-stat" aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
