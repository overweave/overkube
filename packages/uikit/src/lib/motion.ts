import { useEffect, useState } from 'preact/hooks';

/*
 * Showing and hiding with a little motion: something asked to go stays
 * drawn while it fades out (data-state="closing"), then goes. The motion
 * itself is CSS (and none under prefers-reduced-motion).
 */

/** How long a closing animation lasts (the CSS's). */
export const EXIT_MS = 130;

/** Whether to draw it, and as what: open, or closing (still drawn, fading out). */
export function usePresence(open: boolean, ms = EXIT_MS): { mounted: boolean; state: 'open' | 'closing' } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);
  return { mounted: open || mounted, state: open ? 'open' : 'closing' };
}
