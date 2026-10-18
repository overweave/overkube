import { describe, expect, it } from 'vitest';
import { inScale, percent, said, scaleOf } from './units.ts';

/* How much is used, as kubectl top says it. */

describe('units', () => {
  it('says CPU in millicores (a part of one rounded up, as kubectl does), a core and more in cores', () => {
    expect(said('cpu', 0.000299187)).toBe('1m');
    expect(said('cpu', 0.412)).toBe('412m');
    expect(said('cpu', 0)).toBe('0m');
    expect(said('cpu', 2.4)).toBe('2.4 cores');
    expect(said('cpu', 24)).toBe('24 cores');
  });

  it('says memory in Mi (less than one in Ki), a Gi and more in Gi', () => {
    expect(said('memory', 280 * 1024)).toBe('280Ki');
    expect(said('memory', 460 * 1024 ** 2)).toBe('460Mi');
    expect(said('memory', 1.25 * 1024 ** 3)).toBe('1.25Gi');
    expect(said('rate', 22 * 1024)).toBe('22 KiB/s');
  });

  it('says others in a scale chosen by one (a limit in its value’s), a part in percent', () => {
    const scale = scaleOf('memory', 460 * 1024 ** 2);
    expect(inScale(1024 ** 3, scale)).toBe(1024);
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });
});
