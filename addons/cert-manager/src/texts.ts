import { t } from '@overkube/sdk';

/*
 * What the cert-manager addon says, by key — its English beside each
 * (Messages <locale>:cert-manager). Its terms are cert-manager's and
 * Kubernetes' own, as kubectl describe and cmctl status say them; states
 * are cert-manager's words, as they are.
 */
export const T = {
  columns: {
    ready: t('cert-manager.column.ready', 'Ready'),
    state: t('cert-manager.column.state', 'State'),
    expires: t('cert-manager.column.expires', 'Expires'),
    type: t('cert-manager.column.type', 'Type'),
    secret: t('cert-manager.column.secret', 'Secret'),
    issuer: t('cert-manager.column.issuer', 'Issuer'),
    status: t('cert-manager.column.status', 'Status'),
    approved: t('cert-manager.column.approved', 'Approved'),
    denied: t('cert-manager.column.denied', 'Denied'),
    requester: t('cert-manager.column.requester', 'Requester'),
    domain: t('cert-manager.column.domain', 'Domain'),
    reason: t('cert-manager.column.reason', 'Reason'),
  },
  /** Days, as a cell and a lifetime say them. */
  days: {
    left: t('cert-manager.days.left', '{days}d'),
    in: t('cert-manager.days.in', 'in {days}d'),
    ago: t('cert-manager.days.ago', '{days}d ago'),
    expired: t('cert-manager.days.expired', 'expired {days}d ago'),
    expiredToday: t('cert-manager.days.expired-today', 'expired'),
    today: t('cert-manager.days.today', 'today'),
  },
  times: {
    notBefore: t('cert-manager.time.not-before', 'Not Before'),
    renewalTime: t('cert-manager.time.renewal-time', 'Renewal Time'),
    notAfter: t('cert-manager.time.not-after', 'Not After'),
    in: t('cert-manager.time.in', 'in {duration}'),
  },
  certificate: {
    validity: t('cert-manager.certificate.validity', 'Validity'),
    revision: t('cert-manager.certificate.revision', 'Revision {revision}'),
    secret: t('cert-manager.certificate.secret', 'Secret {name}'),
    spec: t('cert-manager.certificate.spec', 'Spec'),
    holds: t('cert-manager.certificate.holds', 'Secret'),
    dnsNames: t('cert-manager.certificate.dns-names', 'DNS Names'),
    ipAddresses: t('cert-manager.certificate.ip-addresses', 'IP Addresses'),
    emailAddresses: t('cert-manager.certificate.email-addresses', 'Email Addresses'),
    uris: t('cert-manager.certificate.uris', 'URIs'),
    commonName: t('cert-manager.certificate.common-name', 'Common Name'),
    privateKey: t('cert-manager.certificate.private-key', 'Private Key'),
    duration: t('cert-manager.certificate.duration', 'Duration'),
    failed: t('cert-manager.certificate.failed', 'Failed Issuance Attempts: {count}'),
    lastFailure: t('cert-manager.certificate.last-failure', 'Last Failure Time'),
    nextAttempt: t('cert-manager.certificate.next-attempt', 'Next Attempt'),
  },
  related: {
    issuer: t('cert-manager.related.issuer', 'Issuer'),
    secret: t('cert-manager.related.secret', 'Secret'),
    usedBy: t('cert-manager.related.used-by', 'Used By'),
    managedBy: t('cert-manager.related.managed-by', 'Managed By'),
    caSecret: t('cert-manager.related.ca-secret', 'CA Secret'),
    privateKeySecret: t('cert-manager.related.private-key-secret', 'Private Key Secret'),
    tokenSecret: t('cert-manager.related.token-secret', 'Token Secret'),
  },
  request: {
    request: t('cert-manager.request.request', 'Request'),
    subject: t('cert-manager.request.subject', 'Subject'),
    usages: t('cert-manager.request.usages', 'Usages'),
    notApproved: t('cert-manager.request.not-approved', 'Not approved'),
    approvedBy: t(
      'cert-manager.request.approved-by',
      'cert-manager approves requests for its own issuers only. A request for {kind} ({group}) is approved by that issuer’s approver, approver-policy (a CertificateRequestPolicy), or cmctl approve.',
    ),
  },
  challenge: {
    challenge: t('cert-manager.challenge.challenge', 'Challenge'),
    solver: t('cert-manager.challenge.solver', 'Solver'),
    type: t('cert-manager.challenge.type', 'Type'),
    presented: t('cert-manager.challenge.presented', 'Presented'),
    processing: t('cert-manager.challenge.processing', 'Processing'),
    yes: t('cert-manager.challenge.yes', 'true'),
    no: t('cert-manager.challenge.no', 'false'),
    /** What a self check's failure usually means (none said: its reason alone). */
    hints: {
      noHost: t('cert-manager.challenge.hint.no-host', 'Its DNS name does not resolve from the cluster: the self check cannot reach it.'),
      wrongStatus: t(
        'cert-manager.challenge.hint.wrong-status',
        'The self check reaches a server that is not the solver: the Ingress does not route /.well-known/acme-challenge/ to it.',
      ),
      refused: t('cert-manager.challenge.hint.refused', 'Nothing answers where it is checked.'),
    },
  },
  issuer: {
    ca: t('cert-manager.issuer.ca', 'CA'),
    unmanaged: t('cert-manager.issuer.unmanaged', 'No Certificate manages Secret {name}'),
    notFound: t('cert-manager.issuer.not-found', 'not found'),
    unmanagedText: t('cert-manager.issuer.unmanaged-text', 'No Certificate renews this CA: what it signed is not trusted after its Not After.'),
    server: t('cert-manager.issuer.server', 'Server'),
    email: t('cert-manager.issuer.email', 'Email'),
    account: t('cert-manager.issuer.account', 'Account URI'),
    solvers: t('cert-manager.issuer.solvers', 'Solvers'),
    http01: t('cert-manager.issuer.http01', 'HTTP-01 · Ingress class {class}'),
    http01Gateway: t('cert-manager.issuer.http01-gateway', 'HTTP-01 · Gateway HTTPRoute'),
    dns01: t('cert-manager.issuer.dns01', 'DNS-01 · {provider}'),
    anyName: t('cert-manager.issuer.any-name', 'any DNS name'),
    certificates: t('cert-manager.issuer.certificates', 'Certificates'),
    more: t('cert-manager.issuer.more', '{count} more'),
  },
  ingress: {
    tls: t('cert-manager.ingress.tls', 'TLS'),
    anyHost: t('cert-manager.ingress.any-host', 'any host'),
    notCovered: t('cert-manager.ingress.not-covered', 'Not covered by TLS'),
    noSecret: t('cert-manager.ingress.no-secret', 'No Certificate for Secret {name}'),
    noIssuer: t('cert-manager.ingress.no-issuer', '{annotation}: no {kind} {name}'),
    noIssuerText: t('cert-manager.ingress.no-issuer-text', 'cert-manager issues no certificate for this Ingress while the issuer it names is not there.'),
  },
  overview: {
    title: t('cert-manager.overview.title', 'Certificates'),
    now: t('cert-manager.overview.now', 'now'),
  },
  actions: {
    renew: t('cert-manager.action.renew', 'Renew'),
    approve: t('cert-manager.action.approve', 'Approve'),
    deny: t('cert-manager.action.deny', 'Deny'),
  },
};
