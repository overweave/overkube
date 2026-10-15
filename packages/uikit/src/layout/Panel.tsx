import type { ComponentChildren } from 'preact';

/** A framed part of a page: its header on top (none: just the frame), what is in it under it — a table in it framed by it alone. */
export function Panel({ header, children }: { header?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="uk-panel">
      {header && <div class="uk-panel-head">{header}</div>}
      {children}
    </section>
  );
}
