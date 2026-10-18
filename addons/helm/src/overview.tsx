import { type KubeContributor, tile } from '@overkube/sdk';
import { usePage, useSay, useTableView } from '@overkube/sdk/preact';
import { Panel, PanelHead, Table, type TableColumn } from '@overkube/uikit';
import { PATH, releaseIn } from './page.tsx';
import { unwell } from './release.ts';
import { type ReleaseRow, useDecoded, useReleases } from './releases.ts';
import { T } from './texts.ts';
import { HelmState } from './view.tsx';

/*
 * The start's: the releases not well — failed, stuck pending — each why,
 * as helm said it; all well, no panel. Set out as the user sets it, kept.
 */

export const UNWELL_VIEW = 'helm.overview.unwell';

function Unwell() {
  const say = useSay();
  const page = usePage();
  const { releases } = useReleases();
  const bad = releases.filter((r) => unwell(r.latest.status));
  const decoded = useDecoded(bad.map((r) => ({ namespace: r.namespace, secret: r.latest.secret })));
  const columns: TableColumn<ReleaseRow>[] = [
    { id: 'release', header: say(T.columns.release), width: 'minmax(120px, 1fr)', cell: (r) => <a href={page.href(releaseIn(PATH, r.key))}>{r.name}</a> },
    { id: 'namespace', header: say(T.columns.namespace), width: 'minmax(90px, .8fr)', cell: (r) => r.namespace },
    { id: 'status', header: say(T.columns.status), width: '160px', cell: (r) => <HelmState status={r.latest.status} /> },
    {
      id: 'description',
      header: say(T.columns.description),
      width: 'minmax(160px, 2fr)',
      wrap: true,
      cell: (r) => <span class="uk-quiet">{decoded.get(`${r.namespace}/${r.latest.secret}`)?.info.description ?? ''}</span>,
    },
  ];
  const table = useTableView(UNWELL_VIEW, columns);
  if (!bad.length) return null;
  return (
    <Panel header={<PanelHead title={say(T.overview.title)} count={bad.length} more={{ label: say(T.page.title), href: page.href(PATH) }} />}>
      <Table height="none" rows={bad} rowKey={(r) => r.key} {...table} />
    </Panel>
  );
}

export function addOverview(c: KubeContributor): void {
  c.add('TableView', UNWELL_VIEW, {}, { fallback: true });
  c.add('Fill', 'helm.page.overview.unwell', tile('overview', 'main', { title: 'Helm releases', order: 120, render: Unwell }));
}
