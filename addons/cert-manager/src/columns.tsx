import type { KindInfo } from '@overkube/kube-types';
import { type CellValue, type ColumnContext, type ColumnSpec, column, type KubeContributor, type LabelRef, shortTime } from '@overkube/sdk';
import { statusFormat } from '@overkube/sdk/preact';
import { LifetimeCell } from '@overkube/uikit';
import { Certificate, CertificateRequest, Challenge, ClusterIssuer, F, Issuer, Order } from './kinds.ts';
import { leftSaid, levelOf, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * cert-manager's kinds' tables: their CRDs' columns, each in its place (its
 * name, its order: the CRD's own, whether it can be read or not — a viewer
 * cannot), a Ready (or State) in cert-manager's words drawn as its look
 * says; a Certificate's lifetime (Expires: the soonest end first, as its
 * days left — its renewal past, a warning; a week left or ended, an
 * error); an issuer's type.
 */

const text = (v: CellValue | undefined) => (typeof v === 'string' ? v : undefined);

/** A Certificate's lifetime in a cell: its bar, its days left; not issued, none. */
function expires([notAfter, renewal, notBefore]: readonly CellValue[], { now, say }: ColumnContext) {
  const time = (v: CellValue) => (typeof v === 'number' ? new Date(v).toISOString() : text(v));
  const span = spanOf(time(notBefore), time(notAfter), time(renewal), now);
  if (!span) return '—';
  return <LifetimeCell {...span} level={levelOf(span)} said={leftSaid(say, span)} title={`${say(T.times.notAfter)} ${shortTime(span.till)}`} />;
}

type Own = [header: LabelRef, sort: string, more?: Partial<ColumnSpec>];

/** Each kind's CRD's columns, in its order (Age the core's), as cert-manager's CRDs print them. */
const CRD: [KindInfo, Own[]][] = [
  [
    Certificate,
    [
      [T.columns.ready, F.state, { format: statusFormat }],
      [T.columns.secret, F.secret],
      [T.columns.issuer, F.issuer, { wide: true }],
      [T.columns.status, F.message, { wide: true }],
    ],
  ],
  [
    CertificateRequest,
    [
      [T.columns.approved, F.approved],
      [T.columns.denied, F.denied],
      [T.columns.ready, F.requestState, { format: statusFormat }],
      [T.columns.issuer, '.spec.issuerRef.name'],
      [T.columns.requester, '.spec.username'],
      [T.columns.status, F.readyMessage, { wide: true }],
    ],
  ],
  [
    Order,
    [
      [T.columns.state, '.status.state', { format: statusFormat }],
      [T.columns.issuer, '.spec.issuerRef.name', { wide: true }],
      [T.columns.reason, '.status.reason', { wide: true }],
    ],
  ],
  [
    Challenge,
    [
      [T.columns.state, '.status.state', { format: statusFormat }],
      [T.columns.domain, '.spec.dnsName'],
      [T.columns.reason, '.status.reason', { wide: true }],
    ],
  ],
  ...[Issuer, ClusterIssuer].map((kind): [KindInfo, Own[]] => [
    kind,
    [
      [T.columns.ready, F.issuerState, { format: statusFormat }],
      [T.columns.status, F.readyMessage, { wide: true }],
    ],
  ]),
];

export function addColumns(c: KubeContributor): void {
  // In the place of each CRD's own: its name (core.<kind>.<its name>), its order.
  for (const [kind, columns] of CRD)
    for (const [i, [header, sort, more]] of columns.entries())
      c.add('Column', `core.${kind.id}.${header.key.split('.').pop()}`, column({ kinds: [kind], header, sort, order: 100 + i * 10, ...more }));
  c.add(
    'Column',
    'cert-manager.certificates.expires',
    column({ kinds: [Certificate], header: T.columns.expires, sort: F.notAfter, values: [F.notAfter, F.renewal, F.notBefore], format: expires, width: 160, order: 115 }),
  );
  for (const kind of [Issuer, ClusterIssuer])
    c.add('Column', `cert-manager.${kind.plural}.type`, column({ kinds: [kind], header: T.columns.type, sort: F.issuerType, order: 105 }));
}
