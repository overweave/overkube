import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { CERT_MANAGER_KINDS, certManagerCluster } from './cluster.fixture.ts';
import certManager from './index.tsx';

/*
 * The cert-manager addon on the page, over a cluster in memory: its kinds'
 * tables, a Certificate's view (ready, issuing — where it stops —, failed),
 * a request waiting for approval, an issuer's, an Ingress's TLS, the
 * start's panel of the soonest ends.
 */

export default { title: 'cert-manager/cert-manager addon', parameters: { controls: { disable: true } } };

const Page = ({ path }: { path: string }) => <KubeStory addons={[core, certManager]} kinds={CERT_MANAGER_KINDS} path={path} cluster={(c) => certManagerCluster(c)} />;

const open = (plural: string, at: string) => `/k/${plural}?open=${plural}/${at}`;
const CERTIFICATES = 'certificates.v1.cert-manager.io';

/** The Certificates' table: each one's state, its Secret, when it ends. */
export const Certificates = () => <Page path={`/k/${CERTIFICATES}`} />;

/** A Certificate ready: its lifetime, its revision, its spec against its Secret, Renew. */
export const Ready = () => <Page path={open(CERTIFICATES, 'shop/shop-tls')} />;

/** A Certificate issuing: its request, its Order, its Challenge stuck on the self check — why. */
export const Issuing = () => <Page path={open(CERTIFICATES, 'shop/store-tls')} />;

/** A Certificate whose issuance failed: its attempts, when cert-manager tries again. */
export const Failed = () => <Page path={open(CERTIFICATES, 'shop/docs-tls')} />;

/** A request of another's issuer, waiting for approval: Approve, Deny. */
export const Request = () => <Page path={open('certificaterequests.v1.cert-manager.io', 'shop/partner-1')} />;

/** An ACME ClusterIssuer: its server, its solvers, what it issues. */
export const AcmeIssuer = () => <Page path={open('clusterissuers.v1.cert-manager.io', 'letsencrypt')} />;

/** A CA Issuer: its own end, nothing renewing it. */
export const CaIssuer = () => <Page path={open('issuers.v1.cert-manager.io', 'shop/partner-ca')} />;

/** An Ingress's TLS: its Certificate's lifetime, a host no entry covers. */
export const IngressTls = () => <Page path={open('ingresses.v1.networking.k8s.io', 'shop/shop')} />;

/** The start: its certificates, the soonest end first. */
export const Overview = () => <Page path="/" />;
