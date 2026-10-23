import { defineAddon, lazySetup } from '@overkube/sdk';

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

export default defineAddon({
  id: 'cert-manager',
  title: 'cert-manager',
  description: 'Certificates: when they end, how they are issued and where it stops, their issuers; Renew, Approve, Deny.',
  requires: { served: 'cert-manager.io' },
  answers: [{ title: 'cert-manager', when: { served: 'cert-manager.io' } }],
  setup: lazySetup(() => import('./setup.tsx')),
});
