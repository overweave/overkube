import type { KindInfo } from '@overkube/kube-types';
import { type KubeContributor, openIn, tile } from '@overkube/sdk';
import { useList, usePage, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Panel, PanelHead, Status, Table } from '@overkube/uikit';
import { FLUX, ref, STATE } from './kinds.ts';
import { FluxState, notReady, type State, stateOf, text } from './state.tsx';
import { T } from './texts.ts';

/*
 * The start's: what of Flux's is not Ready — failing first, then those on
 * their way — each its kind, its state, Flux's words; how many are Ready
 * and Suspended beside. All Ready: no panel. Each kind served asked once
 * (its state's fields alone; its objects watched whole, as any list's), none
 * asked of one not served.
 */

interface Row {
  kind: KindInfo;
  name: string;
  namespace: string;
  state: State;
}

/** One kind's objects' states (none: not served). */
function useStates(kind: KindInfo, served: boolean): Row[] {
  const got = useList(served ? { kind: ref(kind), page: { limit: 10_000 }, select: ['core.name', 'core.namespace', ...STATE] } : undefined);
  return got.items.map((i) => ({ kind, name: text(i.values?.['core.name']), namespace: text(i.values?.['core.namespace']), state: stateOf(STATE.map((f) => i.values?.[f])) }));
}

function NotReady() {
  const say = useSay();
  const page = usePage();
  const { kinds } = useServedKinds();
  // The same kinds, in the same order, every time: a hook each.
  const rows = FLUX.flatMap((k) => useStates(k, kinds.has(k.id)));
  const bad = rows.filter((r) => notReady(r.state)).sort((a, b) => Number(b.state.ready === 'False') - Number(a.state.ready === 'False') || a.name.localeCompare(b.name));
  if (!bad.length) return null;
  const ready = rows.filter((r) => r.state.ready === 'True' && !r.state.suspended).length;
  const suspended = rows.filter((r) => r.state.suspended).length;
  return (
    <Panel
      header={
        <PanelHead
          title={say(T.overview.title)}
          count={bad.length}
          tools={
            <span class="uk-line">
              <Status tone="ok" icon="circle-check">
                {say(T.overview.ready, { count: ready })}
              </Status>
              {suspended > 0 && (
                <Status tone="warn" icon="pause">
                  {say(T.overview.suspended, { count: suspended })}
                </Status>
              )}
            </span>
          }
        />
      }
    >
      <Table
        height="none"
        rows={bad}
        rowKey={(r) => `${r.kind.id}/${r.namespace}/${r.name}`}
        columns={[
          {
            id: 'name',
            header: say(T.columns.name),
            width: 'minmax(160px, 1fr)',
            cell: (r) => (
              <span class="uk-line">
                <a href={page.href(openIn(`/k/${ref(r.kind)}`, r.kind, { metadata: { name: r.name, namespace: r.namespace } }))}>{r.name}</a>
                <span class="uk-quiet">{r.kind.kind}</span>
              </span>
            ),
          },
          { id: 'namespace', header: say(T.columns.namespace), width: '120px', cell: (r) => r.namespace },
          { id: 'status', header: say(T.columns.status), width: '190px', cell: (r) => <FluxState {...r.state} /> },
          { id: 'message', header: say(T.columns.message), width: 'minmax(200px, 2.4fr)', wrap: true, cell: (r) => <span class="uk-quiet">{r.state.message}</span> },
        ]}
      />
    </Panel>
  );
}

export function addOverview(c: KubeContributor): void {
  c.add('Fill', 'flux.page.overview.not-ready', tile('overview', 'main', { title: 'Flux', order: 110, render: NotReady }));
}
