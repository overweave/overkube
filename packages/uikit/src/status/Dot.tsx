import type { Level } from '../lib/level';

/** A health dot, grey for no level (not known). Named (its title), an image a reader says; else hidden from one (what it means is said beside it). */
export function Dot({ level, title }: { level?: Level; title?: string }) {
  return title ? <span class="uk-dot" data-level={level} title={title} role="img" aria-label={title} /> : <span class="uk-dot" data-level={level} aria-hidden="true" />;
}
