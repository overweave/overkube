import { filteredIn, filterIn, type KubeContributor, slots } from '@overkube/sdk';
import { fill, ObjectRef, useGet, useList, usePage, useSay, useTableView } from '@overkube/sdk/preact';
import {
  Badge,
  KeyValue,
  Modal,
  Nothing,
  PageHeader,
  Panel,
  QueryField,
  SEVERITIES,
  Section,
  type Severity,
  SeverityCount,
  type SeverityCounts,
  Table,
  type TableColumn,
} from '@overkube/uikit';
import { useMemo, useState } from 'preact/hooks';
import { F, REF, WORKLOADS } from './kinds.ts';
import type { VulnerabilityReportObject } from './reports.tsx';
import { ago } from './sections.tsx';
import { VulnerabilityTable } from './tab.tsx';
import { T } from './texts.ts';

/*
 * The images the cluster runs, as Trivy found them (a Deployment's old
 * revisions' reports aside: nothing runs them): each once (by its digest), what is in it — its OS (out of support: marked), each
 * severity's count — and how many workloads run it. Its page (the
 * addon's, in the navigation): filtered as a kind's table is (its fields:
 * repository, tag, os, eosl, critical…), sorted by any column; an image's
 * name opens it — what it is, its vulnerabilities, where it runs.
 */

const SELECT = ['core.name', 'core.namespace', F.repository, F.tag, F.digest, F.os, F.osVersion, F.eosl, F.container, F.of, ...SEVERITIES.map((s) => F[s])];

/** Where an image runs: a workload (its kind's id, its name, its namespace), its container. */
export interface Use {
  kind: string;
  name: string;
  namespace: string;
  container: string;
}

export interface ImageRow {
  key: string;
  repository: string;
  tag: string;
  digest: string;
  os: string;
  eosl: boolean;
  counts: SeverityCounts;
  uses: Use[];
  /** Workloads running it. */
  workloads: number;
  /** One of its reports (its vulnerabilities). */
  report: { name: string; namespace: string };
}

const KIND_IDS = new Map<string, string>(WORKLOADS.map((k) => [k.kind, k.id]));

/** A report's workload: a Deployment's, of a ReplicaSet's report. */
function workloadOf(keys: readonly string[], namespace: string, container: string): Use | undefined {
  const key = keys.find((k) => k.startsWith('Deployment/')) ?? keys[0];
  const [kind = '', name = ''] = key?.split('/') ?? [];
  const id = KIND_IDS.get(kind);
  return id ? { kind: id, name, namespace, container } : undefined;
}

/** The images of the reports a filter lets through (none: all), each once. */
export function useImages(filter = ''): { images: ImageRow[]; state: string; error: ReturnType<typeof useList>['error'] } {
  const got = useList({ kind: REF.vulnerabilities, page: { limit: 2000 }, select: SELECT, ...(filter.trim() ? { filter } : {}) });
  // A Deployment's old revisions (none of its pods): their reports, kept a while, are of nothing that runs.
  const old = useList({ kind: 'replicasets.v1.apps', where: { field: '.spec.replicas', op: 'eq', value: 0 }, page: { limit: 2000 }, select: ['core.name', 'core.namespace'] });
  const images = useMemo(() => {
    const stale = new Set(old.items.map((i) => `${i.values?.['core.namespace']}/ReplicaSet/${i.values?.['core.name']}`));
    const by = new Map<string, ImageRow>();
    for (const i of got.items) {
      const v = i.values ?? {};
      const text = (f: string) => (typeof v[f] === 'string' ? (v[f] as string) : '');
      const keys = (v[F.of] as string[] | null) ?? [];
      if (keys[0] && stale.has(`${text('core.namespace')}/${keys[0]}`)) continue;
      const key = text(F.digest) || `${text(F.repository)}:${text(F.tag)}`;
      const namespace = text('core.namespace');
      const use = workloadOf(keys, namespace, text(F.container));
      const had = by.get(key);
      if (had) {
        if (use) had.uses.push(use);
        continue;
      }
      by.set(key, {
        key,
        repository: text(F.repository),
        tag: text(F.tag),
        digest: text(F.digest),
        os: [text(F.os), text(F.osVersion)].filter(Boolean).join(' '),
        eosl: v[F.eosl] === true,
        counts: Object.fromEntries(SEVERITIES.map((s) => [s, Number(v[F[s]] ?? 0)])) as Record<Severity, number>,
        uses: use ? [use] : [],
        workloads: 0,
        report: { name: text('core.name'), namespace },
      });
    }
    for (const image of by.values()) image.workloads = new Set(image.uses.map((u) => `${u.kind}/${u.namespace}/${u.name}`)).size;
    return [...by.values()];
  }, [got.items, old.items]);
  return { images, state: got.state, error: got.error };
}

const BY: Record<string, (a: ImageRow, b: ImageRow) => number> = {
  image: (a, b) => a.repository.localeCompare(b.repository),
  tag: (a, b) => a.tag.localeCompare(b.tag),
  os: (a, b) => a.os.localeCompare(b.os),
  workloads: (a, b) => a.workloads - b.workloads,
  ...Object.fromEntries(SEVERITIES.map((s) => [s, (a: ImageRow, b: ImageRow) => a.counts[s] - b.counts[s]])),
};

/** The most vulnerable first: by each severity in turn. */
export const worstFirst = (a: ImageRow, b: ImageRow) => {
  for (const s of SEVERITIES) if (a.counts[s] !== b.counts[s]) return b.counts[s] - a.counts[s];
  return a.repository.localeCompare(b.repository);
};

/** Its OS, out of support marked. */
export function Os({ os, eosl }: { os: string; eosl: boolean }) {
  const say = useSay();
  return (
    <span class="uk-line">
      {os || <span class="uk-quiet">—</span>}
      {eosl && (
        <Badge level="warn" title={say(T.vulnerabilities.eoslTip, { os })}>
          {say(T.vulnerabilities.eosl)}
        </Badge>
      )}
    </span>
  );
}

/** An image opened: what it is, its vulnerabilities, where it runs. */
function ImageOpened({ image, close }: { image: ImageRow; close: () => void }) {
  const say = useSay();
  const t = T.images;
  const report = useGet<VulnerabilityReportObject>({ kind: REF.vulnerabilities, namespace: image.report.namespace, name: image.report.name }).object?.report;
  const uses: TableColumn<Use>[] = [
    { id: 'workload', header: say(T.overview.workload), width: 'minmax(0, 1.4fr)', cell: (u) => <ObjectRef kind={u.kind} name={u.name} namespace={u.namespace} /> },
    { id: 'namespace', header: say(t.namespace), width: 'minmax(0, 1fr)', cell: (u) => u.namespace },
    { id: 'containers', header: say(t.containers), width: 'minmax(0, 1fr)', cell: (u) => <span class="uk-quiet">{u.container}</span> },
  ];
  return (
    <Modal placement="right" onClose={close} title={image.tag ? `${image.repository}:${image.tag}` : image.repository}>
      <div class="uk-stack">
        <KeyValue
          rows={[
            [say(t.os), <Os os={image.os} eosl={image.eosl} />],
            [say(t.registry), report?.registry?.server ?? '—'],
            [say(t.digest), <span class="uk-mono">{image.digest || '—'}</span>],
            [say(t.workloads), String(image.workloads)],
            [say(t.scanned), ago(report?.updateTimestamp)],
          ]}
        />
        <Section title={say(T.vulnerabilities.title)}>
          {SEVERITIES.some((s) => image.counts[s]) ? (
            <VulnerabilityTable vulnerabilities={report?.vulnerabilities ?? []} />
          ) : (
            <Nothing icon="shield">{say(T.vulnerabilities.noneIn)}</Nothing>
          )}
        </Section>
        <Section title={say(t.usedBy)}>
          <Table plain rows={image.uses} rowKey={(u) => `${u.kind}/${u.namespace}/${u.name}/${u.container}`} columns={uses} reorderable={false} />
        </Section>
      </div>
    </Modal>
  );
}

/** The page: its header (how many, a filter — in its link), each image once — set out and sorted as the user sets it, kept (the most vulnerable first at first); a name opens it. */
function ImagesPage() {
  const say = useSay();
  const t = T.images;
  const page = usePage();
  // As a kind's table's: in its link (kept, shared).
  const filter = filteredIn(page.path.value) ?? '';
  const setFilter = (value: string) => page.navigate(filterIn(page.path.peek(), value || undefined), { replace: true });
  const [opened, setOpened] = useState<string>();
  const { images, state, error } = useImages(filter);
  const open = images.find((i) => i.key === opened);
  const columns: TableColumn<ImageRow>[] = [
    {
      id: 'image',
      header: say(t.image),
      width: 'minmax(200px, 2fr)',
      sortable: true,
      cell: (i) => (
        <button type="button" class="uk-cell-link" title={i.repository} onClick={() => setOpened(i.key)}>
          {i.repository}
        </button>
      ),
    },
    { id: 'tag', header: say(T.columns.tag), width: 'minmax(90px, 1fr)', sortable: true, cell: (i) => i.tag },
    { id: 'os', header: say(t.os), width: 'minmax(130px, 1fr)', sortable: true, cell: (i) => <Os os={i.os} eosl={i.eosl} /> },
    ...SEVERITIES.map((s) => ({ id: s, header: say(T.severities[s]), width: '76px', sortable: true, cell: (i: ImageRow) => <SeverityCount severity={s} value={i.counts[s]} /> })),
    { id: 'workloads', header: say(t.workloads), width: '92px', sortable: true, cell: (i) => <span class="uk-num">{i.workloads}</span> },
  ];
  const table = useTableView(IMAGES_VIEW, columns);
  const by = table.sort && BY[table.sort.id];
  const rows = by ? [...images].sort((a, b) => (table.sort?.desc ? -1 : 1) * by(a, b)) : [...images].sort(worstFirst);
  // What is wrong with the filter, where it is (said of none of it: of all of it).
  const problems = error && filter.trim() ? [{ start: error.at?.start ?? 0, end: error.at?.end ?? filter.length, message: error.message }] : [];
  return (
    <Panel
      header={
        <PageHeader
          level={2}
          icon="packages"
          sub={<span>{say(t.images, { count: images.length })}</span>}
          end={<QueryField label={say(t.filter)} placeholder={say(t.placeholder)} value={filter} onChange={setFilter} problems={problems} code />}
        >
          {say(t.title)}
        </PageHeader>
      }
    >
      <Table rows={rows} rowKey={(i) => i.key} {...table} loading={state === 'loading'} empty={<Nothing icon="shield">{say(filter.trim() ? t.noneFound : t.none)}</Nothing>} />
      {open && <ImageOpened image={open} close={() => setOpened(undefined)} />}
    </Panel>
  );
}

/** The page's table's own TableView. */
const IMAGES_VIEW = 'trivy.images';

export function addImages(c: KubeContributor): void {
  c.add('TableView', IMAGES_VIEW, {}, { fallback: true });
  c.add('Page', 'trivy.images', {
    path: '/images',
    title: T.images.title,
    icon: 'packages',
    order: 50,
    pinned: true,
    needs: [{ verb: 'list', group: 'aquasecurity.github.io', resource: 'vulnerabilityreports' }],
  });
  c.add('Fill', 'trivy.page.images', fill(slots.page('trivy.images'), { render: () => <ImagesPage /> }));
  c.add('Slot', slots.page('trivy.images').name, {}, { fallback: true });
}
