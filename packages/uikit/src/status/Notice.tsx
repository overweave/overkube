import type { ComponentChildren } from 'preact';
import { Icon } from '../display/Icon';
import type { Level } from '../lib/level';

/*
 * A message in place of something: loading, nothing, why not. On a soft
 * tint of its level's colour (none: grey); its icon and its title in that
 * colour, its words plain (to be read). Its icon by its first line; loading,
 * a spinner where the icon is. What to do about it (a button) at its end.
 * A warning or an error is an alert (said at once); the rest, a status.
 */

export interface NoticeProps {
  level?: Level;
  icon?: string;
  /** A first line, in bold, over its words. */
  title?: ComponentChildren;
  /** What to do about it: a button at its end. */
  action?: ComponentChildren;
  /** Waiting for something: a spinner where its icon is. */
  loading?: boolean;
  children?: ComponentChildren;
}

export function Notice({ level, icon, title, action, loading = false, children }: NoticeProps) {
  const alert = level === 'warn' || level === 'error';
  return (
    <div class="uk-notice" data-level={level} role={alert ? 'alert' : 'status'} aria-busy={loading || undefined}>
      {(loading || icon) && (
        <span class="uk-notice-icon" aria-hidden="true">
          {loading ? <span class="uk-spinner" /> : <Icon name={icon as string} />}
        </span>
      )}
      <div class="uk-notice-body">
        {title !== undefined && <div class="uk-notice-title">{title}</div>}
        {children !== undefined && <div class="uk-notice-text">{children}</div>}
      </div>
      {action !== undefined && <div class="uk-notice-action">{action}</div>}
    </div>
  );
}
