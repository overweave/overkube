import type { ComponentChildren } from 'preact';
import { Fragment } from 'preact';

/*
 * Tabs that are links: a page's navigation drawn as a strip of tabs — each
 * a link (opened in a new tab too, its address copied), the one the page is
 * at marked (aria-current), not a tablist (no panel of its own: the page
 * is). Sections divided as Tabs divides them; what follows them (a +) at
 * their end.
 */

export interface TabLink {
  key: string;
  label: ComponentChildren;
  href: string;
  /** What it is, in full (a tooltip). */
  title?: string;
  /** Shown as not kept (one open, not pinned). */
  transient?: boolean;
}

export interface TabLinksProps {
  sections: { id: string; links: TabLink[] }[];
  /** The one the page is at. */
  current?: string;
  /** What it is, for those who cannot see it ("Kinds"). */
  label: string;
  /** A link chosen (none: it is followed). */
  onOpen?: (link: TabLink, event: MouseEvent) => void;
  end?: ComponentChildren;
}

export function TabLinks({ sections, current, label, onOpen, end }: TabLinksProps) {
  const shown = sections.filter((s) => s.links.length);
  return (
    <nav class="uk-tabs" aria-label={label}>
      <div class="uk-tab-list">
        {shown.map((section, i) => (
          <Fragment key={section.id}>
            {i > 0 && <span class="uk-tab-sep" aria-hidden="true" />}
            {section.links.map((link) => (
              <a
                key={link.key}
                class="uk-tab"
                href={link.href}
                title={link.title}
                data-key={link.key}
                data-transient={link.transient ? '' : undefined}
                aria-current={current === link.key ? 'page' : undefined}
                onClick={onOpen ? (e) => onOpen(link, e) : undefined}
              >
                <span class="uk-tab-label">{link.label}</span>
              </a>
            ))}
          </Fragment>
        ))}
      </div>
      {end}
    </nav>
  );
}
