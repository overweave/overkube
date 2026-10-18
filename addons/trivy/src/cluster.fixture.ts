import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { FakeCluster } from '@overkube/testkit';
import {
  ClusterComplianceReport,
  ClusterConfigAuditReport,
  ClusterInfraAssessmentReport,
  ClusterRbacAssessmentReport,
  ClusterSbomReport,
  ClusterVulnerabilityReport,
  ConfigAuditReport,
  ExposedSecretReport,
  InfraAssessmentReport,
  RbacAssessmentReport,
  SbomReport,
  VulnerabilityReport,
} from './kinds.ts';

/*
 * A cluster the Trivy addon's tests and stories draw: in shop, web — a
 * Deployment of two revisions, its current ReplicaSet's reports (an old
 * nginx on an alpine out of support; an init container's alpine; a
 * sidecar's busybox, nothing found), its old one's still kept (worse:
 * not shown), its config audit; api — its image changed, trivy-operator's
 * scan Job of it running; ghost — no report, no scan (its image not
 * there); a pod of web's. A ClusterRole that gives too much, its RBAC
 * assessment; a secret found in api's image, web's SBOM, a volume's config
 * audit, a node's infra assessment, a CIS benchmark's controls.
 */

export const TRIVY_KINDS = [
  VulnerabilityReport,
  ConfigAuditReport,
  ExposedSecretReport,
  SbomReport,
  RbacAssessmentReport,
  InfraAssessmentReport,
  ClusterVulnerabilityReport,
  ClusterConfigAuditReport,
  ClusterRbacAssessmentReport,
  ClusterInfraAssessmentReport,
  ClusterSbomReport,
  ClusterComplianceReport,
];

const { Namespace, Pod } = kinds.core.v1;
const { Deployment, ReplicaSet } = kinds.apps.v1;
const { Job } = kinds.batch.v1;
const { ClusterRole } = kinds.rbac.v1;

const NS = 'shop';
const HOUR = 3_600_000;

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Found = [id: string, severity: Severity, resource: string, installed: string, fixed: string, score: number, title: string];

const NGINX: Found[] = [
  ['CVE-2022-32207', 'CRITICAL', 'curl', '7.76.1-r0', '7.79.1-r2', 9.8, 'curl: Unpreserved file permissions'],
  ['CVE-2021-3711', 'CRITICAL', 'libssl1.1', '1.1.1k-r0', '1.1.1l-r0', 9.8, 'openssl: SM2 Decryption Buffer Overflow'],
  ['CVE-2021-3518', 'HIGH', 'libxml2', '2.9.10-r6', '2.9.10-r7', 8.8, 'libxml2: Use-after-free in xmlXIncludeDoProcess()'],
  ['CVE-2021-22922', 'MEDIUM', 'curl', '7.76.1-r0', '7.78.0-r0', 5.9, 'curl: Content not matched by hash'],
];
const ALPINE: Found[] = [['CVE-2022-37434', 'CRITICAL', 'zlib', '1.2.12-r0', '1.2.12-r2', 9.8, 'zlib: heap-based buffer over-read in inflate()']];

/** The cluster, its times from now. */
export function trivyCluster(c: FakeCluster, now = Date.now()) {
  const at = (ms: number) => new Date(now + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const put = (kind: KindInfo, object: Omit<KubeObject, 'apiVersion' | 'kind'> & Record<string, unknown>) =>
    c.add(kind, { apiVersion: kind.group ? `${kind.group}/${kind.version}` : kind.version, kind: kind.kind, ...object } as never);
  const owned = (kind: KindInfo, name: string) => [{ apiVersion: `${kind.group}/${kind.version}`, kind: kind.kind, name, uid: `${name}-uid`, controller: true }];
  const template = (containers: [string, string][], init: [string, string][] = []) => ({
    metadata: { labels: { app: 'x' } },
    spec: { initContainers: init.map(([name, image]) => ({ name, image })), containers: containers.map(([name, image]) => ({ name, image })) },
  });
  const deployment = (name: string, spec: ReturnType<typeof template>, sets: [hash: string, revision: number][]) => {
    put(Deployment, {
      metadata: { name, namespace: NS, uid: `${name}-uid`, creationTimestamp: at(-48 * HOUR) },
      spec: { replicas: 1, selector: {}, template: spec },
      status: { replicas: 1, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1, conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }] },
    });
    for (const [hash, revision] of sets)
      put(ReplicaSet, {
        metadata: {
          name: `${name}-${hash}`,
          namespace: NS,
          uid: `${name}-${hash}-uid`,
          annotations: { 'deployment.kubernetes.io/revision': String(revision) },
          ownerReferences: owned(Deployment, name),
          creationTimestamp: at(-revision * HOUR),
        },
        spec: { replicas: revision === Math.max(...sets.map(([, r]) => r)) ? 1 : 0, template: spec },
      });
  };
  const labels = (kind: string, name: string, container?: string) => ({
    'trivy-operator.resource.kind': kind,
    'trivy-operator.resource.name': name,
    'trivy-operator.resource.namespace': NS,
    ...(container ? { 'trivy-operator.container.name': container } : {}),
  });
  const count = (found: Found[], s: Severity) => found.filter(([, severity]) => severity === s).length;
  const vulnerabilities = (owner: string, container: string, [repository, tag]: [string, string], os: [string, string, boolean], found: Found[]) =>
    put(VulnerabilityReport, {
      metadata: { name: `replicaset-${owner}-${container}`, namespace: NS, labels: labels('ReplicaSet', owner, container), creationTimestamp: at(-HOUR) },
      report: {
        artifact: { repository, tag, digest: `sha256:${repository.replace(/\W/g, '')}${tag.replace(/\W/g, '')}` },
        registry: { server: 'index.docker.io' },
        os: { family: os[0], name: os[1], eosl: os[2] },
        scanner: { name: 'Trivy', vendor: 'Aqua Security', version: '0.75.0' },
        summary: { criticalCount: count(found, 'CRITICAL'), highCount: count(found, 'HIGH'), mediumCount: count(found, 'MEDIUM'), lowCount: count(found, 'LOW'), unknownCount: 0 },
        vulnerabilities: found.map(([vulnerabilityID, severity, resource, installedVersion, fixedVersion, score, title]) => ({
          vulnerabilityID,
          severity,
          resource,
          installedVersion,
          fixedVersion,
          score,
          title,
          primaryLink: `https://avd.aquasec.com/nvd/${vulnerabilityID.toLowerCase()}`,
        })),
        updateTimestamp: at(-HOUR),
      },
    });

  put(Namespace, { metadata: { name: NS } });
  put(Namespace, { metadata: { name: 'trivy-system' } });

  // web: its current ReplicaSet's images (nginx, an init container's alpine, a sidecar's busybox); its old one's nginx report, kept a while.
  const web = template(
    [
      ['nginx', 'nginx:1.19-alpine'],
      ['sidecar', 'busybox:1.37'],
    ],
    [['migrate', 'alpine:3.12']],
  );
  deployment('web', web, [
    ['5c6f8', 1],
    ['7d4b9', 2],
  ]);
  vulnerabilities('web-7d4b9', 'nginx', ['library/nginx', '1.19-alpine'], ['alpine', '3.13.5', true], NGINX);
  vulnerabilities('web-7d4b9', 'migrate', ['library/alpine', '3.12'], ['alpine', '3.12.12', true], ALPINE);
  vulnerabilities('web-7d4b9', 'sidecar', ['library/busybox', '1.37'], ['', '', false], []);
  vulnerabilities('web-5c6f8', 'nginx', ['library/nginx', '1.18-alpine'], ['alpine', '3.12.0', true], [...NGINX, ...NGINX.map(([id, ...rest]): Found => [`${id}-old`, ...rest])]);
  put(Pod, {
    metadata: { name: 'web-7d4b9-x2k8p', namespace: NS, ownerReferences: owned(ReplicaSet, 'web-7d4b9'), creationTimestamp: at(-HOUR) },
    spec: web.spec,
    status: { phase: 'Running' },
  });
  put(ConfigAuditReport, {
    metadata: { name: 'replicaset-web-7d4b9', namespace: NS, labels: labels('ReplicaSet', 'web-7d4b9'), creationTimestamp: at(-HOUR) },
    report: {
      scanner: { name: 'Trivy', version: '0.75.0' },
      summary: { criticalCount: 0, highCount: 1, mediumCount: 1, lowCount: 1 },
      checks: [
        {
          checkID: 'AVD-KSV-0014',
          title: 'Root file system is not read-only',
          severity: 'HIGH',
          messages: ["Container 'nginx' of ReplicaSet 'web-7d4b9' should set 'securityContext.readOnlyRootFilesystem' to true"],
          remediation: "Change 'containers[].securityContext.readOnlyRootFilesystem' to 'true'.",
          success: false,
        },
        {
          checkID: 'AVD-KSV-0014',
          title: 'Root file system is not read-only',
          severity: 'HIGH',
          messages: ["Container 'sidecar' of ReplicaSet 'web-7d4b9' should set 'securityContext.readOnlyRootFilesystem' to true"],
          success: false,
        },
        {
          checkID: 'AVD-KSV-0012',
          title: 'Runs as root user',
          severity: 'MEDIUM',
          messages: ["Container 'nginx' should set 'securityContext.runAsNonRoot' to true"],
          success: false,
        },
        { checkID: 'AVD-KSV-0018', title: 'Memory not limited', severity: 'LOW', messages: ["Container 'nginx' should set 'resources.limits.memory'"], success: false },
      ],
    },
  });

  // api: its image changed — its new ReplicaSet being scanned (trivy-operator's Job), no report yet.
  deployment('api', template([['api', 'registry.shop.test/api:2.1']]), [['6b978', 1]]);
  put(Job, {
    metadata: {
      name: 'scan-vulnerabilityreport-6d5f8',
      namespace: 'trivy-system',
      labels: { 'app.kubernetes.io/managed-by': 'trivy-operator', ...labels('ReplicaSet', 'api-6b978') },
      creationTimestamp: at(-60_000),
    },
    spec: { template: { spec: { containers: [{ name: 'api', image: 'mirror.gcr.io/aquasec/trivy:0.75.0' }] } } },
    status: { active: 1 },
  });

  // ghost: no report, no scan (its image not there: its scan failed, said in trivy-operator's log alone).
  deployment('ghost', template([['ghost', 'busybox:0.0.0-does-not-exist']]), [['69fc4', 1]]);

  // A ClusterRole that gives too much.
  put(ClusterRole, { metadata: { name: 'too-much' }, rules: [{ apiGroups: [''], resources: ['secrets'], verbs: ['*'] }] });
  put(ClusterRbacAssessmentReport, {
    metadata: { name: 'clusterrole-too-much', labels: { 'trivy-operator.resource.kind': 'ClusterRole', 'trivy-operator.resource.name': 'too-much' } },
    report: {
      scanner: { name: 'Trivy', version: '0.75.0' },
      summary: { criticalCount: 2, highCount: 0, mediumCount: 0, lowCount: 0 },
      checks: [
        {
          checkID: 'AVD-KSV-0041',
          title: 'Manage secrets',
          severity: 'CRITICAL',
          messages: ["ClusterRole 'too-much' shouldn't have access to manage resource 'secrets'"],
          remediation: "Remove resource 'secrets' from cluster role",
          success: false,
        },
        { checkID: 'AVD-KSV-0045', title: 'No wildcard verb roles', severity: 'CRITICAL', messages: ['Role permits wildcard verb on specific resources'], success: false },
      ],
    },
  });
  otherReports(c);
}

/** Reports of the other kinds: a secret found, an SBOM, a volume's config audit, a node's infra assessment, a benchmark's controls. */
function otherReports(c: FakeCluster) {
  const put = (k: KindInfo, object: Record<string, unknown>) => c.add(k, { apiVersion: 'aquasecurity.github.io/v1alpha1', kind: k.kind, ...object } as never);
  const labels = (k: string, name: string, namespace = '', container?: string) => ({
    'trivy-operator.resource.kind': k,
    'trivy-operator.resource.name': name,
    'trivy-operator.resource.namespace': namespace,
    ...(container ? { 'trivy-operator.container.name': container } : {}),
  });
  const scanner = { name: 'Trivy', vendor: 'Aqua Security', version: '0.75.0' };
  const creationTimestamp = new Date(Date.now() - 3_600_000).toISOString();
  put(ExposedSecretReport, {
    metadata: { name: 'replicaset-api-6b978-api', creationTimestamp, namespace: 'shop', labels: labels('ReplicaSet', 'api-6b978', 'shop', 'api') },
    report: {
      artifact: { repository: 'registry.shop.test/api', tag: '2.0' },
      scanner,
      summary: { criticalCount: 1, highCount: 1, mediumCount: 0, lowCount: 0 },
      secrets: [
        { ruleID: 'aws-access-key-id', category: 'AWS', severity: 'CRITICAL', title: 'AWS Access Key ID', target: '/app/.env', match: 'AWS_ACCESS_KEY_ID=********************' },
        {
          ruleID: 'private-key',
          category: 'AsymmetricPrivateKey',
          severity: 'HIGH',
          title: 'Asymmetric Private Key',
          target: '/etc/ssl/private/api.key',
          match: '-----BEGIN PRIVATE KEY-----*****',
        },
      ],
    },
  });
  put(SbomReport, {
    metadata: { name: 'replicaset-web-7d4b9-nginx', creationTimestamp, namespace: 'shop', labels: labels('ReplicaSet', 'web-7d4b9', 'shop', 'nginx') },
    report: {
      artifact: { repository: 'library/nginx', tag: '1.19-alpine' },
      scanner,
      summary: { componentsCount: 44, dependenciesCount: 44 },
      components: {
        bomFormat: 'CycloneDX',
        components: [
          { name: 'alpine', version: '3.13.5', type: 'operating-system' },
          { name: 'curl', version: '7.76.1-r0', type: 'library', licenses: [{ license: { name: 'MIT' } }], purl: 'pkg:apk/alpine/curl@7.76.1-r0' },
          { name: 'libssl1.1', version: '1.1.1k-r0', type: 'library', licenses: [{ license: { name: 'OpenSSL' } }], purl: 'pkg:apk/alpine/libssl1.1@1.1.1k-r0' },
          { name: 'nginx', version: '1.19.10-r1', type: 'library', licenses: [{ license: { id: 'BSD-2-Clause' } }], purl: 'pkg:apk/alpine/nginx@1.19.10-r1' },
          { name: 'zlib', version: '1.2.11-r3', type: 'library', licenses: [{ license: { id: 'Zlib' } }], purl: 'pkg:apk/alpine/zlib@1.2.11-r3' },
        ],
      },
    },
  });
  put(ClusterConfigAuditReport, {
    metadata: { name: 'persistentvolume-pvc-7730a691', creationTimestamp, labels: labels('PersistentVolume', 'pvc-7730a691') },
    report: { scanner, summary: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 }, checks: [] },
  });
  put(ClusterInfraAssessmentReport, {
    metadata: { name: 'node-kube', creationTimestamp, labels: labels('Node', 'kube') },
    report: {
      scanner,
      summary: { criticalCount: 0, highCount: 1, mediumCount: 0, lowCount: 0 },
      checks: [
        {
          checkID: 'AVD-KCV-0081',
          title: 'Ensure that the --anonymous-auth argument is set to false',
          severity: 'HIGH',
          messages: ["Kubelet on node 'kube' allows anonymous requests"],
          remediation: 'Set --anonymous-auth=false on the kubelet',
          success: false,
        },
      ],
    },
  });
  put(ClusterComplianceReport, {
    metadata: { name: 'k8s-cis-1.23', creationTimestamp },
    spec: { compliance: { id: 'k8s-cis-1.23', title: 'CIS Kubernetes Benchmarks v1.23', version: '1.0' } },
    status: {
      summary: { failCount: 2, passCount: 3 },
      summaryReport: {
        controlCheck: [
          { id: '1.2.1', name: 'Ensure that the --anonymous-auth argument is set to false', severity: 'MEDIUM', totalFail: 1 },
          { id: '1.2.6', name: 'Ensure that the --kubelet-certificate-authority argument is set', severity: 'HIGH', totalFail: 0 },
          { id: '5.1.1', name: 'Ensure that the cluster-admin role is only used where required', severity: 'HIGH', totalFail: 1 },
          { id: '5.1.3', name: 'Minimize wildcard use in Roles and ClusterRoles', severity: 'HIGH', totalFail: 0 },
          { id: '5.2.2', name: 'Minimize the admission of privileged containers', severity: 'HIGH', totalFail: 0 },
        ],
      },
    },
  });
}
