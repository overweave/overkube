import type { KubeContributor } from '@overkube/sdk';
import type { Tone } from '@overkube/uikit';
import { Certificate, CertificateRequest, Challenge, ClusterIssuer, Issuer, Order } from './kinds.ts';

/*
 * How cert-manager's states look, as the core's do (StatusLook: the user's
 * to change): a Certificate's (its conditions'), a CertificateRequest's,
 * an issuer's, ACME's orders' and challenges' (their state as it is).
 */

const LOOKS: [kinds: { id: string }[], match: string, tone: Tone, icon: string][] = [
  [[Certificate], 'Ready', 'ok', 'circle-check'],
  [[Certificate], 'Issuing', 'progress', 'spinner'],
  [[Certificate], 'Failed', 'error', 'circle-x'],
  [[Certificate], 'Expired', 'error', 'circle-x'],
  [[Certificate], '*', 'waiting', 'hourglass'],
  [[CertificateRequest], 'Issued', 'ok', 'circle-check'],
  [[CertificateRequest], 'Pending', 'waiting', 'hourglass'],
  [[CertificateRequest], 'Failed', 'error', 'circle-x'],
  [[CertificateRequest], 'Denied', 'error', 'ban'],
  [[Issuer, ClusterIssuer], 'Ready', 'ok', 'circle-check'],
  [[Issuer, ClusterIssuer], 'NotReady', 'error', 'circle-x'],
  [[Order, Challenge], 'valid', 'ok', 'circle-check'],
  [[Order, Challenge], 'pending', 'waiting', 'hourglass'],
  [[Order, Challenge], 'ready', 'progress', 'spinner'],
  [[Order, Challenge], 'processing', 'progress', 'spinner'],
  [[Order, Challenge], 'invalid', 'error', 'circle-x'],
  [[Order, Challenge], 'errored', 'error', 'circle-x'],
  [[Order, Challenge], 'expired', 'error', 'circle-x'],
];

/** Each a default another's of its name takes the place of. */
export function addLooks(c: KubeContributor): void {
  for (const [kinds, match, tone, icon] of LOOKS)
    c.add(
      'StatusLook',
      `cert-manager.${kinds[0].id.split('/').at(-1)?.toLowerCase()}.${match === '*' ? 'other' : match.toLowerCase()}`,
      { target: { kinds: kinds.map((k) => k.id) }, match, tone, icon },
      { fallback: true },
    );
}
