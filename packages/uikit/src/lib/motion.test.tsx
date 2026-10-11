import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_MS, usePresence } from './motion';

/* Showing and hiding with a little motion: drawn while it fades out, then gone; opened again meanwhile, it stays. */

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(open: boolean, ms?: number) {
  const seen: { mounted: boolean; state: string }[] = [];
  function Probe({ open: o }: { open: boolean }) {
    seen.push(usePresence(o, ms));
    return null;
  }
  const view = render(<Probe open={open} />);
  const now = () => seen[seen.length - 1];
  return { now, set: (o: boolean) => view.rerender(<Probe open={o} />) };
}

describe('usePresence', () => {
  it('is drawn and open while open', () => {
    expect(mount(true).now()).toEqual({ mounted: true, state: 'open' });
  });

  it('is not drawn, closed from the first', () => {
    expect(mount(false).now()).toEqual({ mounted: false, state: 'closing' });
  });

  it('closed, stays drawn while it fades out (closing), then is gone', () => {
    const p = mount(true);
    p.set(false);
    expect(p.now()).toEqual({ mounted: true, state: 'closing' });
    act(() => {
      vi.advanceTimersByTime(EXIT_MS - 1);
    });
    expect(p.now().mounted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(p.now()).toEqual({ mounted: false, state: 'closing' });
  });

  it('opened again while fading out, stays drawn, open', () => {
    const p = mount(true);
    p.set(false);
    p.set(true);
    act(() => {
      vi.advanceTimersByTime(EXIT_MS * 2);
    });
    expect(p.now()).toEqual({ mounted: true, state: 'open' });
  });

  it('fades out as long as it is told', () => {
    const p = mount(true, 400);
    p.set(false);
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 10);
    });
    expect(p.now().mounted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(p.now().mounted).toBe(false);
  });
});
