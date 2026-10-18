import { calendarDays } from '@overkube/sdk';
import { describe, expect, it } from 'vitest';
import { signersOf } from './request.tsx';
import { durationOf, durationSaid, leftSaid, levelOf, spanOf } from './shared.tsx';

/* What the addon works out of times and names. */

const HOUR = 3_600_000;
const say = (label: { en: unknown }, params: Record<string, unknown> = {}) => String(label.en).replace(/\{(\w+)\}/g, (_, k) => String(params[k]));

describe('a lifetime', () => {
  const now = new Date(2026, 9, 18, 23, 0).getTime();

  it('counts days as the page’s clock has them: tomorrow is in 1d, however few hours away', () => {
    expect([calendarDays(now + 2 * HOUR, now), calendarDays(now + 30 * 60_000, now), calendarDays(now - 24 * HOUR, now)]).toEqual([1, 0, -1]);
  });

  it('is ended once its Not After is past, even by an hour: said so, an error', () => {
    const span = { from: now - 90 * 24 * HOUR, till: now - 2 * HOUR, now };
    expect([leftSaid(say as never, span), levelOf(span)]).toEqual(['expired', 'error']);
    expect(leftSaid(say as never, { ...span, till: now - 50 * HOUR })).toBe('expired 2d ago');
  });

  it('is none where a time of it is not one', () => {
    expect([spanOf('soon', '2027-01-01T00:00:00Z', undefined, now), spanOf('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'never', now)]).toEqual([
      undefined,
      { from: Date.parse('2026-01-01T00:00:00Z'), till: Date.parse('2027-01-01T00:00:00Z'), now },
    ]);
  });
});

describe('a duration', () => {
  it('is read as Go writes one, said in whole days where it is', () => {
    expect([durationOf('2160h0m0s'), durationOf('90m'), durationOf('soon'), durationOf(undefined)]).toEqual([2160 * HOUR, 90 * 60_000, undefined, undefined]);
    expect([durationSaid(2160 * HOUR), durationSaid(36 * HOUR)]).toEqual(['90d', '36h']);
  });
});

describe('a request’s signer', () => {
  const request = (issuerRef: Record<string, string>) => ({ metadata: { name: 'r', namespace: 'shop' }, spec: { issuerRef } }) as never;

  it('is named as cert-manager’s webhook asks: every issuer of the kind, or this one', () => {
    expect(signersOf(request({ name: 'ca' }))).toEqual(['issuers.cert-manager.io/*', 'issuers.cert-manager.io/shop.ca']);
    expect(signersOf(request({ name: 'le', kind: 'ClusterIssuer', group: 'cert-manager.io' }))).toEqual(['clusterissuers.cert-manager.io/*', 'clusterissuers.cert-manager.io/le']);
    expect(signersOf(request({ name: 'p', kind: 'PartnerIssuer', group: 'issuers.example.com' }))).toEqual([
      'partnerissuers.issuers.example.com/*',
      'partnerissuers.issuers.example.com/shop.p',
      'partnerissuers.issuers.example.com/p',
    ]);
  });

  it('of another’s served kind: its plural and scope as discovery says them', () => {
    const served = new Map([['issuers.example.com/v1/PartnerIssuer', { group: 'issuers.example.com', kind: 'PartnerIssuer', plural: 'partners', namespaced: false }]]);
    expect(signersOf(request({ name: 'p', kind: 'PartnerIssuer', group: 'issuers.example.com' }), served as never)).toEqual([
      'partners.issuers.example.com/*',
      'partners.issuers.example.com/p',
    ]);
  });
});
