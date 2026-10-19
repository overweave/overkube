import { humanDuration } from '@overkube/sdk';
import { useSay } from '@overkube/sdk/preact';
import { Status } from '@overkube/uikit';
import { T } from './texts.ts';

/*
 * A Flux object's state as Flux leaves it (flux get says it so): Ready;
 * Reconciling, and how long (its Ready condition Unknown: on its way);
 * its Ready condition's reason, failed (ArtifactFailed, GitOperationFailed…);
 * Suspended (spec.suspend, whatever it was). Flux's words, its tip. The
 * revision applied against the one attempted: the same, one; on its way
 * or failing, both — on one baseline, text alone.
 */

export interface State {
  ready: string;
  reason: string;
  message: string;
  since: unknown;
  suspended: string;
}

/** A field's value as text (none: ''). */
export const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** How long ago (a time field's ms, or a time's words); none: ''. */
export const ago = (v: unknown) => {
  const at = typeof v === 'number' ? v : typeof v === 'string' && v ? Date.parse(v) : Number.NaN;
  return Number.isFinite(at) && at ? humanDuration(Math.max(0, Date.now() - at)) : '';
};

/** The state of its fields' values (STATE's, in its order). */
export const stateOf = ([ready, reason, message, since, suspended]: readonly unknown[]): State => ({
  ready: text(ready),
  reason: text(reason),
  message: text(message),
  since,
  suspended: text(suspended),
});

/** Not Ready: failing or on its way (one suspended aside: it is not looked after). */
export const notReady = (s: State) => !s.suspended && s.ready !== 'True';

export function FluxState({ ready, reason, message, since, suspended }: State) {
  const say = useSay();
  const tip = message ? { title: message } : {};
  if (suspended)
    return (
      <Status tone="warn" icon="pause" {...tip}>
        {say(T.state.suspended)}
      </Status>
    );
  if (ready === 'True')
    return (
      <Status tone="ok" icon="circle-check" {...tip}>
        {say(T.state.ready)}
      </Status>
    );
  if (ready === 'False')
    return (
      <Status tone="error" icon="circle-x" {...tip}>
        {reason || 'False'}
      </Status>
    );
  const long = ago(since);
  return (
    <Status tone="progress" icon="spinner" {...tip}>
      {long ? say(T.state.reconcilingFor, { duration: long }) : say(T.state.reconciling)}
    </Status>
  );
}

/** Applied → attempted: the same (or none attempted), one; else both, the attempted one failing or on its way. */
export function Revision({ applied, attempted, failed }: { applied: string; attempted: string; failed: boolean }) {
  if (!attempted || applied === attempted) return <span class="uk-mono">{applied || '—'}</span>;
  return (
    <span class="uk-line">
      <span class="uk-mono uk-quiet">{applied || '—'}</span>
      <span class="uk-quiet">→</span>
      <Status tone={failed ? 'error' : 'progress'}>
        <span class="uk-mono">{attempted}</span>
      </Status>
    </span>
  );
}
