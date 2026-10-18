import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { type KubeContributor, type ResourceProps, section } from '@overkube/sdk';
import { ObjectRef, useSay } from '@overkube/sdk/preact';
import { Nothing, Row, Rows, SEVERITIES, Section, type Severity, SeverityFilter, SeverityStatus, Status, Table, type TableColumn, worstOf } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
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
import { type AuditReportObject, countsOf, severityOf, useWords, type VulnerabilityReportObject } from './reports.tsx';
import { Checks } from './sections.tsx';
import { VulnerabilityTable } from './tab.tsx';
import { T } from './texts.ts';

/*
 * A report's own view, under what its table's columns say of it (what it
 * is of, how bad): what it found — a vulnerability report its
 * vulnerabilities (filtered by severity), a config audit's, an RBAC or
 * infra assessment's its checks, an exposed secret report its secrets
 * (where, what — as Trivy masks it: no secret's value is in a report), an
 * SBOM its components, a compliance report its benchmark's controls.
 */

/** The kinds a report may be of, by their Kind (its labels say it): their ids. */
const KINDS = new Map<string, string>(
  [
    kinds.core.v1.Pod,
    kinds.core.v1.Node,
    kinds.core.v1.PersistentVolume,
    kinds.core.v1.ConfigMap,
    kinds.core.v1.Service,
    ...Object.values(kinds.apps.v1),
    ...Object.values(kinds.batch.v1),
    ...Object.values(kinds.rbac.v1),
  ].map((k) => [(k as KindInfo).kind, (k as KindInfo).id]),
);

/** What a report is of, as its labels say (a ReplicaSet's its own: an old revision's told apart): a link to it, its container quiet. */
export function Of({ keys, namespace, container }: { keys: readonly string[]; namespace?: string | undefined; container?: string | undefined }) {
  const key = keys[0];
  if (!key) return <span class="uk-quiet">—</span>;
  const [kind = '', name = ''] = key.split('/');
  const id = KINDS.get(kind);
  return (
    <span class="uk-line">
      {id ? <ObjectRef kind={id} name={name} namespace={namespace} /> : <span>{key}</span>}
      {container && <span class="uk-quiet">{container}</span>}
    </span>
  );
}

/** A report's worst severity, as a state; none: none found. */
export function Worst({ counts }: { counts: Record<Severity, number> }) {
  const say = useSay();
  const worst = worstOf(counts);
  if (!worst)
    return (
      <Status tone="ok" icon="circle-check">
        {say(T.report.noneFound)}
      </Status>
    );
  return <SeverityStatus severity={worst}>{say(T.severities[worst])}</SeverityStatus>;
}

/** A vulnerability report's: each, filtered by severity. */
function Vulnerabilities({ object }: ResourceProps) {
  const say = useSay();
  const words = useWords();
  const r = (object as VulnerabilityReportObject).report;
  const [shown, setShown] = useState<ReadonlySet<Severity>>(new Set(SEVERITIES));
  const all = r?.vulnerabilities ?? [];
  return (
    <Section title={say(T.vulnerabilities.title)} part="vulnerabilities">
      {all.length ? (
        <div class="uk-stack">
          <SeverityFilter counts={countsOf(r?.summary)} words={words} shown={shown} onChange={setShown} />
          <VulnerabilityTable vulnerabilities={all.filter((v) => shown.has(severityOf(v.severity)))} />
        </div>
      ) : (
        <Nothing icon="shield">{say(T.vulnerabilities.noneIn)}</Nothing>
      )}
    </Section>
  );
}

/** A config audit's, an RBAC or infra assessment's: its failed checks. */
function Failed({ object }: ResourceProps) {
  const say = useSay();
  const report = object as AuditReportObject;
  if (!(report.report?.checks ?? []).some((c) => c.success !== true))
    return (
      <Section title={say(T.report.checks)} part="checks">
        <Nothing icon="circle-check">{say(T.report.noChecks)}</Nothing>
      </Section>
    );
  return <Checks title={say(T.report.checks)} part="checks" reports={[report]} />;
}

type Secret = { ruleID: string; title?: string; category?: string; severity: string; target?: string; match?: string };

/** An exposed secret report's: each secret — its rule, its severity; where, what (masked). */
function Secrets({ object }: ResourceProps) {
  const say = useSay();
  const secrets = (object as KubeObject & { report?: { secrets?: Secret[] } }).report?.secrets ?? [];
  return (
    <Section title={say(T.report.secrets)} part="secrets">
      {secrets.length ? (
        <Rows>
          {secrets.map((x, i) => {
            const s = severityOf(x.severity);
            return (
              <Row
                key={`${x.ruleID}:${x.target}:${i}`}
                lead={<b title={x.ruleID}>{x.title ?? x.ruleID}</b>}
                end={<SeverityStatus severity={s}>{say(T.severities[s])}</SeverityStatus>}
                under={
                  <span class="uk-stack">
                    <span class="uk-mono">{x.target}</span>
                    {x.match && <code class="uk-why">{x.match}</code>}
                  </span>
                }
              />
            );
          })}
        </Rows>
      ) : (
        <Nothing icon="key">{say(T.report.noSecrets)}</Nothing>
      )}
    </Section>
  );
}

type Component = {
  'bom-ref'?: string;
  name: string;
  version?: string;
  type?: string;
  licenses?: { license?: { id?: string; name?: string }; expression?: string }[];
  purl?: string;
};

/** An SBOM's: its components (CycloneDX's). */
function Components({ object }: ResourceProps) {
  const say = useSay();
  const t = T.report;
  const all = (object as KubeObject & { report?: { components?: { components?: Component[] } } }).report?.components?.components ?? [];
  const columns: TableColumn<Component>[] = [
    { id: 'name', header: say(t.name), width: 'minmax(0, 1.2fr)', cell: (c) => <span title={c.purl}>{c.name}</span> },
    { id: 'version', header: say(t.version), width: 'minmax(0, 1fr)', cell: (c) => <span class="uk-mono">{c.version}</span> },
    { id: 'type', header: say(t.type), width: '120px', cell: (c) => c.type },
    {
      id: 'license',
      header: say(t.license),
      width: 'minmax(0, 1fr)',
      cell: (c) => (
        <span class="uk-quiet">
          {c.licenses
            ?.map((l) => l.license?.id ?? l.license?.name ?? l.expression)
            .filter(Boolean)
            .join(', ') || '—'}
        </span>
      ),
    },
  ];
  return (
    <Section title={say(t.components)} part="components">
      {all.length ? (
        <Table plain rows={all.map((x, i) => ({ ...x, key: x['bom-ref'] ?? `${x.name}@${x.version}:${i}` }))} rowKey={(x) => x.key} columns={columns} reorderable={false} />
      ) : (
        <Nothing icon="packages">{say(t.noComponents)}</Nothing>
      )}
    </Section>
  );
}

type Control = { id: string; name: string; severity: string; totalFail?: number };
type Compliance = KubeObject & { spec?: { compliance?: { title?: string; version?: string } }; status?: { summaryReport?: { controlCheck?: Control[] } } };

/** A compliance report's: its benchmark's controls — each passed or failed (how many), its severity. */
function Controls({ object }: ResourceProps) {
  const say = useSay();
  const t = T.report;
  const o = object as Compliance;
  const columns: TableColumn<Control>[] = [
    {
      id: 'result',
      header: '',
      label: say(T.columns.result),
      width: '28px',
      cell: (c) =>
        c.totalFail ? <Status tone="error" icon="circle-x" title={say(t.failed, { count: c.totalFail })} /> : <Status tone="ok" icon="circle-check" title={say(t.pass)} />,
    },
    { id: 'id', header: say(t.id), width: '48px', cell: (c) => c.id },
    { id: 'control', header: say(t.control), width: 'minmax(0, 1fr)', wrap: true, cell: (c) => c.name },
    {
      id: 'severity',
      header: say(T.columns.severity),
      width: '96px',
      cell: (c) => {
        const s = severityOf(c.severity);
        return <SeverityStatus severity={s}>{say(T.severities[s])}</SeverityStatus>;
      },
    },
  ];
  const c = o.spec?.compliance;
  const controls = o.status?.summaryReport?.controlCheck ?? [];
  return (
    <Section title={c?.title ?? o.metadata?.name ?? ''} part="controls">
      {controls.length ? (
        <Table plain rows={controls} rowKey={(x) => x.id} columns={columns} reorderable={false} />
      ) : (
        // A detailed report (reportType: all) lists its checks, not a summary of its controls: in its YAML.
        <Nothing>{say(t.noControls)}</Nothing>
      )}
    </Section>
  );
}

export function addReportViews(c: KubeContributor): void {
  const fill = (name: string, kinds: readonly KindInfo[], render: (p: ResourceProps) => ComponentChildren) =>
    c.add('Fill', `trivy.resource.view.report.${name}`, section({ kinds, order: 5, render }));
  fill('vulnerabilities', [VulnerabilityReport, ClusterVulnerabilityReport], Vulnerabilities);
  fill('checks', [ConfigAuditReport, ClusterConfigAuditReport, RbacAssessmentReport, ClusterRbacAssessmentReport, InfraAssessmentReport, ClusterInfraAssessmentReport], Failed);
  fill('secrets', [ExposedSecretReport], Secrets);
  fill('components', [SbomReport, ClusterSbomReport], Components);
  fill('controls', [ClusterComplianceReport], Controls);
}
