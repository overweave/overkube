import type { ComponentChildren } from 'preact';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/** How a state feels: fine, on its way, held up, needs a look, failing, done with, going away, not known. */
export type Tone = 'ok' | 'progress' | 'waiting' | 'warn' | 'error' | 'done' | 'gone' | 'unknown';

export const TONES: readonly Tone[] = ['ok', 'progress', 'waiting', 'warn', 'error', 'done', 'gone', 'unknown'];

/**
 * A state: its icon in its tone's colour, its words — in that colour too
 * when it needs a look or fails, quieter when it is done with, going or not
 * known. On its way, its icon turns; going away, it fades in and out (not
 * when motion is to be kept down). What it means in full: its title (a tip). No
 * words: its icon alone (a row's mark, its words beside it) — an image, its
 * title its name for those who cannot see it.
 */
export function Status({ tone, icon, title, children }: { tone: Tone; icon?: string; title?: string; children?: ComponentChildren }) {
  const status = (
    <span class="uk-status" data-tone={tone} {...(children === undefined ? { role: 'img', 'aria-label': title ?? tone } : {})}>
      {icon && <Icon name={icon} />}
      {children !== undefined && <span class="uk-status-text">{children}</span>}
    </span>
  );
  return title ? <Tip content={() => title}>{status}</Tip> : status;
}
