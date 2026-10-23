import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { ListResult } from '@overkube/query';
import { action, type Cluster, type Ctx } from '@overkube/sdk';
import { addColumns } from './columns.tsx';
import { addImages } from './images.tsx';
import {
  ClusterComplianceReport,
  ClusterConfigAuditReport,
  ClusterInfraAssessmentReport,
  ClusterRbacAssessmentReport,
  ClusterSbomReport,
  ClusterVulnerabilityReport,
  ConfigAuditReport,
  ExposedSecretReport,
  F,
  FIELDS,
  InfraAssessmentReport,
  RbacAssessmentReport,
  REF,
  SbomReport,
  VulnerabilityReport,
  WORKLOADS,
} from './kinds.ts';
import { addOverview } from './overview.tsx';
import { ownKeys } from './reports.tsx';
import { addSections } from './sections.tsx';
import { addTab } from './tab.tsx';
import { T } from './texts.ts';
import { addReportViews } from './views.tsx';

/** Its kinds under Security, each its icon, in this order: those of workloads, of the cluster, then what is asked of it (compliance). */
const VIEWS = [
  [VulnerabilityReport, 'shield'],
  [ConfigAuditReport, 'file-text'],
  [ExposedSecretReport, 'key'],
  [SbomReport, 'packages'],
  [RbacAssessmentReport, 'shield'],
  [InfraAssessmentReport, 'server'],
  [ClusterVulnerabilityReport, 'shield'],
  [ClusterConfigAuditReport, 'file-text'],
  [ClusterRbacAssessmentReport, 'shield'],
  [ClusterInfraAssessmentReport, 'server'],
  [ClusterSbomReport, 'packages'],
  [ClusterComplianceReport, 'check'],
] as const;

/** A live answer once it is one (not on its way). */
const settled = <T extends { state: string }>(live: { value: T; subscribe(fn: (v: T) => void): () => void }) =>
  new Promise<T>((resolve) => {
    let off: (() => void) | undefined;
    let done = false;
    off = live.subscribe((v) => {
      if (done || v.state === 'loading') return;
      done = true;
      resolve(v);
      off?.();
    });
    if (done) off();
  });

/** Its vulnerability reports deleted (each of its keys': a Deployment's, all its ReplicaSets'): trivy-operator scans it again. */
async function rescan(cluster: Cluster, kind: KindInfo, o: KubeObject) {
  const found = await settled<ListResult<KubeObject>>(
    cluster.source.list<KubeObject>({
      kind: REF.vulnerabilities,
      scope: { namespaces: [o.metadata?.namespace ?? ''] },
      where: { field: F.of, op: 'in', values: ownKeys(kind, o) },
      page: { limit: 100 },
    }),
  );
  if (found.error) throw new Error(found.error.message);
  await Promise.all(found.items.flatMap((i) => (i.object ? [cluster.remove(VulnerabilityReport, i.object)] : [])));
}

/** Its definitions (its own chunk: loaded once it is turned on). */
export default function setup({ contributor: c, cluster }: Ctx) {
  const fallback = { fallback: true };
  for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
  c.add('Messages', 'en:trivy', { messages: {} }, fallback);
  c.add('Category', 'security', { title: T.category, icon: 'shield', order: 35 }, fallback);
  for (const [i, [kind, icon]] of VIEWS.entries()) c.add('KindView', kind.id, { title: `${kind.kind}s`, category: 'security', icon, order: 100 + i * 10 }, fallback);
  addColumns(c);
  addSections(c);
  addTab(c);
  addReportViews(c);
  addOverview(c);
  addImages(c);
  for (const kind of WORKLOADS)
    c.add(
      'Action',
      `trivy.${kind.plural}.rescan`,
      action({
        kinds: [kind],
        title: T.actions.rescan,
        icon: 'refresh',
        needs: [{ verb: 'delete', group: 'aquasecurity.github.io', resource: 'vulnerabilityreports' }],
        run: (o) => rescan(cluster, kind, o),
      }),
    );
}
