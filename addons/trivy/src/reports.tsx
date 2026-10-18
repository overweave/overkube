import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { useList, useSay } from '@overkube/sdk/preact';
import { SEVERITIES, type Severity, type SeverityCounts, SeverityStatus, type SeverityWords, Status, worstOf } from '@overkube/uikit';
import { useMemo } from 'preact/hooks';
import { F, REF } from './kinds.ts';
import { T } from './texts.ts';

/*
 * A workload's reports as its views have them: the keys it is reported by
 * — a Deployment's, its current ReplicaSet's (its newest revision: not the
 * old ones' reports, kept a while); a pod's, the first of its own, its
 * controller's, its CronJob's that has any — its vulnerability reports
 * and config audits of them, whether trivy-operator is scanning it (a scan
 * Job of it), and a line a container (its pod template's, init ones said
 * so): its image, its report.
 */

/** A vulnerability as Trivy says it. */
export interface Vulnerability {
  vulnerabilityID: string;
  severity: string;
  resource?: string;
  installedVersion?: string;
  fixedVersion?: string;
  score?: number;
  title?: string;
  primaryLink?: string;
}

type Summary = Partial<Record<`${Severity}Count`, number>>;

export interface VulnerabilityReportObject extends KubeObject {
  report?: {
    artifact?: { repository?: string; tag?: string; digest?: string };
    registry?: { server?: string };
    os?: { family?: string; name?: string; eosl?: boolean };
    scanner?: { name?: string; version?: string };
    summary?: Summary;
    vulnerabilities?: Vulnerability[];
    updateTimestamp?: string;
  };
}

/** A check as trivy-operator says it (a report lists the failed ones). */
export interface Check {
  checkID: string;
  title?: string;
  severity: string;
  category?: string;
  description?: string;
  messages?: string[];
  remediation?: string;
  success?: boolean;
}

export interface AuditReportObject extends KubeObject {
  report?: { summary?: Summary; checks?: Check[]; scanner?: { name?: string; version?: string }; updateTimestamp?: string };
}

/** Trivy's severity as the kit's (one it does not know: unknown). */
export const severityOf = (said: string | undefined): Severity => {
  const s = said?.toLowerCase() as Severity | undefined;
  return s && SEVERITIES.includes(s) ? s : 'unknown';
};

/** An image as a report names it (repository:tag), else as its container asks for it. */
export const imageOf = (report: VulnerabilityReportObject | undefined, asked = '') => {
  const a = report?.report?.artifact;
  return a?.repository ? `${a.repository}${a.tag ? `:${a.tag}` : ''}` : asked;
};

/** A summary's counts. */
export const countsOf = (summary: Summary | undefined): SeverityCounts => Object.fromEntries(SEVERITIES.map((s) => [s, summary?.[`${s}Count`] ?? 0])) as Record<Severity, number>;

export const NONE: SeverityCounts = countsOf(undefined);

/** Counts added up. */
export const added = (all: readonly SeverityCounts[]): SeverityCounts =>
  Object.fromEntries(SEVERITIES.map((s) => [s, all.reduce((n, c) => n + c[s], 0)])) as Record<Severity, number>;

/** The severities' words, as the user's language says them. */
export function useWords(): SeverityWords {
  const say = useSay();
  return useMemo(() => Object.fromEntries(SEVERITIES.map((s) => [s, say(T.severities[s])])) as Record<Severity, string>, [say]);
}

/** A report's keys, of its labels (as its field works them out): Kind/name, a ReplicaSet's its Deployment's too. */
export function reportKeys(o: KubeObject): string[] {
  const labels = o.metadata?.labels ?? {};
  const kind = labels['trivy-operator.resource.kind'] ?? '';
  const name = labels['trivy-operator.resource.name'] ?? '';
  if (!kind) return [];
  const cut = name.lastIndexOf('-');
  return [`${kind}/${name}`, ...(kind === 'ReplicaSet' && cut > 0 ? [`Deployment/${name.slice(0, cut)}`] : [])];
}

const { Pod } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;
const { CronJob } = kinds.batch.v1;

/** A workload's own keys, the most its own first (as its field works them out). */
export function ownKeys(kind: KindInfo, o: KubeObject): string[] {
  const name = o.metadata?.name ?? '';
  if (kind.id !== Pod.id) return [`${kind.kind}/${name}`];
  const controllers = (o.metadata?.ownerReferences ?? []).filter((r) => r.controller);
  return [
    `Pod/${name}`,
    ...controllers.map((r) => `${r.kind}/${r.name}`),
    ...controllers.filter((r) => r.kind === 'Job' && r.name.lastIndexOf('-') > 0).map((r) => `CronJob/${r.name.slice(0, r.name.lastIndexOf('-'))}`),
  ];
}

type Spec = { containers?: { name: string; image?: string }[]; initContainers?: { name: string; image?: string }[] };
type Workload = KubeObject & { spec?: Spec & { template?: { spec?: Spec }; jobTemplate?: { spec?: { template?: { spec?: Spec } } } } };

/** A container of its pods: its name, its image, whether it is an init one. */
export interface Container {
  name: string;
  image: string;
  init: boolean;
}

/** Its pods' containers, init ones first (a pod's own; a workload's template's; a CronJob's Job's). */
export function containersOf(kind: KindInfo, o: KubeObject): Container[] {
  const w = o as Workload;
  const spec = kind.id === Pod.id ? w.spec : kind.id === CronJob.id ? w.spec?.jobTemplate?.spec?.template?.spec : w.spec?.template?.spec;
  const of = (list: Spec['containers'], init: boolean) => (list ?? []).map((c) => ({ name: c.name, image: c.image ?? '', init }));
  return [...of(spec?.initContainers, true), ...of(spec?.containers, false)];
}

/** A Deployment's current ReplicaSet (its newest revision's) — none yet: null; its ReplicaSets on their way: loading; another kind's: undefined. */
function useCurrentReplicaSet(kind: KindInfo, o: KubeObject): string | null | 'loading' | undefined {
  const deployment = kind.id === Deployment.id;
  const sets = useList<KubeObject>(
    deployment
      ? {
          kind: 'replicasets.v1.apps',
          scope: { namespaces: [o.metadata?.namespace ?? ''] },
          where: { field: '.metadata.ownerReferences[*].uid', op: 'eq', value: o.metadata?.uid ?? '' },
          page: { limit: 50 },
        }
      : undefined,
  );
  if (!deployment) return undefined;
  if (sets.state === 'loading') return 'loading';
  const revision = (rs: KubeObject) => Number(rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 0);
  const newest = sets.items.flatMap((i) => (i.object ? [i.object] : [])).sort((a, b) => revision(b) - revision(a))[0];
  return newest?.metadata?.name ?? null;
}

/** The scans going on: each scan Job's keys (namespace/Kind/name). */
export function useScans(): { keys: ReadonlySet<string>; jobs: number } {
  const jobs = useList({ kind: REF.jobs, where: { field: F.scanOf, op: 'exists' }, page: { limit: 200 }, select: [F.scanOf] });
  return useMemo(() => {
    const keys = new Set(jobs.items.flatMap((i) => (i.values?.[F.scanOf] as string[] | null) ?? []));
    return { keys, jobs: jobs.items.length };
  }, [jobs.items]);
}

/** A line of its view: a container, its report (none: none yet). */
export interface Line extends Container {
  report?: VulnerabilityReportObject;
}

export interface Scan {
  /** The keys it is reported by. */
  keys: string[];
  lines: Line[];
  audits: AuditReportObject[];
  scanning: boolean;
  /** Its reports on their way. */
  loading: boolean;
}

/** Of these reports, those of the first key any is of. */
function ofFirst<O extends KubeObject>(keys: readonly string[], reports: readonly O[]): O[] {
  const key = keys.find((k) => reports.some((r) => reportKeys(r).includes(k)));
  return key ? reports.filter((r) => reportKeys(r).includes(key)) : [];
}

/** A workload's reports, its containers' lines, whether it is being scanned. */
export function useScan(kind: KindInfo, o: KubeObject): Scan {
  const namespace = o.metadata?.namespace ?? '';
  const current = useCurrentReplicaSet(kind, o);
  const keys = current === undefined ? ownKeys(kind, o) : current && current !== 'loading' ? [`ReplicaSet/${current}`] : [];
  const ask = (k: string) =>
    keys.length ? { kind: k, scope: { namespaces: [namespace] }, where: { field: F.of, op: 'in' as const, values: keys }, page: { limit: 100 } } : undefined;
  const vulns = useList<VulnerabilityReportObject>(ask(REF.vulnerabilities));
  const audits = useList<AuditReportObject>(ask(REF.configAudits));
  const scans = useScans();
  const objects = <O,>(items: readonly { object?: O }[]) => items.flatMap((i) => (i.object ? [i.object] : []));
  const reports = ofFirst(keys, objects(vulns.items));
  const lines = containersOf(kind, o).map((c) => {
    const report = reports.find((r) => r.metadata?.labels?.['trivy-operator.container.name'] === c.name);
    return report ? { ...c, report } : c;
  });
  // A Deployment's scan: of its ReplicaSet (being made: of the Deployment, its hash cut).
  const scanning = [...keys, ...ownKeys(kind, o)].some((k) => scans.keys.has(`${namespace}/${k}`));
  return { keys, lines, audits: ofFirst(keys, objects(audits.items)), scanning, loading: current === 'loading' || vulns.state === 'loading' };
}

/** How an image is, as a mark: being scanned, not scanned, nothing found, or its worst severity's shield. */
export function StateMark({ counts, scanning, scanned }: { counts: SeverityCounts; scanning: boolean; scanned: boolean }) {
  const say = useSay();
  if (scanning) return <Status tone="progress" icon="spinner" title={say(T.state.scanning)} />;
  if (!scanned) return <Status tone="unknown" icon="circle-dashed" title={say(T.state.notScanned)} />;
  const worst = worstOf(counts);
  if (!worst) return <Status tone="ok" icon="circle-check" title={say(T.state.none)} />;
  return <SeverityStatus severity={worst} title={say(T.severities[worst])} />;
}
