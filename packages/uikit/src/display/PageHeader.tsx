import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/**
 * A header: its title (an icon before it), a line beside it (what it is
 * about), what can be done at its end. The page's own (an h1, large), or
 * one of a part of it (level 2: an h2, smaller).
 */
export function PageHeader({
  icon,
  children,
  sub,
  end,
  level = 1,
}: {
  icon?: string;
  children: ComponentChildren;
  sub?: ComponentChildren;
  end?: ComponentChildren;
  level?: 1 | 2;
}) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div class="uk-page-header" data-level={level}>
      <H>
        {icon && <Icon name={icon} />}
        <span>{children}</span>
      </H>
      {sub && <span class="uk-page-header-sub">{sub}</span>}
      {end && <div class="uk-page-header-end">{end}</div>}
    </div>
  );
}
