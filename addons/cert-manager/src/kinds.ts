import type { KindInfo } from '@overkube/kube-types';
import type { FieldSpec } from '@overkube/sdk';

/*
 * cert-manager's kinds (cert-manager.io, acme.cert-manager.io) and the
 * fields the addon asks by — each of an object alone (CEL, a path): a
 * Certificate's, a CertificateRequest's, an issuer's state in
 * cert-manager's own words (its conditions' types and reasons, as kubectl
 * describe says them), a Certificate's times, what a request or an order
 * is of (cert-manager's annotations), what a Secret is managed by.
 */

const kind = (group: string, name: string, plural: string, namespaced: boolean): KindInfo => ({
  id: `${group}/v1/${name}`,
  group,
  version: 'v1',
  kind: name,
  plural,
  singular: name.toLowerCase(),
  namespaced,
  verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
});

export const Certificate = kind('cert-manager.io', 'Certificate', 'certificates', true);
export const CertificateRequest = kind('cert-manager.io', 'CertificateRequest', 'certificaterequests', true);
export const Issuer = kind('cert-manager.io', 'Issuer', 'issuers', true);
export const ClusterIssuer = kind('cert-manager.io', 'ClusterIssuer', 'clusterissuers', false);
export const Order = kind('acme.cert-manager.io', 'Order', 'orders', true);
export const Challenge = kind('acme.cert-manager.io', 'Challenge', 'challenges', true);

/** Their refs, as queries name them. */
export const REF = {
  certificates: 'certificates.v1.cert-manager.io',
  requests: 'certificaterequests.v1.cert-manager.io',
  issuers: 'issuers.v1.cert-manager.io',
  clusterIssuers: 'clusterissuers.v1.cert-manager.io',
  orders: 'orders.v1.acme.cert-manager.io',
  challenges: 'challenges.v1.acme.cert-manager.io',
} as const;

/** A condition of self's, by its type (none: an empty list). */
const condition = (type: string) => `self.?status.?conditions.orValue([]).filter(c, c.type == "${type}")`;
/** One of cert-manager's annotations. */
const annotation = (name: string) => `self.?metadata.?annotations[?"cert-manager.io/${name}"].orValue("")`;

export const F = {
  /** A Certificate's state: Issuing (its Issuing condition True), Ready, Failed (its last issuance), else its Ready condition's reason (Expired, DoesNotExist…). */
  state: 'cert-manager.certificates.state',
  /** What its Ready condition (or, issuing, its Issuing condition) says. */
  message: 'cert-manager.certificates.message',
  notBefore: 'cert-manager.certificates.not-before',
  notAfter: 'cert-manager.certificates.not-after',
  renewal: 'cert-manager.certificates.renewal-time',
  issuer: 'cert-manager.certificates.issuer',
  issuerKind: 'cert-manager.certificates.issuer-kind',
  /** Its issuer's group (none said: cert-manager.io). */
  issuerGroup: 'cert-manager.certificates.issuer-group',
  secret: 'cert-manager.certificates.secret',
  /** A CertificateRequest's state: Denied, Issued, Failed, else Pending (approved or not). */
  requestState: 'cert-manager.certificaterequests.state',
  /** A CertificateRequest's Approved, Denied condition's status (True; none: ''), as its CRD's columns say them. */
  approved: 'cert-manager.certificaterequests.approved',
  denied: 'cert-manager.certificaterequests.denied',
  /** What a request's, an issuer's Ready condition says (its CRD's Status). */
  readyMessage: 'cert-manager.ready-message',
  /** What a request, an order is of: its Certificate (cert-manager's annotation). */
  requestOf: 'cert-manager.certificaterequests.certificate',
  orderOf: 'cert-manager.orders.certificate',
  /** An issuer's state (Ready, NotReady; none said: Unknown) and type (ACME, CA, SelfSigned, Vault, Venafi; another's: External). */
  issuerState: 'cert-manager.issuers.state',
  issuerType: 'cert-manager.issuers.type',
  /** The Certificate a Secret is managed by (cert-manager's annotation; none: ''). */
  managedBy: 'cert-manager.secrets.certificate',
} as const;

const certificates = [REF.certificates];
const issuers = [REF.issuers, REF.clusterIssuers];

export const FIELDS: Record<string, FieldSpec> = {
  [F.state]: {
    kinds: certificates,
    type: 'string',
    value: {
      cel: `cel.bind(r, ${condition('Ready')}, cel.bind(i, ${condition('Issuing')},
        i.size() > 0 && i[0].status == "True" ? "Issuing"
        : r.size() > 0 && r[0].status == "True" ? "Ready"
        : i.size() > 0 && i[0].?reason.orValue("") == "Failed" ? "Failed"
        : r.size() > 0 ? r[0].?reason.orValue("Unknown") : "Pending"))`,
    },
  },
  [F.message]: {
    kinds: certificates,
    type: 'string',
    value: {
      cel: `cel.bind(r, ${condition('Ready')}, cel.bind(i, ${condition('Issuing')},
        i.size() > 0 && (i[0].status == "True" || i[0].?reason.orValue("") == "Failed") ? i[0].?message.orValue("")
        : r.size() > 0 ? r[0].?message.orValue("") : ""))`,
    },
  },
  [F.notBefore]: { kinds: certificates, type: 'time', value: '.status.notBefore' },
  [F.notAfter]: { kinds: certificates, type: 'time', value: '.status.notAfter' },
  [F.renewal]: { kinds: certificates, type: 'time', value: '.status.renewalTime' },
  [F.issuer]: { kinds: certificates, type: 'string', value: '.spec.issuerRef.name' },
  [F.issuerKind]: { kinds: certificates, type: 'string', value: { cel: 'self.?spec.?issuerRef.?kind.orValue("Issuer")' } },
  [F.issuerGroup]: { kinds: certificates, type: 'string', value: { cel: 'cel.bind(g, self.?spec.?issuerRef.?group.orValue(""), g == "" ? "cert-manager.io" : g)' } },
  [F.secret]: { kinds: certificates, type: 'string', value: '.spec.secretName' },
  [F.requestState]: {
    kinds: [REF.requests],
    type: 'string',
    value: {
      cel: `cel.bind(d, ${condition('Denied')}, cel.bind(r, ${condition('Ready')},
        d.size() > 0 && d[0].status == "True" ? "Denied"
        : r.size() > 0 && r[0].status == "True" ? "Issued"
        : r.size() > 0 && r[0].?reason.orValue("") == "Failed" ? "Failed"
        : "Pending"))`,
    },
  },
  [F.approved]: { kinds: [REF.requests], type: 'string', value: { cel: `cel.bind(c, ${condition('Approved')}, c.size() > 0 ? c[0].status : "")` } },
  [F.denied]: { kinds: [REF.requests], type: 'string', value: { cel: `cel.bind(c, ${condition('Denied')}, c.size() > 0 ? c[0].status : "")` } },
  [F.readyMessage]: {
    kinds: [REF.requests, ...issuers],
    type: 'string',
    value: { cel: `cel.bind(c, ${condition('Ready')}, c.size() > 0 ? c[0].?message.orValue("") : "")` },
  },
  [F.requestOf]: { kinds: [REF.requests], type: 'string', value: { cel: annotation('certificate-name') } },
  [F.orderOf]: { kinds: [REF.orders], type: 'string', value: { cel: annotation('certificate-name') } },
  [F.issuerState]: {
    kinds: issuers,
    type: 'string',
    value: { cel: `cel.bind(r, ${condition('Ready')}, r.size() == 0 ? "Unknown" : r[0].status == "True" ? "Ready" : "NotReady")` },
  },
  [F.issuerType]: {
    kinds: issuers,
    type: 'string',
    value: {
      cel: `self.?spec.?acme.hasValue() ? "ACME" : self.?spec.?ca.hasValue() ? "CA" : self.?spec.?selfSigned.hasValue() ? "SelfSigned"
        : self.?spec.?vault.hasValue() ? "Vault" : self.?spec.?venafi.hasValue() ? "Venafi" : "External"`,
    },
  },
  [F.managedBy]: { kinds: ['secrets.v1'], type: 'string', value: { cel: annotation('certificate-name') } },
};
