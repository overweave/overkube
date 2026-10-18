import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { EC_PEM, type FakeCluster } from '@overkube/testkit';
import { Certificate, CertificateRequest, Challenge, ClusterIssuer, Issuer, Order } from './kinds.ts';

/*
 * A cluster the cert-manager addon's tests and stories draw, its times
 * from now: an ACME ClusterIssuer and what it issues — a Certificate
 * ready, one near its end (its renewal past), one issuing (its request,
 * its Order, its Challenge stuck on the self check), one whose issuance
 * failed twice (cert-manager waits); a CA Issuer, a Vault one not ready;
 * a request of another's issuer waiting for approval; Ingresses serving
 * them (a host no TLS covers; an issuer named that is not there).
 */

export const CERT_MANAGER_KINDS = [Certificate, CertificateRequest, Issuer, ClusterIssuer, Order, Challenge];

const { Namespace, Secret } = kinds.core.v1;
const { Ingress } = kinds.networking.v1;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NS = 'shop';

/** The cluster, its times from now. */
export function certManagerCluster(c: FakeCluster, now = Date.now()) {
  const at = (ms: number) => new Date(now + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const made = (ago: number) => ({ creationTimestamp: at(-ago) });
  const put = (kind: KindInfo, object: Omit<KubeObject, 'apiVersion' | 'kind'> & Record<string, unknown>) =>
    c.add(kind, { apiVersion: kind.group ? `${kind.group}/${kind.version}` : kind.version, kind: kind.kind, ...object } as never);
  const ready = (status: string, reason: string, message: string, type = 'Ready') => ({ type, status, reason, message, lastTransitionTime: at(-DAY) });
  const owned = (kind: KindInfo, name: string) => [{ apiVersion: `${kind.group}/${kind.version}`, kind: kind.kind, name, uid: `${name}-uid`, controller: true }];

  put(Namespace, { metadata: { name: NS } });

  // Issuers: ACME (ready), a CA of its own Secret's (no Certificate renews it), Vault (not ready).
  put(ClusterIssuer, {
    metadata: { name: 'letsencrypt', ...made(90 * DAY) },
    spec: {
      acme: {
        server: 'https://acme-staging-v02.api.letsencrypt.org/directory',
        email: 'ops@shop.test',
        privateKeySecretRef: { name: 'letsencrypt-account' },
        solvers: [{ http01: { ingress: { ingressClassName: 'nginx' } } }],
      },
    },
    status: {
      acme: { uri: 'https://acme-staging-v02.api.letsencrypt.org/acme/acct/1' },
      conditions: [ready('True', 'ACMEAccountRegistered', 'The ACME account was registered with the ACME server')],
    },
  });
  put(ClusterIssuer, {
    metadata: { name: 'vault', ...made(DAY) },
    spec: { vault: { server: 'https://vault.shop.test', path: 'pki/sign/shop', auth: { tokenSecretRef: { name: 'vault-token', key: 'token' } } } },
    status: { conditions: [ready('False', 'VaultError', 'Failed to initialize Vault client: error reading Kubernetes Secret cert-manager/vault-token')] },
  });
  put(Issuer, {
    metadata: { name: 'partner-ca', namespace: NS, ...made(30 * DAY) },
    spec: { ca: { secretName: 'partner-ca' } },
    status: { conditions: [ready('True', 'KeyPairVerified', 'Signing CA verified')] },
  });
  put(Secret, { metadata: { name: 'partner-ca', namespace: NS, ...made(30 * DAY) }, type: 'kubernetes.io/tls', data: { 'tls.crt': btoa(EC_PEM) } });

  // Certificates.
  const acme = { name: 'letsencrypt', kind: 'ClusterIssuer' };
  const certificate = (name: string, status: Record<string, unknown>, spec: Record<string, unknown> = {}) =>
    put(Certificate, {
      metadata: { name, namespace: NS, ...made(60 * DAY) },
      spec: { secretName: name, dnsNames: [`${name.replace(/-tls$/, '')}.shop.test`], issuerRef: acme, ...spec },
      status,
    });
  // Its end and renewal an hour past whole days: said the same while the test runs.
  const issued = (from: number, till: number, renewal: number, revision: number) => ({
    notBefore: at(from),
    notAfter: at(till + HOUR),
    renewalTime: at(renewal + HOUR),
    revision,
    conditions: [ready('True', 'Ready', 'Certificate is up to date and has not expired')],
  });
  certificate('shop-tls', issued(-30 * DAY, 60 * DAY, 30 * DAY, 2), { dnsNames: ['shop.example.com', 'www.shop.example.com'], privateKey: { algorithm: 'ECDSA' } });
  put(Secret, {
    metadata: { name: 'shop-tls', namespace: NS, ...made(30 * DAY), annotations: { 'cert-manager.io/certificate-name': 'shop-tls', 'cert-manager.io/issuer-name': 'letsencrypt' } },
    type: 'kubernetes.io/tls',
    data: { 'tls.crt': btoa(EC_PEM) },
  });
  certificate('api-tls', { ...issued(-87 * DAY, 3 * DAY, -27 * DAY, 1) });
  certificate('store-tls', {
    conditions: [
      ready('False', 'DoesNotExist', 'Issuing certificate as Secret does not exist'),
      ready('True', 'DoesNotExist', 'Issuing certificate as Secret does not exist', 'Issuing'),
    ],
  });
  certificate('docs-tls', {
    failedIssuanceAttempts: 2,
    lastFailureTime: at(-30 * 60_000),
    conditions: [
      ready('False', 'DoesNotExist', 'Issuing certificate as Secret does not exist'),
      ready('False', 'Failed', 'The certificate request has failed to complete and will be retried: order is in "invalid" state', 'Issuing'),
    ],
  });

  // shop-tls's revision 2, issued.
  put(CertificateRequest, {
    metadata: {
      name: 'shop-tls-2',
      namespace: NS,
      ...made(30 * DAY),
      annotations: { 'cert-manager.io/certificate-name': 'shop-tls', 'cert-manager.io/certificate-revision': '2' },
      ownerReferences: owned(Certificate, 'shop-tls'),
    },
    spec: { issuerRef: acme, username: 'system:serviceaccount:cert-manager:cert-manager', usages: ['digital signature', 'key encipherment'] },
    status: {
      conditions: [
        ready('True', 'cert-manager.io', 'Certificate request has been approved by cert-manager.io', 'Approved'),
        ready('True', 'Issued', 'Certificate fetched from issuer successfully'),
      ],
    },
  });

  // store-tls's revision 1, as it goes: its request approved, its Order pending, its Challenge stuck on the self check.
  put(CertificateRequest, {
    metadata: {
      name: 'store-tls-1',
      namespace: NS,
      ...made(20 * 60_000),
      annotations: { 'cert-manager.io/certificate-name': 'store-tls', 'cert-manager.io/certificate-revision': '1' },
      ownerReferences: owned(Certificate, 'store-tls'),
    },
    spec: { issuerRef: acme, username: 'system:serviceaccount:cert-manager:cert-manager', usages: ['digital signature', 'key encipherment'] },
    status: {
      conditions: [
        ready('True', 'cert-manager.io', 'Certificate request has been approved by cert-manager.io', 'Approved'),
        ready('False', 'Pending', 'Waiting on certificate issuance from order shop/store-tls-1-1: "pending"'),
      ],
    },
  });
  put(Order, {
    metadata: { name: 'store-tls-1-1', namespace: NS, ...made(20 * 60_000), ownerReferences: owned(CertificateRequest, 'store-tls-1') },
    spec: { issuerRef: acme, dnsNames: ['store.shop.test'] },
    status: { state: 'pending' },
  });
  put(Challenge, {
    metadata: { name: 'store-tls-1-1-1', namespace: NS, ...made(20 * 60_000), ownerReferences: owned(Order, 'store-tls-1-1') },
    spec: { dnsName: 'store.shop.test', type: 'HTTP-01', issuerRef: acme, token: 'token-1', solver: { http01: { ingress: { ingressClassName: 'nginx' } } } },
    status: {
      presented: true,
      processing: true,
      state: 'pending',
      reason:
        "Waiting for HTTP-01 challenge propagation: failed to perform self check GET request 'http://store.shop.test/.well-known/acme-challenge/token-1': dial tcp: lookup store.shop.test on 10.43.0.10:53: no such host",
    },
  });

  // A request of another's issuer: cert-manager does not approve it.
  put(CertificateRequest, {
    metadata: { name: 'partner-1', namespace: NS, ...made(5 * 60_000) },
    spec: { issuerRef: { name: 'partner', kind: 'PartnerIssuer', group: 'issuers.example.com' }, username: 'alice', usages: ['digital signature', 'server auth'] },
  });

  // Ingresses: one serving shop-tls (a host no entry covers), one naming an issuer that is not there.
  const rule = (host: string) => ({ host, http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } }] } });
  put(Ingress, {
    metadata: { name: 'shop', namespace: NS, ...made(60 * DAY) },
    spec: { tls: [{ hosts: ['shop.example.com', 'www.shop.example.com'], secretName: 'shop-tls' }], rules: [rule('shop.example.com'), rule('admin.shop.example.com')] },
  });
  put(Ingress, {
    metadata: { name: 'legacy', namespace: NS, ...made(60 * DAY), annotations: { 'cert-manager.io/cluster-issuer': 'zerossl' } },
    spec: { tls: [{ hosts: ['legacy.shop.test'], secretName: 'legacy-tls' }], rules: [rule('legacy.shop.test')] },
  });
}
