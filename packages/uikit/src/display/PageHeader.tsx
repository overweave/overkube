import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/** A page's header: its title (an h1, an icon before it), and a line beside it (what it is about). */
export function PageHeader({ icon, children, sub }: { icon?: string; children: ComponentChildren; sub?: ComponentChildren }) {
  return (
    <div class="uk-page-header">
      <h1>
        {icon && <Icon name={icon} />}
        <span>{children}</span>
      </h1>
      {sub && <span class="uk-page-header-sub">{sub}</span>}
    </div>
  );
}
