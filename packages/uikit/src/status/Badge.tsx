import type { ComponentChildren } from 'preact';
import type { Level } from '../lib/level';
import { Tip } from '../overlays/Tip';

/*
 * A word or a number on a soft tint of its level's colour: a state, a
 * note, a count. No level: a quiet grey. With a dot, a dot of its level
 * before it (a state: "● Running"). Long words are cut short (in full under
 * the pointer when it is given a title: a tip).
 */

export interface BadgeProps {
  level?: Level;
  /** A dot of its level before its words. */
  dot?: boolean;
  /** What it says in full (a tooltip). */
  title?: string;
  children: ComponentChildren;
}

export function Badge({ level, dot = false, title, children }: BadgeProps) {
  const badge = (
    <span class="uk-badge" data-level={level}>
      {dot && <span class="uk-badge-dot" aria-hidden="true" />}
      <span class="uk-badge-text">{children}</span>
    </span>
  );
  return title ? <Tip content={() => title}>{badge}</Tip> : badge;
}
