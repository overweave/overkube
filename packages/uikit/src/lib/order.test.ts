import { describe, expect, it } from 'vitest';
import { keepHidden } from './order';

describe('keepHidden', () => {
  it('keeps one not drawn before the one it came before', () => {
    // b not drawn; c moved first: b still before c.
    expect(keepHidden(['c', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('keeps the last ones last, and runs of them together', () => {
    expect(keepHidden(['b', 'a'], ['a', 'b', 'x', 'y'])).toEqual(['b', 'a', 'x', 'y']);
    expect(keepHidden(['c', 'a'], ['a', 'x', 'y', 'c'])).toEqual(['x', 'y', 'c', 'a']);
  });

  it('adds what is new as it is drawn, and leaves the drawn order alone', () => {
    expect(keepHidden(['n', 'a'], ['a'])).toEqual(['n', 'a']);
    expect(keepHidden([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
