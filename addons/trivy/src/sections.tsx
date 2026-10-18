import { kinds } from '@overkube/kube-types';
import { humanDuration, type KubeContributor, type ResourceProps, section } from '@overkube/sdk';
import { useList, useSay } from '@overkube/sdk/preact';
import { Accordion, AccordionItem, Badge, Button, SEVERITIES, Section, SeverityMatrix, type SeverityRow, SeverityStatus } from '@overkube/uikit';
import { useState } from 'preact/hooks';
import { F, REF, WORKLOADS } from './kinds.ts';
import { type AuditReportObject, type Check, countsOf, imageOf, type Line, NONE, StateMark, severityOf, useScan, useWords } from './reports.tsx';
import { T } from './texts.ts';

/*
 * A workload's Overview: Vulnerabilities — a row a container (its image,
 * its OS out of support marked), a column a severity, numbers only (the
 * tab has each); being scanned or not scanned, said across them; by what
 * and how long ago, under them. Config Audit — its failed checks' counts
 * the same way, the critical and high ones a row each (opened: what
 * trivy-operator says, how to fix it), the rest when asked. A Role's, a
 * ClusterRole's RBAC Assessment, as a config audit.
 */

/** How long ago, as kubectl says an age. */
export const ago = (time: string | undefined) => {
  const at = Date.parse(time ?? '');
  return Number.isNaN(at) ? '' : humanDuration(Date.now() - at);
};

/** A container's row: its mark, its name (an init one, its image's OS out of support, said), its image; its counts or its state. */
function rowOf(line: Line, scanning: boolean, say: ReturnType<typeof useSay>): SeverityRow {
  const r = line.report?.report;
  const counts = r ? countsOf(r.summary) : NONE;
  const os = [r?.os?.family, r?.os?.name].filter(Boolean).join(' ');
  const image = imageOf(line.report, line.image);
  // Being scanned (its image changed): said, not its old counts.
  const said = scanning ? say(T.state.scanning) : !line.report ? say(T.state.notScanned) : undefined;
  return {
    key: line.name,
    mark: <StateMark counts={counts} scanning={scanning} scanned={!!line.report} />,
    lead: (
      <>
        <b>{line.name}</b>
        {line.init && <Badge>{say(T.vulnerabilities.init)}</Badge>}
        {r?.os?.eosl && (
          <Badge level="warn" title={say(T.vulnerabilities.eoslTip, { os })}>
            {say(T.vulnerabilities.eosl)}
          </Badge>
        )}
      </>
    ),
    under: image,
    title: line.image,
    ...(said === undefined
      ? { counts }
      : {
          instead: (
            <span class="uk-quiet" title={scanning ? undefined : say(T.state.notScannedWhy)}>
              {said}
            </span>
          ),
        }),
  };
}

function Vulnerabilities({ kind, object }: ResourceProps) {
  const say = useSay();
  const words = useWords();
  const scan = useScan(kind, object);
  if (scan.loading || !scan.lines.length) return null;
  const scanned = scan.lines.flatMap((l) => (l.report ? [l.report.report] : []));
  const scanner = scanned[0]?.scanner;
  const newest = scanned
    .map((r) => r?.updateTimestamp ?? '')
    .sort()
    .at(-1);
  return (
    <Section title={say(T.vulnerabilities.title)} part="vulnerabilities">
      <SeverityMatrix
        words={words}
        rows={scan.lines.map((l) => rowOf(l, scan.scanning, say))}
        {...(scanner
          ? {
              foot: (
                <>
                  <span>{say(T.vulnerabilities.scanned, { scanner: scanner.name ?? 'Trivy', version: scanner.version ?? '' })}</span>
                  <span>{ago(newest)}</span>
                </>
              ),
            }
          : {})}
      />
    </Section>
  );
}

const SEVERE = new Set(['critical', 'high']);

/** Failed checks: their counts; the critical and high a row each (opened: what is said, how to fix it), the rest when asked. */
export function Checks({ title, part, reports }: { title: string; part: string; reports: readonly AuditReportObject[] }) {
  const say = useSay();
  const words = useWords();
  const [all, setAll] = useState(false);
  // One check failed in several places (the pod's, each container's): once, what is said of each place under it.
  const by = new Map<string, Check>();
  for (const c of reports.flatMap((r) => r.report?.checks ?? []))
    if (c.success !== true) {
      const had = by.get(c.checkID);
      by.set(c.checkID, had ? { ...had, messages: [...(had.messages ?? []), ...(c.messages ?? [])] } : c);
    }
  const checks = [...by.values()];
  if (!reports.length) return null;
  const counts = countsOf(reports[0]?.report?.summary);
  const order = (c: Check) => SEVERITIES.indexOf(severityOf(c.severity));
  const sorted = [...checks].sort((a, b) => order(a) - order(b));
  const shown = all ? sorted : sorted.filter((c) => SEVERE.has(severityOf(c.severity)));
  return (
    <Section title={title} part={part}>
      <SeverityMatrix words={words} rows={[{ key: 'failed', lead: <b>{say(T.audit.failed)}</b>, counts }]} />
      {shown.length > 0 && (
        <Accordion>
          {shown.map((c) => (
            <AccordionItem
              key={c.checkID}
              title={c.title ?? c.checkID}
              end={<SeverityStatus severity={severityOf(c.severity)}>{say(T.severities[severityOf(c.severity)])}</SeverityStatus>}
            >
              {(c.messages?.length ? [...new Set(c.messages)] : c.description ? [c.description] : []).map((m) => (
                <p key={m}>{m}</p>
              ))}
              <p class="uk-quiet">{[c.remediation, c.checkID].filter(Boolean).join(' · ')}</p>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {!all && sorted.length > shown.length && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          {say(T.audit.showAll, { count: sorted.length })}
        </Button>
      )}
    </Section>
  );
}

function ConfigAudit({ kind, object }: ResourceProps) {
  const say = useSay();
  const scan = useScan(kind, object);
  return <Checks title={say(T.audit.title)} part="config-audit" reports={scan.audits} />;
}

const { Role, ClusterRole } = kinds.rbac.v1;

function RbacAssessment({ kind, object }: ResourceProps) {
  const say = useSay();
  const cluster = kind.id === ClusterRole.id;
  const name = object.metadata?.name ?? '';
  const got = useList<AuditReportObject>({
    kind: cluster ? REF.clusterRbac : REF.rbac,
    ...(cluster ? {} : { scope: { namespaces: [object.metadata?.namespace ?? ''] } }),
    where: { field: F.of, op: 'eq', value: `${kind.kind}/${name}` },
    page: { limit: 5 },
  });
  return <Checks title={say(T.audit.rbac)} part="rbac-assessment" reports={got.items.flatMap((i) => (i.object ? [i.object] : []))} />;
}

export function addSections(c: KubeContributor): void {
  c.add('Fill', 'trivy.resource.view.vulnerabilities', section({ kinds: WORKLOADS, order: 40, render: Vulnerabilities }));
  c.add('Fill', 'trivy.resource.view.config-audit', section({ kinds: WORKLOADS, order: 41, render: ConfigAudit }));
  c.add('Fill', 'trivy.resource.view.rbac-assessment', section({ kinds: [Role, ClusterRole], order: 40, render: RbacAssessment }));
}
