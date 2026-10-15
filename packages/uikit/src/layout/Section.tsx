import type { ComponentChildren } from 'preact';

/** A part of a view, under its heading; which part it is (part: where its view lays it out — a resource's metadata beside the rest, wide). */
export function Section({ title, part, children }: { title: string; part?: string; children: ComponentChildren }) {
  return (
    <section class="uk-section" data-part={part}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
