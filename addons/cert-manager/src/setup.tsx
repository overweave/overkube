import type { Ctx } from '@overkube/sdk';
import { addAcme } from './acme.tsx';
import { addCertificate } from './certificate.tsx';
import { addColumns } from './columns.tsx';
import { addUses } from './ingress.tsx';
import { addIssuers } from './issuer.tsx';
import { Certificate, CertificateRequest, Challenge, ClusterIssuer, FIELDS, Issuer, Order } from './kinds.ts';
import { addLooks } from './looks.ts';
import { addOverview } from './overview.tsx';
import { addRequest } from './request.tsx';

/** Its kinds among Network's: each its icon, in this order. */
const VIEWS = [
  [Certificate, 'cert'],
  [Issuer, 'shield'],
  [ClusterIssuer, 'shield'],
  [CertificateRequest, 'file'],
  [Order, 'file-text'],
  [Challenge, 'globe'],
] as const;

/** Its definitions (its own chunk: loaded once it is turned on). */
export default function setup({ contributor: c, cluster }: Ctx) {
  for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
  c.add('Messages', 'en:cert-manager', { messages: {} }, { fallback: true });
  for (const [i, [kind, icon]] of VIEWS.entries()) c.add('KindView', kind.id, { title: `${kind.kind}s`, category: 'network', icon, order: 100 + i * 10 }, { fallback: true });
  addLooks(c);
  addColumns(c);
  const update = (kind: Parameters<typeof cluster.update>[0], object: Parameters<typeof cluster.update>[1]) => cluster.update(kind, object, { subresource: 'status' });
  addCertificate(c, update);
  addRequest(c, update, () => cluster.discovery.kinds.value);
  addAcme(c);
  addIssuers(c);
  addUses(c);
  addOverview(c);
}
