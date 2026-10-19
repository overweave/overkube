import { kinds } from '@overkube/kube-types';
import { filteredIn, type KubeContributor, slots } from '@overkube/sdk';
import { fill, KindFilter, usePage, useSay, useTableView } from '@overkube/sdk/preact';
import { Nothing, PageHeader, Panel, Table, type TableColumn } from '@overkube/uikit';
import { unwell } from './release.ts';
import { type ReleaseRow, useDecoded, useReleases } from './releases.ts';
import { T } from './texts.ts';
import { ago, HelmState, ReleaseOpened } from './view.tsx';

/*
 * The addon's page, Helm: every release helm keeps (of the namespaces
 * shown), as helm list --all says it — its chart and version, its app
 * version, its state, its revision, when it changed; those not well first
 * (failed, pending). Filtered as a kind's table is (its Secrets' fields:
 * release, status, revision — CEL, in its link), set out and sorted as the
 * user sets it, kept; one
 * opened by its name (in the page's link: release=namespace/name).
 */

export const PATH = '/helm';
export const RELEASES_VIEW = 'helm.releases';

/** The release a path opens (namespace/name); none: none. */
export const openedIn = (path: string) => {
  const raw = (path.split('?')[1] ?? '').split('&').find((p) => p.startsWith('release='));
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw.slice('release='.length)) || undefined;
  } catch {
    // Not one to be read: none opened.
    return undefined;
  }
};

/** A path opening a release (none: closing it). */
export function releaseIn(path: string, key: string | undefined): string {
  const [where = '', query = ''] = path.split('?');
  const rest = query.split('&').filter((p) => p && !p.startsWith('release='));
  const all = [...rest, ...(key ? [`release=${encodeURIComponent(key)}`] : [])];
  return all.length ? `${where}?${all.join('&')}` : where;
}

/** The newest first; those not well first of all. */
const worstFirst = (a: ReleaseRow, b: ReleaseRow) => Number(unwell(b.latest.status)) - Number(unwell(a.latest.status)) || b.latest.modified - a.latest.modified;

function ReleasesPage() {
  const say = useSay();
  const page = usePage();
  const t = T.page;
  const filter = filteredIn(page.path.value) ?? '';
  const { releases, state } = useReleases(filter);
  const decoded = useDecoded(releases.map((r) => ({ namespace: r.namespace, secret: r.latest.secret })));
  const chartOf = (r: ReleaseRow) => decoded.get(`${r.namespace}/${r.latest.secret}`)?.chart.metadata;
  const opened = openedIn(page.path.value);
  const open = releases.find((r) => r.key === opened);
  const set = (key: string | undefined) => page.navigate(releaseIn(page.path.peek(), key), { replace: !key });
  const columns: TableColumn<ReleaseRow>[] = [
    {
      id: 'release',
      header: say(T.columns.release),
      width: 'minmax(140px, 1.2fr)',
      sortable: true,
      cell: (r) => (
        <button type="button" class="uk-cell-link" onClick={() => set(r.key)}>
          {r.name}
        </button>
      ),
    },
    { id: 'namespace', header: say(T.columns.namespace), width: 'minmax(100px, 1fr)', sortable: true, cell: (r) => r.namespace },
    { id: 'chart', header: say(T.columns.chart), width: 'minmax(120px, 1fr)', sortable: true, cell: (r) => chartOf(r)?.name ?? '' },
    { id: 'version', header: say(T.columns.version), width: '100px', cell: (r) => <span class="uk-mono">{chartOf(r)?.version ?? ''}</span> },
    { id: 'app', header: say(T.columns.appVersion), width: '110px', cell: (r) => <span class="uk-mono">{chartOf(r)?.appVersion ?? ''}</span> },
    {
      id: 'status',
      header: say(T.columns.status),
      width: '160px',
      sortable: true,
      cell: (r) => <HelmState status={r.latest.status} title={decoded.get(`${r.namespace}/${r.latest.secret}`)?.info.description} />,
    },
    { id: 'revision', header: say(T.columns.revision), width: '90px', sortable: true, cell: (r) => <span class="uk-num">{r.latest.version}</span> },
    { id: 'updated', header: say(T.columns.updated), width: '100px', sortable: true, cell: (r) => ago(r.latest.modified) },
  ];
  const table = useTableView(RELEASES_VIEW, columns);
  const BY: Record<string, (a: ReleaseRow, b: ReleaseRow) => number> = {
    release: (a, b) => a.name.localeCompare(b.name),
    namespace: (a, b) => a.namespace.localeCompare(b.namespace),
    chart: (a, b) => (chartOf(a)?.name ?? '').localeCompare(chartOf(b)?.name ?? ''),
    status: (a, b) => a.latest.status.localeCompare(b.latest.status),
    revision: (a, b) => a.latest.version - b.latest.version,
    updated: (a, b) => a.latest.modified - b.latest.modified,
  };
  const shown = releases;
  const by = table.sort && BY[table.sort.id];
  const rows = by ? [...shown].sort((a, b) => (table.sort?.desc ? -1 : 1) * by(a, b)) : [...shown].sort(worstFirst);
  return (
    <Panel
      header={
        <PageHeader
          level={2}
          icon="helm"
          sub={<span>{say(t.count, { count: releases.length })}</span>}
          end={<KindFilter kind={kinds.core.v1.Secret} placeholder={t.placeholder} />}
        >
          {say(t.heading)}
        </PageHeader>
      }
    >
      <Table rows={rows} rowKey={(r) => r.key} {...table} loading={state === 'loading'} empty={<Nothing icon="helm">{say(filter.trim() ? t.noneFound : t.none)}</Nothing>} />
      {open && <ReleaseOpened key={open.key} row={open} close={() => set(undefined)} />}
    </Panel>
  );
}

export function addPage(c: KubeContributor): void {
  c.add('TableView', RELEASES_VIEW, {}, { fallback: true });
  // Under Delivery (the core's: how what runs got there, Flux's beside it), kept at hand.
  c.add('Page', 'helm.releases', { path: PATH, title: T.page.title, icon: 'helm', order: 10, pinned: true, category: 'delivery', needs: [{ verb: 'list', resource: 'secrets' }] });
  c.add('Fill', 'helm.page.releases', fill(slots.page('helm.releases'), { render: () => <ReleasesPage /> }));
  c.add('Slot', slots.page('helm.releases').name, {}, { fallback: true });
}
