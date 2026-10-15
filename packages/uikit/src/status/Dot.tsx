import type { Level } from '../lib/level';
import { Tip } from '../overlays/Tip';

/** A health dot, grey for no level (not known). Named (its title, a tip), an image a reader says; else hidden from one (what it means is said beside it). */
export function Dot({ level, title }: { level?: Level; title?: string }) {
  return title ? (
    <Tip content={() => title}>
      <span class="uk-dot" data-level={level} role="img" aria-label={title} />
    </Tip>
  ) : (
    <span class="uk-dot" data-level={level} aria-hidden="true" />
  );
}
