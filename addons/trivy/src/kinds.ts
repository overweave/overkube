import { type KindInfo, kinds } from '@overkube/kube-types';
import type { FieldSpec } from '@overkube/sdk';

/*
 * trivy-operator's reports (aquasecurity.github.io/v1alpha1) and the
 * fields the addon asks by. A report is of a workload by its labels
 * (trivy-operator.resource.kind, .name; a container's: .container.name):
 * its key, Kind/name — a ReplicaSet's report its Deployment's too (its name
 * but its hash), so a Deployment finds the reports of its ReplicaSets. A
 * workload's own keys: itself; a pod's, its controller too (a Job's, its
 * CronJob's) — so its fields joined of the reports of its keys: the worst
 * severity found (5 critical … 1 unknown, 0 none; no report: none), the
 * most critical and high of one image. A scan going on: trivy-operator's
 * Job, labelled what it scans.
 */

const kind = (name: string, plural: string, namespaced: boolean): KindInfo => ({
  id: `aquasecurity.github.io/v1alpha1/${name}`,
  group: 'aquasecurity.github.io',
  version: 'v1alpha1',
  kind: name,
  plural,
  singular: name.toLowerCase(),
  namespaced,
  verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
});

export const VulnerabilityReport = kind('VulnerabilityReport', 'vulnerabilityreports', true);
export const ConfigAuditReport = kind('ConfigAuditReport', 'configauditreports', true);
export const ExposedSecretReport = kind('ExposedSecretReport', 'exposedsecretreports', true);
export const RbacAssessmentReport = kind('RbacAssessmentReport', 'rbacassessmentreports', true);
export const ClusterRbacAssessmentReport = kind('ClusterRbacAssessmentReport', 'clusterrbacassessmentreports', false);
export const ClusterVulnerabilityReport = kind('ClusterVulnerabilityReport', 'clustervulnerabilityreports', false);
export const ClusterConfigAuditReport = kind('ClusterConfigAuditReport', 'clusterconfigauditreports', false);
export const ClusterInfraAssessmentReport = kind('ClusterInfraAssessmentReport', 'clusterinfraassessmentreports', false);
export const InfraAssessmentReport = kind('InfraAssessmentReport', 'infraassessmentreports', true);
export const SbomReport = kind('SbomReport', 'sbomreports', true);
export const ClusterSbomReport = kind('ClusterSbomReport', 'clustersbomreports', false);
export const ClusterComplianceReport = kind('ClusterComplianceReport', 'clustercompliancereports', false);

/** Those of findings by severity (their summaries' counts). */
export const SEVERE_REPORTS = [
  VulnerabilityReport,
  ConfigAuditReport,
  ExposedSecretReport,
  RbacAssessmentReport,
  InfraAssessmentReport,
  ClusterVulnerabilityReport,
  ClusterConfigAuditReport,
  ClusterRbacAssessmentReport,
  ClusterInfraAssessmentReport,
];
/** Those of a resource (its labels say which): all but compliance's. */
export const OF_RESOURCES = [...SEVERE_REPORTS, SbomReport, ClusterSbomReport];

/** Their refs, as queries name them. */
export const ref = (k: KindInfo) => `${k.plural}.${k.version}.${k.group}`;
export const REF = {
  vulnerabilities: ref(VulnerabilityReport),
  configAudits: ref(ConfigAuditReport),
  rbac: ref(RbacAssessmentReport),
  clusterRbac: ref(ClusterRbacAssessmentReport),
  jobs: 'jobs.v1.batch',
} as const;

const { Pod } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet, ReplicaSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;

/** The workloads scanned: their kinds, each its ref. */
export const WORKLOADS = [Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob] as const;
export const refOf = (k: KindInfo) => (k.group ? `${k.plural}.${k.version}.${k.group}` : `${k.plural}.${k.version}`);

const V = REF.vulnerabilities;
export const F = {
  /** A report's keys: Kind/name (a ReplicaSet's, its Deployment's too). */
  of: 'trivy.reports.of',
  /** A vulnerability report's worst severity (5 critical … 1 unknown, 0 none). */
  severity: `${V}.severity`,
  critical: `${V}.critical`,
  high: `${V}.high`,
  medium: `${V}.medium`,
  low: `${V}.low`,
  unknown: `${V}.unknown`,
  repository: `${V}.repository`,
  tag: `${V}.tag`,
  digest: `${V}.digest`,
  /** Its OS, as Trivy says it (alpine; its version 3.13.5), and whether it is out of support. */
  os: `${V}.os`,
  osVersion: `${V}.os-version`,
  eosl: `${V}.eosl`,
  container: 'trivy.reports.container',
  /** A scan Job's keys: namespace/Kind/name (a ReplicaSet's, its Deployment's too); not trivy-operator's: none. */
  scanOf: 'trivy.jobs.scan-of',
  /** A workload's keys; its fields, of its reports. */
  key: (k: KindInfo) => `trivy.${k.plural}.key`,
  worst: (k: KindInfo) => `${refOf(k)}.vulnerabilities`,
  mostCritical: (k: KindInfo) => `${refOf(k)}.critical-vulnerabilities`,
  mostHigh: (k: KindInfo) => `${refOf(k)}.high-vulnerabilities`,
} as const;

const label = (name: string) => `self.?metadata.?labels[?"trivy-operator.${name}"].orValue("")`;
/** A name but its last part (a ReplicaSet's hash, a CronJob's Job's time): its owner's. */
const owner = (name: string) => `${name}.substring(0, ${name}.lastIndexOf("-"))`;
/** Kind/name, a ReplicaSet's its Deployment's too — of a report's labels, or a scan Job's (its namespace before). */
const keysOf = (prefix: string) =>
  `cel.bind(k, ${label('resource.kind')}, cel.bind(n, ${label('resource.name')}, k == "" ? [] : [${prefix}k + "/" + n]
    + (k == "ReplicaSet" && n.lastIndexOf("-") > 0 ? [${prefix}"Deployment/" + ${owner('n')}] : [])))`;
const summary = (name: string) => `self.?report.?summary.?${name}Count.orValue(0)`;

const vulns = [V, ref(ClusterVulnerabilityReport)];

export const FIELDS: Record<string, FieldSpec> = {
  [F.of]: { kinds: OF_RESOURCES.map(ref), type: 'string', many: true, value: { cel: keysOf('') } },
  [F.severity]: {
    kinds: vulns,
    type: 'number',
    value: { cel: `${summary('critical')} > 0 ? 5 : ${summary('high')} > 0 ? 4 : ${summary('medium')} > 0 ? 3 : ${summary('low')} > 0 ? 2 : ${summary('unknown')} > 0 ? 1 : 0` },
  },
  ...Object.fromEntries(
    (['critical', 'high', 'medium', 'low', 'unknown'] as const).map((s) => [F[s], { kinds: vulns, type: 'number', value: `.report.summary.${s}Count` } satisfies FieldSpec]),
  ),
  [F.repository]: { kinds: vulns, type: 'string', value: '.report.artifact.repository' },
  [F.tag]: { kinds: vulns, type: 'string', value: '.report.artifact.tag' },
  [F.digest]: { kinds: vulns, type: 'string', value: '.report.artifact.digest' },
  [F.os]: { kinds: vulns, type: 'string', value: '.report.os.family' },
  [F.osVersion]: { kinds: vulns, type: 'string', value: '.report.os.name' },
  [F.eosl]: { kinds: vulns, type: 'bool', value: '.report.os.eosl' },
  [F.container]: { kinds: OF_RESOURCES.map(ref), type: 'string', value: { cel: label('container.name') } },
  [F.scanOf]: {
    kinds: [REF.jobs],
    type: 'string',
    many: true,
    value: {
      cel: `self.?metadata.?labels[?"app.kubernetes.io/managed-by"].orValue("") != "trivy-operator" ? [] : cel.bind(ns, ${label('resource.namespace')}, ${keysOf('ns + "/" + ')})`,
    },
  },
};

/** A workload's keys: itself; a pod's controller too (a Job's, its CronJob's). */
const KEYS: [KindInfo, string][] = WORKLOADS.map((k) => [
  k,
  k === Pod
    ? `["Pod/" + self.metadata.name] + self.?metadata.?ownerReferences.orValue([]).filter(o, o.?controller.orValue(false)).map(o, o.kind + "/" + o.name)
      + self.?metadata.?ownerReferences.orValue([]).filter(o, o.?controller.orValue(false) && o.kind == "Job" && o.name.lastIndexOf("-") > 0).map(o, "CronJob/" + ${owner('o.name')})`
    : `["${k.kind}/" + self.metadata.name]`,
]);

for (const [k, cel] of KEYS) {
  const joined = (field: string) => ({ from: V, field, by: F.key(k), to: F.of, reduce: 'max' as const });
  FIELDS[F.key(k)] = { kinds: [refOf(k)], type: 'string', many: true, value: { cel } };
  FIELDS[F.worst(k)] = { kinds: [refOf(k)], type: 'number', value: joined(F.severity) };
  FIELDS[F.mostCritical(k)] = { kinds: [refOf(k)], type: 'number', value: joined(F.critical) };
  FIELDS[F.mostHigh(k)] = { kinds: [refOf(k)], type: 'number', value: joined(F.high) };
}
