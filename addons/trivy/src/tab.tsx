import { forKinds, type KubeContributor, type ResourceProps, slots } from '@overkube/sdk';
import { fill, useSay } from '@overkube/sdk/preact';
import {
  Badge,
  Card,
  Nothing,
  SEVERITIES,
  type Severity,
  type SeverityCounts,
  SeverityFilter,
  SeverityStatus,
  SeverityTally,
  Skeleton,
  Status,
  Table,
  type TableColumn,
  type TableSort,
} from '@overkube/uikit';
import { useState } from 'preact/hooks';
import { WORKLOADS } from './kinds.ts';
import { added, countsOf, imageOf, type Line, NONE, StateMark, severityOf, useScan, useWords, type Vulnerability, type VulnerabilityReportObject } from './reports.tsx';
import { T } from './texts.ts';

/*
 * A workload's Vulnerabilities tab: a card an image — the containers
 * running it (an image two of them run: once), its OS — the worst first,
 * each its vulnerabilities in a table (sorted as asked), all of them
 * filtered by severity at once; one being scanned, said in its card, its
 * rows to come; one not scanned, said so (and why there may be none);
 * those with nothing found, one line at its end.
 */

/** An image as its containers run it, its report (none: none yet). */
export interface Image {
  key: string;
  containers: string[];
  init: boolean;
  image: string;
  report?: VulnerabilityReportObject;
  counts: SeverityCounts;
}

/** Its lines by image: one report's digest, or (none yet) the image asked. */
export function imagesOf(lines: readonly Line[]): Image[] {
  const by = new Map<string, Image>();
  for (const l of lines) {
    const key = l.report?.report?.artifact?.digest || l.image;
    const had = by.get(key);
    if (had) {
      had.containers.push(l.name);
      had.init &&= l.init;
    } else by.set(key, { key, containers: [l.name], init: l.init, image: l.image, ...(l.report ? { report: l.report } : {}), counts: countsOf(l.report?.report?.summary) });
  }
  const rank = (i: Image) => SEVERITIES.map((s) => String(9999 - i.counts[s]).padStart(4, '0')).join('');
  return [...by.values()].sort((a, b) => rank(a).localeCompare(rank(b)));
}

const ORDER = (v: Vulnerability) => SEVERITIES.indexOf(severityOf(v.severity));
const BY: Record<string, (a: Vulnerability, b: Vulnerability) => number> = {
  severity: (a, b) => ORDER(a) - ORDER(b) || (b.score ?? 0) - (a.score ?? 0),
  id: (a, b) => a.vulnerabilityID.localeCompare(b.vulnerabilityID),
  resource: (a, b) => (a.resource ?? '').localeCompare(b.resource ?? ''),
};

/** Where a vulnerability's link leads, if it leads to a web page (a report's words: nothing else made a link). */
const linkOf = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);

/** Its vulnerabilities, those shown: a table, sorted as asked (by severity at first) — as narrow as a view opened at the side: its title in its ID's tip, its installed version in its resource's. */
export function VulnerabilityTable({ vulnerabilities }: { vulnerabilities: readonly Vulnerability[] }) {
  const say = useSay();
  const t = T.vulnerabilities;
  const [sort, setSort] = useState<TableSort>({ id: 'severity' });
  const by = BY[sort.id] ?? BY.severity;
  // Each its key (one CVE in one package may be found twice: its place in the report's list too).
  const rows = vulnerabilities.map((v, i) => ({ ...v, key: `${v.vulnerabilityID}:${v.resource}:${i}` })).sort((a, b) => (sort.desc ? -1 : 1) * (by?.(a, b) ?? 0));
  const mono = (text: string | undefined, tip = text) => (
    <span class="uk-mono" title={tip}>
      {text}
    </span>
  );
  const columns: TableColumn<Vulnerability & { key: string }>[] = [
    {
      id: 'severity',
      header: say(t.severity),
      width: '96px',
      sortable: true,
      cell: (v) => {
        const s = severityOf(v.severity);
        return <SeverityStatus severity={s}>{say(T.severities[s])}</SeverityStatus>;
      },
    },
    {
      id: 'id',
      header: say(t.id),
      width: 'minmax(0, 1.3fr)',
      sortable: true,
      cell: (v) => {
        const href = linkOf(v.primaryLink);
        return href ? (
          <a href={href} target="_blank" rel="noreferrer" title={v.title}>
            {v.vulnerabilityID}
          </a>
        ) : (
          <span title={v.title}>{v.vulnerabilityID}</span>
        );
      },
    },
    { id: 'resource', header: say(t.resource), width: 'minmax(0, 1fr)', sortable: true, cell: (v) => mono(v.resource, `${v.resource} ${v.installedVersion ?? ''}`) },
    { id: 'fixed', header: say(t.fixed), width: 'minmax(0, 1fr)', cell: (v) => mono(v.fixedVersion) },
  ];
  return <Table plain height="60vh" rows={rows} rowKey={(v) => v.key} columns={columns} sort={sort} onSort={setSort} reorderable={false} />;
}

/** An image's card: its containers, its image and OS, what was found at its end; its table — its rows to come, or that it was not scanned. */
function ImageCard({ image, shown, scanning }: { image: Image; shown: ReadonlySet<Severity>; scanning: boolean }) {
  const say = useSay();
  const words = useWords();
  const r = image.report?.report;
  const os = [r?.os?.family, r?.os?.name].filter(Boolean).join(' ');
  const repository = imageOf(image.report, image.image);
  return (
    <Card
      mark={<StateMark counts={image.counts} scanning={scanning} scanned={!!image.report} />}
      title={image.containers.join(', ')}
      badges={
        <>
          {image.init && <Badge>{say(T.vulnerabilities.init)}</Badge>}
          {r?.os?.eosl && <Badge level="warn">{say(T.vulnerabilities.eosl)}</Badge>}
        </>
      }
      quiet={
        <>
          <span class="uk-mono">{repository}</span>
          {os && ` · ${os}`}
        </>
      }
      end={
        scanning ? (
          <Status tone="progress" icon="spinner">
            {say(T.state.scanning)}
          </Status>
        ) : image.report ? (
          <SeverityTally counts={image.counts} words={words} />
        ) : (
          <Status tone="unknown" icon="circle-dashed">
            {say(T.state.notScanned)}
          </Status>
        )
      }
    >
      {scanning ? (
        <div class="uk-stack" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} />
          ))}
        </div>
      ) : !image.report ? (
        <Nothing>{say(T.state.notScannedWhy)}</Nothing>
      ) : (
        <VulnerabilityTable vulnerabilities={(r?.vulnerabilities ?? []).filter((v) => shown.has(severityOf(v.severity)))} />
      )}
    </Card>
  );
}

/** The tab: the severities to show, a card an image (the worst first), those with nothing found in one line. */
function VulnerabilitiesTab({ kind, object }: ResourceProps) {
  const say = useSay();
  const words = useWords();
  const scan = useScan(kind, object);
  const [shown, setShown] = useState<ReadonlySet<Severity>>(new Set(SEVERITIES));
  const images = imagesOf(scan.lines);
  const clean = images.filter((i) => !scan.scanning && i.report && !SEVERITIES.some((s) => i.counts[s]));
  const all = added(images.map((i) => i.counts));
  return (
    <div class="uk-stack">
      {SEVERITIES.some((s) => all[s]) && <SeverityFilter counts={all} words={words} shown={shown} onChange={setShown} />}
      {images
        .filter((i) => !clean.includes(i))
        .map((i) => (
          <ImageCard key={i.key} image={i} shown={shown} scanning={scan.scanning} />
        ))}
      {clean.length > 0 && (
        <Card mark={<StateMark counts={NONE} scanning={false} scanned />} title={say(T.state.none)} quiet={clean.map((i) => `${i.containers.join(', ')} ${i.image}`).join(' · ')} />
      )}
    </div>
  );
}

export function addTab(c: KubeContributor): void {
  c.add('ResourceTab', 'trivy.vulnerabilities', { target: forKinds(...WORKLOADS), title: T.vulnerabilities.title, icon: 'shield', order: 300 });
  c.add('Fill', 'trivy.resource.view.vulnerabilities-tab', fill(slots.resource.view.tab('trivy.vulnerabilities'), { render: (p) => <VulnerabilitiesTab {...p} /> }));
  c.add('Slot', slots.resource.view.tab('trivy.vulnerabilities').name, {}, { fallback: true });
}
