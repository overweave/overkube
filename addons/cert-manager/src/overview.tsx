import { calendarDays, type KubeContributor, kindPath, tile } from '@overkube/sdk';
import { ObjectRef, StatusOf, useList, usePage, useSay } from '@overkube/sdk/preact';
import { Panel, PanelBody, PanelHead, Runway, type RunwayRow } from '@overkube/uikit';
import { Certificate, F, REF } from './kinds.ts';
import { leftSaid, levelOf, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * The start's: the cluster's Certificates on one time axis — 30 days back
 * to 120 ahead — the soonest end first (those not issued yet before them):
 * each a bar from now to its Not After, its days left at its end (its
 * renewal past, a warning; a week left or expired, an error); what
 * cert-manager says of it under the pointer.
 */

const SHOWN = 10;
const [FROM, TO] = [-30, 120];
const SELECT = ['core.name', 'core.namespace', F.state, F.message, F.notBefore, F.notAfter, F.renewal];

export function Certificates() {
  const say = useSay();
  const page = usePage();
  const notIssued = useList({ kind: REF.certificates, where: { op: 'not', arg: { field: F.notAfter, op: 'exists' } }, page: { limit: 5 }, select: SELECT });
  const issued = useList({ kind: REF.certificates, where: { field: F.notAfter, op: 'exists' }, sort: [{ field: F.notAfter }], page: { limit: SHOWN }, select: SELECT });
  const items = [...notIssued.items, ...issued.items].slice(0, SHOWN);
  if (!items.length) return null;
  const now = Date.now();
  const time = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString() : undefined);
  const rows: RunwayRow[] = items.map((i) => {
    const v = i.values ?? {};
    const state = String(v[F.state] ?? '');
    const span = spanOf(time(v[F.notBefore]), time(v[F.notAfter]), time(v[F.renewal]), now);
    return {
      key: i.key,
      lead: (
        <>
          <StatusOf kind={Certificate} words={state} mark />
          <ObjectRef kind={Certificate.id} name={String(v['core.name'])} namespace={String(v['core.namespace'])} quiet />
          <span class="uk-quiet">{String(v['core.namespace'])}</span>
        </>
      ),
      // Not issued: its state alone (its issuance failed: an error).
      ...(span
        ? { at: calendarDays(span.till, now), said: leftSaid(say, span), level: levelOf(span) }
        : { said: state, ...(state === 'Failed' ? { level: 'error' as const } : {}) }),
      title: String(v[F.message] ?? '') || state,
    };
  });
  const count = (notIssued.total?.count ?? 0) + (issued.total?.count ?? 0);
  return (
    <Panel header={<PanelHead title={say(T.overview.title)} count={count} more={{ label: say(T.overview.title), href: page.href(kindPath(Certificate)) }} />}>
      <PanelBody>
        <Runway from={FROM} to={TO} ticks={[0, 30, 60, 90, 120].map((at) => ({ at, label: at ? say(T.days.left, { days: at }) : say(T.overview.now) }))} rows={rows} />
      </PanelBody>
    </Panel>
  );
}

export function addOverview(c: KubeContributor): void {
  c.add('Fill', 'cert-manager.page.overview.certificates', tile('overview', 'main', { title: 'Certificates', order: 160, render: Certificates }));
}
