import type { ComponentChildren } from 'preact';
import { Icon } from '../display/Icon';

/*
 * How something goes, a step under another (a certificate's issuance: its
 * request, its order, its challenges): each its title (a link) and state,
 * under it what it is and when, then what is said of it — a line between
 * them, done ones in green; one going, one stuck, one not reached yet.
 */

export type StepState = 'done' | 'going' | 'stuck' | 'later';

const ICONS: Record<StepState, string> = { done: 'check', going: 'hourglass', stuck: 'x', later: 'circle-dashed' };

export function Steps({ children }: { children: ComponentChildren }) {
  return <div class="uk-steps">{children}</div>;
}

export function Step({
  state,
  title,
  status,
  meta,
  children,
}: {
  state: StepState;
  title: ComponentChildren;
  status?: ComponentChildren;
  meta?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <div class="uk-step" data-state={state}>
      <span class="uk-step-dot">
        <Icon name={ICONS[state]} />
      </span>
      <div class="uk-step-main">
        <div class="uk-step-title">
          {title}
          {status}
        </div>
        {meta && <div class="uk-step-meta">{meta}</div>}
        {children && <div class="uk-step-body">{children}</div>}
      </div>
    </div>
  );
}
