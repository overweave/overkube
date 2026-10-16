import type { ComponentChildren } from 'preact';
import { Split, type SplitPart } from '../data/Split';
import { Icon } from '../display/Icon';
import type { Level } from '../lib/level';
import { Badge } from '../status/Badge';

/*
 * A board (a dashboard's page): its parts one under another, then two
 * columns — what to look at (wide), what there is (narrow; under it when
 * the page is narrow). Its panels (the kit's Panel) each a head — its
 * title, how many, its tools (small, at its end), a link to all of it —
 * and a body, its rows at the head's inset. Tiles: numbers at a glance, as
 * many in a row as there is room for, ruled between. Chosen: what is
 * chosen, each taken back by its ×.
 */

export function Board({ children }: { children: ComponentChildren }) {
  return <div class="uk-board">{children}</div>;
}

/** The two columns: the wide one (what to look at), the narrow one (what there is). */
export function BoardColumns({ wide, narrow }: { wide: ComponentChildren; narrow: ComponentChildren }) {
  return (
    <div class="uk-board-cols">
      <div class="uk-board-col">{wide}</div>
      <div class="uk-board-col">{narrow}</div>
    </div>
  );
}

/** Two columns the other way: a narrow one at the side (its parts: a panel of them, kept in sight), the wide one beside it (the part chosen). */
export function BoardAside({ side, children }: { side: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="uk-board-aside">
      <div class="uk-board-side">{side}</div>
      <div class="uk-board-col">{children}</div>
    </div>
  );
}

/** A panel's head: its title, how many (none: not said), its tools, a link to all of it. */
export function PanelHead({ title, count, tools, more }: { title: ComponentChildren; count?: number; tools?: ComponentChildren; more?: { label: string; href: string } }) {
  return (
    <div class="uk-panel-title">
      <h2>{title}</h2>
      {count !== undefined && <Badge>{count}</Badge>}
      {tools && <div class="uk-panel-tools">{tools}</div>}
      {more && (
        <a class="uk-panel-more" href={more.href}>
          {more.label} →
        </a>
      )}
    </div>
  );
}

/** A panel's body: at its head's inset (its rows' first line 20px, their marks on it). */
export function PanelBody({ children }: { children: ComponentChildren }) {
  return <div class="uk-panel-body">{children}</div>;
}

/** Tiles: as many in a row as there is room for (all of them on a wide page), ruled between — none left over drawn. */
export function Tiles({ children }: { children: ComponentChildren }) {
  return <div class="uk-tiles">{children}</div>;
}

/**
 * A tile: a number at a glance (a kind's) — its icon and name, how many
 * (of how many; its level's colour), what is said of it under it, beside
 * them how it is split (a ring — its note says it to those who cannot see
 * it); on its way, a shimmer where the number
 * goes. Clicked, it does what it is for (goes to its page).
 */
export function Tile({
  icon,
  title,
  value,
  total,
  level,
  note,
  parts,
  loading = false,
  onClick,
}: {
  icon?: string;
  title: ComponentChildren;
  value?: ComponentChildren;
  total?: ComponentChildren;
  level?: Level;
  note?: ComponentChildren;
  parts?: readonly SplitPart[];
  loading?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span class="uk-tile-title">
        {icon && <Icon name={icon} />}
        <span>{title}</span>
      </span>
      <span class="uk-tile-value" data-level={level}>
        {loading ? (
          <span class="uk-tile-shimmer" aria-hidden="true" />
        ) : (
          <>
            {value}
            {total !== undefined && <small>/ {total}</small>}
          </>
        )}
      </span>
      <span class="uk-tile-note" data-level={level}>
        {loading ? '\u00a0' : (note ?? '\u00a0')}
      </span>
      {!loading && parts && <Split parts={parts} quiet />}
    </>
  );
  return onClick ? (
    <button type="button" class="uk-tile" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div class="uk-tile">{body}</div>
  );
}

/** What is chosen, each its name (quiet) and value, taken back by its ×. */
export function Chosen({ tokens, remove, label }: { tokens: { id: string; name: string; value: string }[]; remove: (id: string) => void; label: (value: string) => string }) {
  return (
    <div class="uk-tokens">
      {tokens.map((t) => (
        <span key={t.id} class="uk-token">
          <span class="uk-quiet">{t.name}</span> {t.value}
          <button type="button" aria-label={label(t.value)} onClick={() => remove(t.id)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
