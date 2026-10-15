import { describe, expect, it } from 'vitest';
import { bytes, cores } from './format.ts';

/* Amounts as the API writes them — a sum's float dust gone. */

describe('amounts', () => {
  it('says cores whole as they are, else in millicores, to a millicore', () => {
    expect([2, 0.25, 0.1 + 0.1 + 0.05 + 0.1, 1.05 + 1e-12, 2.0000000000001, 0.0004].map(cores)).toEqual(['2', '250m', '350m', '1050m', '2', '0']);
  });

  it('says bytes in the largest binary unit, to a tenth', () => {
    expect([512 * 2 ** 20, 1.5 * 2 ** 30 + 1e-6, 1000].map(bytes)).toEqual(['512Mi', '1.5Gi', '1000']);
  });
});
