/*
 * A part of a whole (ready of wanted: 2/3): a small ring filled as far, its
 * words beside it. Its tone as it is: all of them, fine; some, a look; none
 * of some wanted, failing; none wanted, quiet. Past the whole (a surge:
 * 4/3), full. Filled anew as it changes.
 */

/** How a part of a whole feels: all (ok), some (warn), none of some (error), none wanted (none). */
export const ratioTone = (value: number, of: number) => (of <= 0 ? undefined : value >= of ? 'ok' : value <= 0 ? 'error' : 'warn');

// Its ring as wide as a state's circled icon beside it (13px across), its line a touch heavier (1.9: a ring alone, no mark in it).
const R = 5.55;
const ROUND = 2 * Math.PI * R;

export function Ratio({ value, of }: { value: number; of: number }) {
  const part = of > 0 ? Math.min(1, Math.max(0, value / of)) : 0;
  return (
    <span class="uk-ratio" data-tone={ratioTone(value, of)}>
      <svg class="uk-ratio-circle" viewBox="0 0 16 16" aria-hidden="true">
        <circle class="uk-ratio-whole" cx="8" cy="8" r={R} />
        {part > 0 && <circle class="uk-ratio-part" cx="8" cy="8" r={R} stroke-dasharray={`${part * ROUND} ${ROUND}`} />}
      </svg>
      <span class="uk-ratio-text">
        {value}/{of}
      </span>
    </span>
  );
}
