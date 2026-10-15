import type { ComponentChildren } from 'preact';
import { Button } from '../actions/Button';
import { Icon } from './Icon';

/** Nothing here (an empty list, a table with no rows): an icon in a circle, what it is, a line on what to do, a way on (a button). */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: ComponentChildren;
  children?: ComponentChildren;
  action?: { label: string; run: () => void };
}) {
  return (
    <div class="uk-empty">
      <span class="uk-empty-icon">
        <Icon name={icon} />
      </span>
      <b>{title}</b>
      {children && <span>{children}</span>}
      {action && (
        <Button size="sm" onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
