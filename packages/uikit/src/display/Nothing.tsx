import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/** Nothing in a part of a view (no events, no conditions): one look everywhere — its icon quiet, what that means beside it (not a bare "None"). */
export function Nothing({ icon = 'circle-dashed', children }: { icon?: string; children: ComponentChildren }) {
  return (
    <div class="uk-nothing">
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}
