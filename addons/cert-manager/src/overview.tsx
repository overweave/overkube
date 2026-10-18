import { type KubeContributor, kindPath, shortTime, tile } from '@overkube/sdk';
import { ObjectRef, StatusOf, useList, usePage, useSay, useTableView } from '@overkube/sdk/preact';
import { LifetimeCell, type LifetimeSpan, Panel, PanelHead, Table, type TableColumn } from '@overkube/uikit';
import { Certificate, F, REF } from './kinds.ts';
import { leftSaid, levelOf, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * The start's: the cluster's Certificates as a table, as the core's panels
 * are — those not issued first, then the soonest end first: each its state
 * in cert-manager's words (what it says of it, in its tip), its lifetime
 * in a cell (its days left; its renewal past, a warning; a week left or
 * expired, an error), its issuer. Set out and sorted as the user sets it,
 * kept — of those it shows (the not issued and the soonest ends: a panel,
 * not the Certificates' table).
 */

const SHOWN = 10;
const SELECT = ['core.name', 'core.namespace', F.state, F.message, F.notBefore, F.notAfter, F.renewal, F.issuer];

/** Its table's own TableView. */
export const CERTIFICATES_VIEW = 'cert-manager.overview.certificates';

interface Row {
  key: string;
  name: string;
  namespace: string;
  state: string;
  message: string;
  issuer: string;
  span: LifetimeSpan | undefined;
}

const BY: Record<string, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  namespace: (a, b) => a.namespace.localeCompare(b.namespace),
  ready: (a, b) => a.state.localeCompare(b.state),
  expires: (a, b) => (a.span?.till ?? 0) - (b.span?.till ?? 0),
  issuer: (a, b) => a.issuer.localeCompare(b.issuer),
};

export function Certificates() {
  const say = useSay();
  const page = usePage();
  const notIssued = useList({ kind: REF.certificates, where: { op: 'not', arg: { field: F.notAfter, op: 'exists' } }, page: { limit: SHOWN }, select: SELECT });
  const issued = useList({ kind: REF.certificates, where: { field: F.notAfter, op: 'exists' }, sort: [{ field: F.notAfter }], page: { limit: SHOWN }, select: SELECT });
  const columns: TableColumn<Row>[] = [
    {
      id: 'name',
      header: say(T.overview.certificate),
      width: 'minmax(140px, 1.4fr)',
      sortable: true,
      cell: (r) => <ObjectRef kind={Certificate.id} name={r.name} namespace={r.namespace} quiet />,
    },
    { id: 'namespace', header: say(T.overview.namespace), width: 'minmax(90px, 1fr)', sortable: true, cell: (r) => r.namespace },
    {
      id: 'ready',
      header: say(T.columns.ready),
      width: '120px',
      sortable: true,
      cell: (r) => <StatusOf kind={Certificate} words={r.state} {...(r.message ? { title: r.message } : {})} />,
    },
    {
      id: 'expires',
      header: say(T.columns.expires),
      width: '150px',
      sortable: true,
      cell: (r) =>
        r.span ? (
          <LifetimeCell {...r.span} level={levelOf(r.span)} said={leftSaid(say, r.span)} title={`${say(T.times.notAfter)} ${shortTime(r.span.till)}`} />
        ) : (
          <span class="uk-quiet">—</span>
        ),
    },
    { id: 'issuer', header: say(T.columns.issuer), width: 'minmax(90px, 1fr)', sortable: true, cell: (r) => <span class="uk-quiet">{r.issuer}</span> },
  ];
  const table = useTableView(CERTIFICATES_VIEW, columns);
  const now = Date.now();
  const time = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString() : undefined);
  const rows: Row[] = [...notIssued.items, ...issued.items].map((i) => {
    const v = i.values ?? {};
    return {
      key: i.key,
      name: String(v['core.name']),
      namespace: String(v['core.namespace']),
      state: String(v[F.state] ?? ''),
      message: String(v[F.message] ?? ''),
      issuer: String(v[F.issuer] ?? ''),
      span: spanOf(time(v[F.notBefore]), time(v[F.notAfter]), time(v[F.renewal]), now),
    };
  });
  if (!rows.length) return null;
  const by = table.sort && BY[table.sort.id];
  // Sorted by when they end: those not issued last, either way (as a kind's table has them).
  const last = (r: Row) => table.sort?.id === 'expires' && !r.span;
  const shown = (by ? [...rows].sort((a, b) => Number(last(a)) - Number(last(b)) || (table.sort?.desc ? -1 : 1) * by(a, b)) : rows).slice(0, SHOWN);
  const count = (notIssued.total?.count ?? 0) + (issued.total?.count ?? 0);
  return (
    <Panel header={<PanelHead title={say(T.overview.title)} count={count} more={{ label: say(T.overview.title), href: page.href(kindPath(Certificate)) }} />}>
      <Table height="none" rows={shown} rowKey={(r) => r.key} {...table} />
    </Panel>
  );
}

export function addOverview(c: KubeContributor): void {
  c.add('TableView', CERTIFICATES_VIEW, {}, { fallback: true });
  c.add('Fill', 'cert-manager.page.overview.certificates', tile('overview', 'main', { title: 'Certificates', order: 160, render: Certificates }));
}
