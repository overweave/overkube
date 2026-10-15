import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';

/*
 * Lines, ruled, each opened for more: its mark apart (a state's icon), its
 * title (and what is said quiet beside it), what can be done with it at its
 * end, a chevron last; the whole line opens it, but for what is at its end.
 * Opened, what is more of it under its title, slid open. Each opens on its
 * own (none, some, all open at once).
 */

/** The lines, ruled. */
export function Accordion({ children }: { children: ComponentChildren }) {
  return <div class="uk-accordion">{children}</div>;
}

export interface AccordionItemProps {
  /** Its mark apart, before its title (a state's icon): what is under it lined up with its title. */
  mark?: ComponentChildren;
  /** Its title: its name, what is said of it quiet beside. */
  title: ComponentChildren;
  /** What can be done with it, at its end (buttons): not opening it. */
  end?: ComponentChildren;
  /** Open at first. */
  open?: boolean;
  children: ComponentChildren;
}

export function AccordionItem({ mark, title, end, open: first = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(first);
  const id = useId();
  return (
    <div class="uk-accordion-item" data-open={open ? '' : undefined}>
      {mark !== undefined && <span class="uk-accordion-mark">{mark}</span>}
      <div class="uk-accordion-line">
        <button type="button" class="uk-accordion-head" id={`${id}-head`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {title}
        </button>
        {end !== undefined && <span class="uk-accordion-end">{end}</span>}
        <span class="uk-accordion-chevron">
          <Icon name="chevron" />
        </span>
      </div>
      <section class="uk-accordion-body" id={id} aria-labelledby={`${id}-head`} inert={!open}>
        <div>{children}</div>
      </section>
    </div>
  );
}
