import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

/** How often the ages move on. */
export const AGE_TICK_MS = 30_000;

/**
 * Now, to the half minute: what every Age reads, so they all move
 * together. Kept moving while some Age is drawn (the first starts it, the
 * last stops it); none drawn, nothing runs.
 */
const now = signal(Date.now());
let drawn = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function useNow(): number {
  useEffect(() => {
    if (drawn++ === 0) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, AGE_TICK_MS);
    }
    return () => {
      if (--drawn === 0) clearInterval(timer);
    };
  }, []);
  return now.value;
}

/** How long ago, as kubectl says it (to one unit): 45s, 12m, 3h, 5d. Nothing for no time, or one that is not a time. */
export function age(since: string | number | Date | undefined, at = Date.now()): string {
  if (since === undefined) return '';
  const s = Math.max(0, Math.floor((at - new Date(since).getTime()) / 1000));
  if (Number.isNaN(s)) return '';
  if (s < 120) return `${s}s`;
  if (s < 7200) return `${Math.floor(s / 60)}m`;
  if (s < 172_800) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** How long ago, moving on as time does; the time itself under the pointer. */
export function Age({ since }: { since?: string }) {
  return <span title={since}>{age(since, useNow())}</span>;
}
