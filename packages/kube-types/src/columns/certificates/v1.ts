/*
 * The certificates.k8s.io group's v1 types (generated) and how kubectl shows
 * its kinds (by hand: printers.go, v1.37.1 — printCertificateSigningRequest,
 * extractCSRStatus).
 */

import type { CertificateSigningRequest } from '../../gen/certificates/v1.js';
import { ageColumn, humanDuration, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/certificates/v1.js';

/** Denied, else Approved, else Pending; ",Failed" if it failed, ",Issued" once it has its certificate (extractCSRStatus). */
function condition(o: CertificateSigningRequest): string {
  const types = new Set((o.status?.conditions ?? []).map((c) => c.type));
  let status = types.has('Denied') ? 'Denied' : types.has('Approved') ? 'Approved' : 'Pending';
  if (types.has('Failed')) status += ',Failed';
  if (o.status?.certificate) status += ',Issued';
  return status;
}

export const certificateSigningRequestColumns: PrinterColumn<CertificateSigningRequest>[] = [
  nameColumn,
  ageColumn,
  { name: 'SignerName', type: 'string', value: (o) => o.spec.signerName || undefined, display: (o) => o.spec.signerName || '<none>' },
  { name: 'Requestor', type: 'string', value: (o) => o.spec.username, display: (o) => o.spec.username ?? '' },
  {
    name: 'RequestedDuration',
    type: 'string',
    value: (o) => (o.spec.expirationSeconds === undefined ? undefined : o.spec.expirationSeconds * 1000),
    display: (o) => (o.spec.expirationSeconds === undefined ? '<none>' : humanDuration(o.spec.expirationSeconds * 1000)),
  },
  { name: 'Condition', type: 'string', value: condition, display: condition },
];
