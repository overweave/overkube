import { describe, expect, it } from 'vitest';
import { calm, smoothPath } from './curve';

/* A line made calm (buckets' means) and drawn smooth (through the points' midpoints). */

describe('calm', () => {
  it('keeps a short line as it is', () => {
    expect(calm([1, 2, 3], 16)).toEqual([1, 2, 3]);
  });

  it('makes a long one at most so many points, each its bucket’s mean', () => {
    const line = calm(
      Array.from({ length: 60 }, (_, i) => i),
      16,
    );
    expect(line.length).toBeLessThanOrEqual(16);
    expect(line[0]).toBe(1.5);
    expect(line.at(-1)).toBe(57.5);
  });
});

describe('smoothPath', () => {
  it('starts at the first point, curves through the midpoints, ends at the last', () => {
    expect(
      smoothPath([
        [0, 10],
        [10, 0],
        [20, 10],
      ]),
    ).toBe('M0,10 Q0,10 5,5 Q10,0 15,5 L20,10');
  });

  it('is nothing for no points, a point for one', () => {
    expect([smoothPath([]), smoothPath([[3, 4]])]).toEqual(['', 'M3,4']);
  });
});
