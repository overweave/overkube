import { Tip } from '../overlays/Tip';
import type { Tone } from '../status/Status';

/*
 * How a whole is split (pods: Running, Pending, failing): a ring, each part
 * as long an arc as it is of the whole, in its tone; its tip lists the parts
 * — each a dot of its tone, what it is, how many. Parts of none: not drawn.
 */

export interface SplitPart {
  tone: Tone;
  count: number;
  label: string;
}

const SIZE = 36;
const R = SIZE / 2 - 4;
const AROUND = 2 * Math.PI * R;
/** The gap between two parts, along the ring. */
const GAP = 2;

/** quiet: its parts said beside it already (a tile's note) — the ring not said again to those who cannot see it. */
export function Split({ parts, quiet = false }: { parts: readonly SplitPart[]; quiet?: boolean }) {
  const there = parts.filter((p) => p.count > 0);
  if (!there.length) return null;
  const all = there.reduce((n, p) => n + p.count, 0);
  let at = 0;
  return (
    <Tip
      content={() => (
        <div class="uk-split-parts">
          {there.map((p) => (
            <div key={p.label}>
              <i data-tone={p.tone} />
              <span>{p.label}</span>
              <b>{p.count}</b>
            </div>
          ))}
        </div>
      )}
    >
      <svg class="uk-split" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={there.map((p) => `${p.count} ${p.label}`).join(', ')} aria-hidden={quiet || undefined}>
        <circle class="uk-split-whole" cx={SIZE / 2} cy={SIZE / 2} r={R} />
        {there.map((p) => {
          const arc = (p.count / all) * AROUND;
          const drawn = (
            <circle
              key={p.label}
              data-tone={p.tone}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke-dasharray={`${Math.max(0.5, arc - (there.length > 1 ? GAP : 0))} ${AROUND}`}
              stroke-dashoffset={-at}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          );
          at += arc;
          return drawn;
        })}
      </svg>
    </Tip>
  );
}
