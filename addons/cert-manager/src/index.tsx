import { defineAddon } from '@overkube/sdk';
import { addAcme } from './acme.tsx';
import { addCertificate } from './certificate.tsx';
import { addColumns } from './columns.tsx';
import { addUses } from './ingress.tsx';
import { addIssuers } from './issuer.tsx';
import { Certificate, CertificateRequest, Challenge, ClusterIssuer, FIELDS, Issuer, Order } from './kinds.ts';
import { addLooks } from './looks.ts';
import { addOverview } from './overview.tsx';
import { addRequest } from './request.tsx';

/*
 * cert-manager: its kinds among Network's (each its icon), their states in
 * its words, a Certificate's lifetime (its table's Expires, its view's
 * Validity, the start's panel of the soonest ends), how it is issued (its
 * request, ACME's order and challenges — where it stops, and why), its
 * spec against what its Secret holds, its failed attempts; its issuers
 * (a CA's own end, ACME's solvers, what they issue); where certificates are
 * used (an Ingress's TLS, a Secret's Certificate); every one related as the
 * core's kinds are. Renew, Approve, Deny — each shown to one who may.
 *
 *   kinds.ts        its kinds, the fields asked by          columns.tsx   its tables
 *   certificate.tsx a Certificate's view, Renew             request.tsx   a CertificateRequest's, Approve, Deny
 *   acme.tsx        an Order's, a Challenge's               issuer.tsx    an Issuer's, a ClusterIssuer's
 *   ingress.tsx     an Ingress's TLS, a Secret's            overview.tsx  the start's panel
 *
 * Off until turned on (an addon): suggested where cert-manager is served.
 */

/** Its kinds among Network's: each its icon, in this order. */
const VIEWS = [
  [Certificate, 'cert'],
  [Issuer, 'shield'],
  [ClusterIssuer, 'shield'],
  [CertificateRequest, 'file'],
  [Order, 'file-text'],
  [Challenge, 'globe'],
] as const;

export default defineAddon({
  id: 'cert-manager',
  title: 'cert-manager',
  description: 'Certificates: when they end, how they are issued and where it stops, their issuers; Renew, Approve, Deny.',
  requires: { served: 'cert-manager.io' },
  answers: [{ title: 'cert-manager', when: { served: 'cert-manager.io' } }],
  setup({ contributor: c, cluster }) {
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
  },
});
