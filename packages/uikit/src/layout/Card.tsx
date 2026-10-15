import type { ComponentChildren } from 'preact';

/*
 * A card: a section of its own about one thing (a pod's container) — its
 * head (its mark, its name, what it is (badges), what is said of it quiet,
 * what ends it: counts, buttons), then what is in it: fields, tables, each
 * apart from the one before.
 */
export function Card({
  mark,
  title,
  badges,
  quiet,
  end,
  part,
  children,
}: {
  mark?: ComponentChildren;
  title: ComponentChildren;
  badges?: ComponentChildren;
  quiet?: ComponentChildren;
  end?: ComponentChildren;
  /** Which part of a view it is (where its view lays it out). */
  part?: string;
  children?: ComponentChildren;
}) {
  return (
    <section class="uk-section uk-card" data-part={part}>
      <header class="uk-card-head">
        {mark}
        <b>{title}</b>
        {badges}
        {quiet !== undefined && <span class="uk-quiet">{quiet}</span>}
        {end !== undefined && <span class="uk-card-end">{end}</span>}
      </header>
      {children}
    </section>
  );
}
