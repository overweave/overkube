import type { KindInfo } from '@overkube/kube-types';
import { type CellValue, type ColumnContext, type ColumnSpec, column, type KubeContributor, type LabelRef, openIn } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import { SEVERITIES, type Severity, SeverityStatus, SeverityTally, Status } from '@overkube/uikit';
import { Os } from './images.tsx';
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
  InfraAssessmentReport,
  OF_RESOURCES,
  RbacAssessmentReport,
  SbomReport,
  SEVERE_REPORTS,
  VulnerabilityReport,
  WORKLOADS,
} from './kinds.ts';
import { useScans, useWords } from './reports.tsx';
import { T } from './texts.ts';
import { Of, Worst as WorstFound } from './views.tsx';

/*
 * The workloads' tables: Vulnerabilities — not kubectl's, not shown till
 * turned on (the columns' More), each state as a status is drawn (its
 * icon, its word): the worst severity of its reports, a link opening it on
 * its Vulnerabilities tab; being scanned; none found; no report, not
 * scanned (why, in its tip). Sorted, filtered by it (vulnerabilities: 5
 * critical … 1 unknown, 0 none; critical_vulnerabilities,
 * high_vulnerabilities: the most of one of its reports' images).
 * The reports' tables: what each is of (its resource, its container), its
 * worst severity in kstatus's place (a report has no status of its own;
 * an SBOM none at all), its counts beside it; their CRDs' columns in their
 * places (a viewer cannot read a CRD), each count apart among More.
 */

/** Its rank's severity (5 critical … 1 unknown). */
const ranked = (rank: number) => SEVERITIES[5 - rank];

function Worst({ kind, name, namespace, rank, keys }: { kind: KindInfo; name: string; namespace: string | undefined; rank: CellValue; keys: CellValue }) {
  const say = useSay();
  const page = usePage();
  const scans = useScans();
  const scanning = (Array.isArray(keys) ? keys : []).some((k) => scans.keys.has(`${namespace ?? ''}/${String(k)}`));
  if (scanning)
    return (
      <Status tone="progress" icon="spinner">
        {say(T.state.scanning)}
      </Status>
    );
  if (typeof rank !== 'number')
    return (
      <Status tone="unknown" icon="circle-dashed" title={say(T.state.notScannedWhy)}>
        {say(T.state.notScanned)}
      </Status>
    );
  const worst = ranked(rank);
  if (!worst)
    return (
      <Status tone="ok" icon="circle-check">
        {say(T.state.none)}
      </Status>
    );
  const opened = openIn(page.path.value, kind, { metadata: { name, ...(namespace ? { namespace } : {}) } }, 'trivy.vulnerabilities');
  return (
    <a class="uk-sev-link" href={page.href(opened)} title={say(T.state.open, { severity: say(T.severities[worst]) })}>
      <SeverityStatus severity={worst}>{say(T.severities[worst])}</SeverityStatus>
    </a>
  );
}

type Own = [header: LabelRef, sort: string, more?: Partial<ColumnSpec>];

const COUNTS = SEVERITIES.map((s) => `.report.summary.${s}Count`);
/** Counts, as a cell's values give them. */
const countsIn = (values: readonly CellValue[]) => Object.fromEntries(SEVERITIES.map((s, i) => [s, Number(values[i] ?? 0)])) as Record<Severity, number>;
/** Each count apart (Found says them all): among More. */
const each = (unknown: boolean): Own[] => SEVERITIES.filter((s) => unknown || s !== 'unknown').map((s) => [T.severities[s], `.report.summary.${s}Count`, { more: true }]);
const image: Own[] = [
  [T.columns.repository, '.report.artifact.repository'],
  [T.columns.tag, '.report.artifact.tag'],
];
const scanner: Own = [T.columns.scanner, '.report.scanner.name', { wide: true }];

/** Each report kind's CRD's columns, in their places (core.<kind>.<its name>), its order (Age the core's). */
const CRD: [KindInfo, Own[]][] = [
  ...[VulnerabilityReport, ClusterVulnerabilityReport].map((k): [KindInfo, Own[]] => [k, [...image, scanner, ...each(true)]]),
  [ExposedSecretReport, [...image, scanner, ...each(false)]],
  ...[ConfigAuditReport, ClusterConfigAuditReport, RbacAssessmentReport, ClusterRbacAssessmentReport, InfraAssessmentReport, ClusterInfraAssessmentReport].map(
    (k): [KindInfo, Own[]] => [k, [scanner, ...each(false)]],
  ),
  ...[SbomReport, ClusterSbomReport].map((k): [KindInfo, Own[]] => [
    k,
    [...image, [T.columns.components, '.report.summary.componentsCount'], scanner, [T.columns.dependencies, '.report.summary.dependenciesCount', { wide: true }]],
  ]),
  [
    ClusterComplianceReport,
    [
      [T.columns.fail, '.status.summary.failCount'],
      [T.columns.pass, '.status.summary.passCount'],
    ],
  ],
];

/** A report's counts, those there are some of. */
function Found({ counts }: { counts: Record<Severity, number> }) {
  const words = useWords();
  return SEVERITIES.some((s) => counts[s]) ? <SeverityTally counts={counts} words={words} /> : <span class="uk-quiet">—</span>;
}

/** A compliance report's result: its failed controls (an error), or passed. */
function Result([failed]: readonly CellValue[], { say }: ColumnContext) {
  const n = Number(failed ?? 0);
  return n ? (
    <Status tone="error" icon="circle-x">
      {say(T.report.failed, { count: n })}
    </Status>
  ) : (
    <Status tone="ok" icon="circle-check">
      {say(T.report.passed)}
    </Status>
  );
}

export function addColumns(c: KubeContributor): void {
  for (const k of WORKLOADS)
    c.add(
      'Column',
      `trivy.${k.plural}.vulnerabilities`,
      column({
        kinds: [k],
        header: T.columns.vulnerabilities,
        more: true,
        width: 160,
        order: 600,
        sort: F.worst(k),
        values: [F.worst(k), F.key(k), 'core.name', 'core.namespace'],
        format: ([rank, keys, name, namespace], { kind }) => (
          <Worst kind={kind} name={String(name)} namespace={typeof namespace === 'string' ? namespace : undefined} rank={rank} keys={keys} />
        ),
      }),
    );
  // In the place of each CRD's own: its name (core.<kind>.<its name>), its order.
  for (const [kind, columns] of CRD)
    for (const [i, [header, sort, more]] of columns.entries())
      c.add('Column', `core.${kind.id}.${header.key.split('.').pop()}`, column({ kinds: [kind], header, sort, order: 100 + i * 10, ...more }));
  // What a report is of (not its name alone: a hash, or its resource's kind and name over again), after its name.
  for (const k of OF_RESOURCES)
    c.add(
      'Column',
      `trivy.${k.plural}.resource`,
      column({
        kinds: [k],
        header: T.columns.resource,
        order: 55,
        width: 240,
        sort: F.of,
        values: [F.of, 'core.namespace', F.container],
        format: ([keys, namespace, container]) => (
          <Of
            keys={Array.isArray(keys) ? keys.map(String) : []}
            namespace={typeof namespace === 'string' ? namespace : undefined}
            container={typeof container === 'string' && container ? container : undefined}
          />
        ),
      }),
    );
  // A report's state is what it found: its worst severity in kstatus's place (a report has no status of its own), its counts beside it.
  for (const k of SEVERE_REPORTS) {
    c.add(
      'Column',
      `core.${k.id}.status`,
      column({
        kinds: [k],
        header: T.columns.severity,
        order: 60,
        width: 130,
        sort: '.report.summary.criticalCount',
        values: COUNTS,
        format: (v) => <WorstFound counts={countsIn(v)} />,
      }),
    );
    c.add(
      'Column',
      `trivy.${k.plural}.found`,
      column({ kinds: [k], header: T.columns.found, order: 65, width: 300, values: COUNTS, format: (v) => <Found counts={countsIn(v)} /> }),
    );
  }
  for (const k of [VulnerabilityReport, ClusterVulnerabilityReport])
    c.add(
      'Column',
      `trivy.${k.plural}.os`,
      column({
        kinds: [k],
        header: T.columns.os,
        order: 125,
        width: 170,
        sort: F.os,
        values: [F.os, F.osVersion, F.eosl],
        format: ([family, version, eosl]) => <Os os={[family, version].filter(Boolean).join(' ')} eosl={eosl === true} />,
      }),
    );
  // An SBOM: no state at all — kstatus's place taken by none.
  for (const k of [SbomReport, ClusterSbomReport])
    c.add('Column', `core.${k.id}.status`, column({ kinds: [k], header: T.columns.result, values: ['core.name'], when: () => false }));
  c.add(
    'Column',
    `core.${ClusterComplianceReport.id}.status`,
    column({ kinds: [ClusterComplianceReport], header: T.columns.result, order: 60, width: 130, sort: '.status.summary.failCount', format: Result }),
  );
}
