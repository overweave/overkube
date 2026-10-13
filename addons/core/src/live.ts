import { computed, signal } from '@preact/signals';
import { useMemo } from 'preact/hooks';

/*
 * Text that follows the clock where it reads it: a cell's, a field's — an
 * age, "5m ago" — worked out again as now changes, drawn again only where
 * it changes.
 */

let ticking: ReturnType<typeof setInterval> | undefined;

/** The time live texts are worked out to: ticking each second while a text reads it (none: still). */
export const clock = signal(Date.now(), {
  watched() {
    this.value = Date.now();
    ticking = setInterval(() => {
      this.value = Date.now();
    }, 1000);
  },
  unwatched() {
    clearInterval(ticking);
  },
});

/** A text, live: worked out again as what it reads changes (the clock, if it reads clock.value) or deps do; the component drawn again only as it changes. */
export function useLive(text: () => string, deps: readonly unknown[]): string {
  const live = useMemo(() => computed(text), deps);
  return live.value;
}
