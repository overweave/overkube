import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/*
 * A long text kept short: its first lines (so many), and — only when there
 * is more of it — a way to all of it and back. Whether there is more is
 * measured as it is drawn (and again as its width or what is in it changes).
 */

export interface ClampedLabels {
  more: string;
  less: string;
}

const LABELS: ClampedLabels = { more: 'Show all', less: 'Show less' };

export function Clamped({ lines = 2, labels = LABELS, children }: { lines?: number; labels?: ClampedLabels; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || open) return;
    const measure = () => setMore(el.scrollHeight > el.clientHeight + 1);
    measure();
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    resized?.observe(el);
    const changed = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(measure);
    changed?.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      resized?.disconnect();
      changed?.disconnect();
    };
  }, [open, children]);
  return (
    <div class="uk-clamped">
      <div ref={box} class="uk-clamped-text" data-open={open ? '' : undefined} style={{ '--uk-clamp': lines }}>
        {children}
      </div>
      {(more || open) && (
        <button type="button" class="uk-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? labels.less : labels.more}
        </button>
      )}
    </div>
  );
}
