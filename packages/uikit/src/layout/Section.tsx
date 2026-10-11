import type { ComponentChildren } from 'preact';

/** A part of a view, under its heading. */
export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="uk-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
