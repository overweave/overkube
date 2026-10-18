import { type KubeContributor, tile } from '@overkube/sdk';
import { ObjectRef, usePage, useSay } from '@overkube/sdk/preact';
import { Panel, PanelBody, PanelHead, SeverityCount, SeverityTotals, Status, Table, type TableColumn } from '@overkube/uikit';
import { type ImageRow, useImages } from './images.tsx';
import { added, useScans, useWords } from './reports.tsx';
import { useTableView } from './table.ts';
import { T } from './texts.ts';

/*
 * The start's: the scans going on (trivy-operator's Jobs; none: not
 * said); each severity's total of the cluster's images (each once); the
 * workloads the most vulnerable first — the most critical, then high, of
 * one of their images: a table set out and sorted as the user sets it, kept.
 */

/** The workloads' table's own TableView. */
export const WORKLOADS_VIEW = 'trivy.overview.workloads';

const SHOWN = 7;

type Workload = { kind: string; name: string; namespace: string; critical: number; high: number };

/** The workloads of these images, the most vulnerable first. */
function worstWorkloads(images: readonly ImageRow[]): Workload[] {
  const by = new Map<string, Workload>();
  for (const image of images)
    for (const u of image.uses) {
      const key = `${u.kind}/${u.namespace}/${u.name}`;
      const had = by.get(key) ?? { kind: u.kind, name: u.name, namespace: u.namespace, critical: 0, high: 0 };
      by.set(key, { ...had, critical: Math.max(had.critical, image.counts.critical), high: Math.max(had.high, image.counts.high) });
    }
  return [...by.values()].filter((w) => w.critical || w.high).sort((a, b) => b.critical - a.critical || b.high - a.high || a.name.localeCompare(b.name));
}

const BY: Record<string, (a: Workload, b: Workload) => number> = {
  workload: (a, b) => a.name.localeCompare(b.name),
  namespace: (a, b) => a.namespace.localeCompare(b.namespace),
  critical: (a, b) => a.critical - b.critical,
  high: (a, b) => a.high - b.high,
};

function Vulnerabilities() {
  const say = useSay();
  const page = usePage();
  const words = useWords();
  const { images } = useImages();
  const scans = useScans();
  const columns: TableColumn<Workload>[] = [
    {
      id: 'workload',
      header: say(T.overview.workload),
      width: 'minmax(160px, 1.6fr)',
      sortable: true,
      cell: (w) => <ObjectRef kind={w.kind} name={w.name} namespace={w.namespace} quiet />,
    },
    { id: 'namespace', header: say(T.images.namespace), width: 'minmax(90px, 1fr)', sortable: true, cell: (w) => w.namespace },
    { id: 'critical', header: words.critical, width: '84px', sortable: true, cell: (w) => <SeverityCount severity="critical" value={w.critical} /> },
    { id: 'high', header: words.high, width: '84px', sortable: true, cell: (w) => <SeverityCount severity="high" value={w.high} /> },
  ];
  const table = useTableView(WORKLOADS_VIEW, columns);
  if (!images.length && !scans.jobs) return null;
  const by = table.sort && BY[table.sort.id];
  const all = worstWorkloads(images);
  const worst = (by ? [...all].sort((a, b) => (table.sort?.desc ? -1 : 1) * by(a, b)) : all).slice(0, SHOWN);
  return (
    <Panel header={<PanelHead title={say(T.overview.title)} more={{ label: say(T.images.title), href: page.href('/images') }} />}>
      <PanelBody>
        <div class="uk-stack">
          {scans.jobs > 0 && (
            <span class="uk-line">
              <Status tone="progress" icon="spinner">
                {say(T.state.scanning)}
              </Status>
              <span class="uk-quiet">{say(T.overview.scans, { count: scans.jobs })}</span>
            </span>
          )}
          <SeverityTotals counts={added(images.map((i) => i.counts))} words={words} />
        </div>
      </PanelBody>
      {worst.length > 0 && <Table height="none" rows={worst} rowKey={(w) => `${w.kind}/${w.namespace}/${w.name}`} {...table} />}
    </Panel>
  );
}

export function addOverview(c: KubeContributor): void {
  c.add('TableView', WORKLOADS_VIEW, {}, { fallback: true });
  c.add('Fill', 'trivy.page.overview.vulnerabilities', tile('overview', 'main', { title: 'Vulnerabilities', order: 150, render: Vulnerabilities }));
}
