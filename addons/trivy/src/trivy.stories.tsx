import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { TRIVY_KINDS, trivyCluster } from './cluster.fixture.ts';
import trivy from './index.tsx';

/*
 * The Trivy addon on the page, over a cluster in memory: a workload's
 * Overview (its containers' vulnerabilities, its config audit), its
 * Vulnerabilities tab (an image a card), one being scanned, one not
 * scanned; a ClusterRole's RBAC assessment; the Deployments' table with
 * its column turned on; the Images page, an image opened; the start's panel;
 * the reports' tables, each kind's opened.
 */

export default { title: 'trivy/Trivy addon', parameters: { controls: { disable: true } } };

const Page = ({ path, column = false }: { path: string; column?: boolean }) => (
  <KubeStory
    addons={[core, trivy]}
    kinds={TRIVY_KINDS}
    path={path}
    cluster={(c) => trivyCluster(c)}
    {...(column ? { user: (u) => void u.patch('TableView', 'apps/v1/Deployment', { hidden: { 'trivy.deployments.vulnerabilities': false } }) } : {})}
  />
);

const DEPLOYMENTS = '/k/deployments.v1.apps';
const open = (name: string, tab?: string) => `${DEPLOYMENTS}?open=deployments.v1.apps/shop/${name}${tab ? `&open-tab=${tab}` : ''}`;

/** A workload's Overview: a row a container (its image, its OS out of support), a column a severity; its config audit. */
export const Overview = () => <Page path={open('web')} />;

/** Its Vulnerabilities tab: an image a card, the worst first, filtered by severity; nothing found, one line. */
export const Vulnerabilities = () => <Page path={open('web', 'trivy.vulnerabilities')} />;

/** Its image changed: being scanned (trivy-operator's Job), its rows to come. */
export const Scanning = () => <Page path={open('api', 'trivy.vulnerabilities')} />;

/** No report, no scan: not scanned (why there may be none, in its tip). */
export const NotScanned = () => <Page path={open('ghost')} />;

/** A ClusterRole's RBAC assessment: its failed checks, each opened. */
export const RbacAssessment = () => <Page path="/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/too-much" />;

/** The Deployments' table, Vulnerabilities turned on: the worst found, being scanned, no report. */
export const Table = () => <Page path={DEPLOYMENTS} column />;

/** The Images page: each image once, the most vulnerable first; filtered, sorted. */
export const Images = () => <Page path="/images" />;

const reports = (plural: string, name?: string) => `/k/${plural}.v1alpha1.aquasecurity.github.io${name ? `?open=${plural}.v1alpha1.aquasecurity.github.io/${name}` : ''}`;

/** The vulnerability reports' table: what each is of, its worst severity, its counts. */
export const VulnerabilityReports = () => <Page path={reports('vulnerabilityreports')} />;

/** A vulnerability report opened: each vulnerability, filtered by severity. */
export const VulnerabilityReportView = () => <Page path={reports('vulnerabilityreports', 'shop/replicaset-web-7d4b9-nginx')} />;

/** An exposed secret report opened: each secret, where, masked as Trivy masks it. */
export const ExposedSecretReportView = () => <Page path={reports('exposedsecretreports', 'shop/replicaset-api-6b978-api')} />;

/** An SBOM opened: its components. */
export const SbomReportView = () => <Page path={reports('sbomreports', 'shop/replicaset-web-7d4b9-nginx')} />;

/** A node's infra assessment opened: its failed checks. */
export const InfraAssessmentReportView = () => <Page path={reports('clusterinfraassessmentreports', 'node-kube')} />;

/** A compliance report opened: its benchmark's controls, passed or failed. */
export const ComplianceReportView = () => <Page path={reports('clustercompliancereports', 'k8s-cis-1.23')} />;

/** The start: the scans going on, the totals, the most vulnerable workloads. */
export const Start = () => <Page path="/" />;
