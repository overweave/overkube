import type { StatusAnswer } from '@overkube/gateway/protocol';
import { type KindInfo, kinds } from '@overkube/kube-types';
import { type CountResult, canonical, type Item, type Result, type Value, type Where } from '@overkube/query';
import { humanDuration, KindView, type KubeContributor, kindPath, kindRef, lookOf, openIn, type PageProps, type Say, StatusLook, slots } from '@overkube/sdk';
import { fill, StatusOf, useAddons, useCluster, useCount, useGet, useList, usePage, useSay, useTableView, useUser } from '@overkube/sdk/preact';
import {
  Badge,
  Board,
  BoardColumns,
  Button,
  Checklist,
  Chosen as ChosenTokens,
  Gauge,
  Nothing,
  Notice,
  Panel,
  PanelBody,
  PanelHead,
  Popover,
  Ratio,
  Row,
  Rows,
  Segmented,
  Skeleton,
  Status,
  Table,
  type TableColumn,
  Tile,
  Tiles,
  type Tone,
} from '@overkube/uikit';
import { slotElement, useDefinition, useDefinitions } from '@overweave/ui/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Since } from './details.tsx';
import { bytes, cores, EMPTY } from './format.ts';
import { KindTitle } from './headers.tsx';
import { type Chosen, scopeOf } from './namespaces.tsx';
import { RefusedQuietly, refused } from './refused.tsx';
import { T } from './texts.ts';

/*
 * The start (page.overview): what the cluster is like at a glance, then
 * what to look at. Its regions, each a slot others fill too: header (in the
 * cluster's panel's head), tiles (the core's: a tile per usual kind —
 * how many as they should be of how many, the rest by kubectl's words), main
 * (the core's: what is unhealthy, what is rolling out, recent events), side
 * (the core's: the cluster, capacity, the nodes, the namespaces); in
 * the core's panels, health (under the cluster's: an alert manager's)
 * and capacity (under the cluster's: a metrics server's). Of the namespaces
 * chosen in the page's header (none: all); capacity and the nodes, the
 * whole cluster's. All of it asked as queries (counts by a field, sums,
 * windows of objects), answered live.
 */

const { Pod, Node, Event, Namespace, Service, PersistentVolumeClaim } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job } = kinds.batch.v1;

const region = (name: string) => slots.page('overview', name);
const one = (v: Value | readonly Value[] | null | undefined): Value | undefined => (Array.isArray(v) ? (v as readonly Value[])[0] : ((v ?? undefined) as Value | undefined));
const text = (v: Value | readonly Value[] | null | undefined): string => String(one(v) ?? '');
const timeOf = (v: Value | readonly Value[] | null | undefined): string | undefined => {
  const at = one(v);
  return typeof at === 'number' ? new Date(at).toISOString() : typeof at === 'string' ? at : undefined;
};

/** An answer of a kind the cluster does not serve (no batch API): nothing to say of it, no refusal either. */
const absent = (r: Result) => r.error?.code === 'not_served';

/**
 * What could not be read of what a panel says: each kind refused (why,
 * under the pointer), each read only in part (the namespaces refused) — so
 * that what it says is said of the rest only, never more.
 */
function Refusals({ answers }: { answers: readonly (readonly [KindInfo, Result])[] }) {
  const say = useSay();
  const said = answers.filter(([, r]) => (refused(r) && !absent(r)) || r.state === 'partial');
  if (!said.length) return null;
  return (
    <div class="uk-board-refusals">
      {said.map(([kind, r]) =>
        r.state === 'partial' ? (
          <span key={kind.id} class="uk-quiet">
            {kind.plural}: {say(T.kind.table.partial, { namespaces: r.coverage.denied.join(', ') })}
          </span>
        ) : (
          <RefusedQuietly key={kind.id} kind={kind} error={r.error} />
        ),
      )}
    </div>
  );
}

/** A part of a whole as a percentage, whole (none of a whole: 0). */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** The tones that are as a thing should be: running, done, on its way (a job running, a rollout going). */
const WELL: ReadonlySet<Tone> = new Set(['ok', 'done', 'progress']);

/** The page itself: the tiles, the two columns (each region another's to fill too). */
export function Dashboard(props: PageProps) {
  return (
    <Board>
      {slotElement(region('notices'), props)}
      {slotElement(region('tiles'), props)}
      <BoardColumns wide={slotElement(region('main'), props)} narrow={slotElement(region('side'), props)} />
    </Board>
  );
}

/**
 * Addons that are off but would answer here (one of what they answer to
 * found, and not put off): each a notice — what was found and where, what
 * the addon does; turned on, or not now — the user's word, kept as theirs.
 */
export function Suggested() {
  const say = useSay();
  const user = useUser();
  const addons = useAddons();
  const t = T.page.overview.suggested;
  return (
    <>
      {(addons?.statuses.value ?? [])
        .filter((a) => a.suggested)
        .map((addon) => {
          const found = addon.answers.find((a) => a.found === true);
          const about = addon.description ?? '';
          return (
            <Notice
              key={addon.id}
              icon="puzzle"
              title={say(t.title, { what: found?.title ?? addon.title })}
              action={
                <>
                  <Button variant="primary" onClick={() => user.patch('AddonChoices', 'default', { on: { [addon.id]: true } })}>
                    {say(t.turnOn, { addon: addon.title })}
                  </Button>
                  <Button variant="ghost" onClick={() => user.patch('AddonChoices', 'default', { notNow: { [addon.id]: true } })}>
                    {say(t.notNow)}
                  </Button>
                </>
              }
            >
              {found?.where ? say(t.where, { where: found.where, about }) : about}
            </Notice>
          );
        })}
    </>
  );
}

/** Which distribution a version says it is of (v1.33.1+k3s1: k3s; v1.35.7+kubesolo-v1.2.1: KubeSolo v1.2.1), if it says. */
export function distroOf(version: string): string | undefined {
  const marks: [RegExp, string][] = [
    [/\+k3s/, 'k3s'],
    [/kubesolo/, 'KubeSolo'],
    [/\+rke2/, 'RKE2'],
    [/-eks-/, 'EKS'],
    [/-gke\./, 'GKE'],
    [/k0s/, 'k0s'],
    [/microk8s/, 'MicroK8s'],
  ];
  const name = marks.find(([re]) => re.test(version))?.[1];
  const own = /-(v\d[\w.]*)$/.exec(version.split('+')[1] ?? '')?.[1];
  return name && own ? `${name} ${own}` : name;
}

/** How often the gateway's status is asked again: while the API server is not reachable (a cluster starting), and while it is. */
const STATUS_DOWN_MS = 5000;
const STATUS_UP_MS = 30_000;

/** The gateway's status (the API server reachable, its version) — or why it could not be had (the gateway not reached: the API server not either, as far as the page knows); asked again every few seconds while it is not reachable, now and then while it is. */
function useStatus(): StatusAnswer | undefined {
  const cluster = useCluster();
  const [status, setStatus] = useState<StatusAnswer>();
  useEffect(() => {
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus(undefined);
    const ask = () => {
      cluster.status(stop.signal).then(
        (answer) => {
          if (stop.signal.aborted) return;
          setStatus(answer);
          timer = setTimeout(ask, answer.kube.reachable ? STATUS_UP_MS : STATUS_DOWN_MS);
        },
        (e: unknown) => {
          // Gone (another cluster, the page left): nothing to say.
          if (stop.signal.aborted) return;
          setStatus({ version: '', kube: { reachable: false, error: { code: 'network' as never, message: e instanceof Error ? e.message : String(e) } } });
          timer = setTimeout(ask, STATUS_DOWN_MS);
        },
      );
    };
    ask();
    return () => {
      stop.abort();
      clearTimeout(timer);
    };
  }, [cluster]);
  return status;
}

// ── Tiles ───────────────────────────────────────────────────────────────────

/** A tile: a kind, the field its states are counted by (a service's: its type — no state). */
const TILES: [KindInfo, string][] = [
  [Node, 'nodes.v1.status'],
  [Pod, 'pods.v1.status'],
  [Deployment, 'deployments.v1.apps.health'],
  [StatefulSet, 'statefulsets.v1.apps.health'],
  [DaemonSet, 'daemonsets.v1.apps.health'],
  [Job, 'jobs.v1.batch.status'],
  [PersistentVolumeClaim, 'persistentvolumeclaims.v1.status'],
  [Service, '.spec.type'],
];

/** The tiles (core.page.overview.tiles). */
export function OverviewTiles({ chosen }: { chosen: Chosen }) {
  return (
    <Panel>
      <Tiles>
        {TILES.map(([kind, field]) => (
          <KindTile key={kind.id} kind={kind} field={field} chosen={chosen} />
        ))}
      </Tiles>
    </Panel>
  );
}

/** A kind's tile (its name and icon as its KindView says them; one the cluster does not serve: none): how many as they should be (running, done, on its way) of how many — the rest said by kubectl's words, the whole split in a ring beside; a click, its page. */
function KindTile({ kind, field, chosen }: { kind: KindInfo; field: string; chosen: Chosen }) {
  const say = useSay();
  const page = usePage();
  const looks = useDefinitions(StatusLook);
  const view = useDefinition(KindView, kind.id)?.spec;
  const icon = view?.icon;
  const scope = scopeOf(kind, undefined, chosen.value);
  const count = useCount({ kind: kindRef(kind), ...(scope ? { scope } : {}), groupBy: field, top: 8 });
  const parts = partsOf(count, kind, looks, say(T.page.overview.tiles.other));
  const stated = kind !== Service;
  const well = parts.filter((p) => WELL.has(p.tone)).reduce((n, p) => n + p.count, 0);
  const rest = parts.filter((p) => !WELL.has(p.tone));
  const level = rest.some((p) => p.tone === 'error') ? 'error' : rest.length ? 'warn' : undefined;
  // A kind the cluster does not serve (no batch API), or one not listed (hidden: the one signed in may list it nowhere): no tile.
  if (absent(count) || view?.hidden) return null;
  // Under its number, a line kept either way: the rest, else those as they should be.
  const note = refused(count) ? <RefusedQuietly kind={kind} error={count.error} /> : (stated && rest.length ? rest : parts).map((p) => `${p.count} ${p.label}`).join(' · ') || ' ';
  const total = count.total?.count;
  return (
    <Tile
      {...(icon ? { icon } : {})}
      title={<KindTitle kind={kind} />}
      loading={count.state === 'loading'}
      value={stated ? well : total}
      {...(stated && total !== undefined ? { total } : {})}
      {...(stated && level ? { level } : {})}
      note={note}
      {...(stated ? { parts } : {})}
      onClick={() => page.navigate(kindPath(kind))}
    />
  );
}

/** A count's groups as parts: each its value's look's tone (none: as a state not known), the rest past top as one. */
function partsOf(count: CountResult, kind: KindInfo, looks: Parameters<typeof lookOf>[0], other: string): { tone: Tone; count: number; label: string }[] {
  const parts = (count.groups ?? []).map((g) => {
    const label = g.value === null ? EMPTY : String(g.value);
    return { tone: (g.value === null ? 'unknown' : (lookOf(looks, kind, label)?.tone ?? (kind === Service ? 'done' : 'unknown'))) as Tone, count: g.count, label };
  });
  return count.rest ? [...parts, { tone: 'unknown' as Tone, count: count.rest, label: other }] : parts;
}

// ── Unhealthy ───────────────────────────────────────────────────────────────

/**
 * Pods unhealthy: not running, not done — nor on their way (being made,
 * started, their init containers at work: Init:N/M, the only states with a
 * "/"), nor going. Asked of the cluster so (not left out after: a window of
 * pods on their way would hide those failing).
 */
const UNHEALTHY_PODS: Where = {
  op: 'and',
  args: [
    { op: 'not', arg: { field: 'pods.v1.status', op: 'in', values: ['Running', 'Completed', 'Succeeded', 'ContainerCreating', 'PodInitializing', 'Terminating'] } },
    { op: 'not', arg: { field: 'pods.v1.status', op: 'contains', value: '/' } },
  ],
};

/** A failing condition's message (the first of those False): why a workload is as it is. */
const FALSE_MESSAGE = '.status.conditions[?(@.status=="False")].message';
const READY_MESSAGE = '.status.conditions[?(@.type=="Ready")].message';
const FAILED_MESSAGE = '.status.conditions[?(@.type=="Failed")].message';
const WAITING = '.status.containerStatuses[*].state.waiting.message';
const EXIT = '.status.containerStatuses[*].state.terminated.exitCode';

type Values = Readonly<Record<string, Value | readonly Value[] | null>>;
type Why = (v: Values, say: Say) => string;

/** What is unhealthy, by kind: where its state field says so; the paths to why, and why of them. */
const UNHEALTHY: [KindInfo, string, Where, string[], Why][] = [
  // Not Ready (a node cordoned, Ready still: as meant — drained for its upkeep).
  [
    Node,
    'nodes.v1.status',
    { op: 'not', arg: { field: 'nodes.v1.status', op: 'in', values: ['Ready', 'Ready,SchedulingDisabled'] } },
    [READY_MESSAGE],
    (v) => text(v[READY_MESSAGE]),
  ],
  [
    Pod,
    'pods.v1.status',
    UNHEALTHY_PODS,
    // Waiting: why; ended: its exit code; else a condition's (Unschedulable).
    [WAITING, EXIT, FALSE_MESSAGE],
    (v, say) => {
      const code = one(v[EXIT]);
      return text(v[WAITING]) || (code !== undefined && code !== 0 ? say(T.page.overview.unhealthy.exitCode, { code: String(code) }) : '') || text(v[FALSE_MESSAGE]);
    },
  ],
  ...([Deployment, StatefulSet, DaemonSet] as const).map((k): [KindInfo, string, Where, string[], Why] => [
    k,
    `${kindRef(k)}.health`,
    { field: `${kindRef(k)}.health`, op: 'in', values: ['Degraded', 'ReplicaFailure'] },
    [FALSE_MESSAGE],
    (v) => text(v[FALSE_MESSAGE]),
  ]),
  [Job, 'jobs.v1.batch.status', { field: 'jobs.v1.batch.status', op: 'in', values: ['Failed', 'FailureTarget'] }, [FAILED_MESSAGE], (v) => text(v[FAILED_MESSAGE])],
  [PersistentVolumeClaim, 'persistentvolumeclaims.v1.status', { field: 'persistentvolumeclaims.v1.status', op: 'in', values: ['Pending', 'Lost'] }, [], () => ''],
];

/** The unhealthy's table's own TableView (a table of no one kind: named for itself). */
export const UNHEALTHY_VIEW = 'core.overview.unhealthy';

/** At most so many of each kind looked at, so many shown. */
const LOOKED = 20;
const SHOWN = 8;

interface Problem {
  kind: KindInfo;
  name: string;
  namespace?: string;
  state: string;
  tone: Tone;
  why?: string;
  since?: string;
}

const RANK: Record<Tone, number> = { error: 0, unknown: 1, warn: 2, waiting: 3, progress: 4, gone: 5, ok: 6, done: 7 };

/** Unhealthy (core.page.overview.unhealthy): the worst first (failing, not known — lost, needing a look, waiting), newest first among them; each its state's mark, the object (a link), kubectl's word, why. None: said so. */
export function Unhealthy({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const page = usePage();
  const t = T.page.overview.unhealthy;
  const looks = useDefinitions(StatusLook);
  const answers = UNHEALTHY.map(([kind, field, where, paths, why]) => {
    const scope = scopeOf(kind, undefined, chosen.value);
    // One query for each kind of a fixed list, always in its order (hooks the same each time drawn).
    return [
      kind,
      field,
      why,
      useList({
        kind: kindRef(kind),
        ...(scope ? { scope } : {}),
        where,
        sort: [{ field: 'core.created', desc: true }],
        page: { limit: LOOKED },
        select: ['core.name', 'core.namespace', 'core.created', field, ...paths],
      }),
    ] as const;
  });
  // Drawn once every kind has answered (not row by row as each comes: rows moving about).
  const loading = answers.some(([, , , a]) => a.state === 'loading');
  // How many in all (each kind's, not the window looked at); what could not be read, said.
  const count = answers.reduce((n, [, , , a]) => n + (a.total?.count ?? a.items.length), 0);
  const refusals = answers.map(([kind, , , a]) => [kind, a] as const);
  const unsure = refusals.some(([, a]) => (refused(a) && !absent(a)) || a.state === 'partial');
  const problems = answers
    .flatMap(([kind, field, why, a]) =>
      a.items.map((i: Item): Problem => {
        const state = text(i.values?.[field]);
        const namespace = text(i.values?.['core.namespace']);
        const said = why(i.values ?? {}, say);
        const since = timeOf(i.values?.['core.created']);
        return {
          kind,
          name: text(i.values?.['core.name']),
          ...(namespace ? { namespace } : {}),
          state,
          tone: lookOf(looks, kind, state)?.tone ?? 'unknown',
          ...(said ? { why: said } : {}),
          ...(since ? { since } : {}),
        };
      }),
    )
    // Not a trouble: on its way (ContainerCreating), going (Terminating); not known (a node's Unknown: lost), one.
    .filter((p) => p.tone !== 'progress' && p.tone !== 'gone' && !WELL.has(p.tone))
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || (b.since ?? '').localeCompare(a.since ?? ''));
  const columns: TableColumn<Problem>[] = [
    { id: 'name', header: say(t.name), width: 'minmax(160px, 1.4fr)', sortable: true, cell: (p) => <ObjectName kind={p.kind} name={p.name} namespace={p.namespace} /> },
    { id: 'kind', header: say(t.kind), width: '100px', sortable: true, cell: (p) => <Badge>{p.kind.kind}</Badge> },
    { id: 'namespace', header: say(t.namespace), width: 'minmax(90px, .8fr)', sortable: true, cell: (p) => p.namespace ?? EMPTY },
    { id: 'status', header: say(t.status), width: '140px', sortable: true, cell: (p) => <StatusOf kind={p.kind} words={p.state} /> },
    { id: 'error', header: say(t.error), width: 'minmax(180px, 2fr)', wrap: true, cell: (p) => (p.why ? <span class="uk-quiet">{p.why}</span> : EMPTY) },
    { id: 'age', header: say(t.age), width: '52px', sortable: true, cell: (p) => (p.since ? <Since time={p.since} /> : EMPTY) },
  ];
  const by: Record<string, (p: Problem) => string> = {
    name: (p) => p.name,
    kind: (p) => p.kind.kind,
    namespace: (p) => p.namespace ?? '',
    status: (p) => p.state,
    age: (p) => p.since ?? '',
  };
  // As the user sets it out, kept (its own TableView): a column's width, the columns' order, a sort (none: the worst first).
  const table = useTableView(UNHEALTHY_VIEW, columns);
  const sort = table.sort;
  const sorted = sort && by[sort.id] ? [...problems].sort((a, b) => (sort.desc ? -1 : 1) * by[sort.id](a).localeCompare(by[sort.id](b))) : problems;
  return (
    <Panel header={<PanelHead title={say(t.title)} {...(loading ? {} : { count })} />}>
      {!loading && <Refusals answers={refusals} />}
      {loading ? (
        <PanelBody>
          <Loading />
        </PanelBody>
      ) : problems.length === 0 ? (
        // None found: all well — unless some could not be read (then nothing said of them).
        unsure ? null : (
          <PanelBody>
            <Nothing icon="circle-check">{say(t.none)}</Nothing>
          </PanelBody>
        )
      ) : (
        <Table
          height="none"
          rows={sorted.slice(0, SHOWN)}
          rowKey={(p) => `${p.kind.id}/${p.namespace ?? ''}/${p.name}`}
          {...table}
          onRowClick={(p) => page.navigate(openIn('/', p.kind, { metadata: { name: p.name, ...(p.namespace ? { namespace: p.namespace } : {}) } }))}
        />
      )}
    </Panel>
  );
}

/** An object's name, a link opening it (cut short when long: in full under the pointer). */
function ObjectName({ kind, name, namespace }: { kind: KindInfo; name: string; namespace?: string | undefined }) {
  const page = usePage();
  return (
    <a class="uk-board-name" href={page.href(openIn('/', kind, { metadata: { name, ...(namespace ? { namespace } : {}) } }))}>
      {name}
    </a>
  );
}

/** An object on a line: its name (opening it), its kind, its namespace. */
function ObjectLead({ kind, name, namespace }: { kind: KindInfo; name: string; namespace?: string | undefined }) {
  const page = usePage();
  return (
    <span class="uk-board-object">
      <a href={page.href(openIn('/', kind, { metadata: { name, ...(namespace ? { namespace } : {}) } }))}>{name}</a>
      <Badge>{kind.kind}</Badge>
      {namespace && <span class="uk-quiet">{namespace}</span>}
    </span>
  );
}

function Loading() {
  return (
    <div class="uk-board-loading">
      <Skeleton width="70%" />
      <Skeleton width="55%" />
    </div>
  );
}

// ── Rolling out ─────────────────────────────────────────────────────────────

/** Rolling out (core.page.overview.rolling): deployments and stateful sets progressing — updated of desired, why. None: nothing drawn. */
export function RollingOut({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const t = T.page.overview.rolling;
  const why = '.status.conditions[?(@.type=="Progressing")].message';
  const of = (kind: KindInfo) => {
    const ref = kindRef(kind);
    const scope = scopeOf(kind, undefined, chosen.value);
    return [
      kind,
      ref,
      {
        kind: ref,
        ...(scope ? { scope } : {}),
        where: { field: `${ref}.health`, op: 'eq' as const, value: 'Progressing' },
        page: { limit: SHOWN },
        select: ['core.name', 'core.namespace', `${ref}.updated`, `${ref}.desired`, why],
      },
    ] as const;
  };
  const [d, s] = [of(Deployment), of(StatefulSet)];
  const deployments = useList(d[2]);
  const sets = useList(s[2]);
  const rows = [...deployments.items.map((i) => [d[0], d[1], i] as const), ...sets.items.map((i) => [s[0], s[1], i] as const)];
  if (!rows.length) return null;
  return (
    <Panel header={<PanelHead title={say(t.title)} count={rows.length} />}>
      <PanelBody>
        <Rows>
          {rows.map(([kind, ref, i]) => {
            const [updated, desired] = [Number(one(i.values?.[`${ref}.updated`]) ?? 0), Number(one(i.values?.[`${ref}.desired`]) ?? 0)];
            const said = text(i.values?.[why]);
            return (
              <Row
                key={`${kind.id}/${i.key}`}
                mark={<Ratio value={updated} of={desired} />}
                lead={<ObjectLead kind={kind} name={text(i.values?.['core.name'])} namespace={text(i.values?.['core.namespace']) || undefined} />}
                end={<span class="uk-mono">{say(t.updated, { updated, desired })}</span>}
                {...(said ? { under: said } : {})}
              />
            );
          })}
        </Rows>
      </PanelBody>
    </Panel>
  );
}

// ── Events ──────────────────────────────────────────────────────────────────

const EVENT_FIELDS = ['.type', '.reason', '.involvedObject.kind', '.involvedObject.name', '.involvedObject.namespace', '.message', 'events.v1.count', 'events.v1.lastSeen'];

/**
 * Events (core.page.overview.events): the most recent first, Warning ones at
 * first (or all); filtered by reason and the object's kind (in a list of
 * them, how many of each beside), what is chosen said under its head, each
 * taken back by its ×; paused (the list as it was, how many came since
 * said), or live. Each: its type's mark (a Normal one quiet), the reason,
 * the object, the message; how many times, how long ago.
 */
export function OverviewEvents({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const page = usePage();
  const t = T.page.overview.events;
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const scope = scopeOf(Event, undefined, chosen.value);
  const typed: Where | undefined = all ? undefined : { field: '.type', op: 'eq', value: 'Warning' };
  const of = (at: 'reason' | 'kind') => picked.filter((p) => p.startsWith(`${at}:`)).map((p) => p.slice(at.length + 1));
  const [reasons, kinds] = [of('reason'), of('kind')];
  const where = (but?: 'reason' | 'kind'): Where | undefined => {
    const args: Where[] = [
      ...(typed ? [typed] : []),
      ...(but !== 'reason' && reasons.length ? [{ field: '.reason', op: 'in' as const, values: reasons }] : []),
      ...(but !== 'kind' && kinds.length ? [{ field: '.involvedObject.kind', op: 'in' as const, values: kinds }] : []),
    ];
    return args.length ? { op: 'and', args } : undefined;
  };
  const base = { kind: kindRef(Event), ...(scope ? { scope } : {}) };
  const list = useList({ ...base, ...(where() ? { where: where() } : {}), sort: [{ field: 'events.v1.lastSeen', desc: true }], page: { limit: SHOWN }, select: EVENT_FIELDS });
  // Each facet counted of what the other leaves (a reason's count, of the kinds chosen).
  const byReason = useCount({ ...base, ...(where('reason') ? { where: where('reason') } : {}), groupBy: '.reason', top: 30 });
  const byKind = useCount({ ...base, ...(where('kind') ? { where: where('kind') } : {}), groupBy: '.involvedObject.kind', top: 30 });
  // Paused: the list as it was, of the query it was of (another asked since — a type, a filter, the namespaces: live again); how many came since — seen after the last it showed.
  const asked = canonical([where(), scope]);
  const [held, setPaused] = useState<{ items: readonly Item[]; asked: string; newest: number } | null>(null);
  const paused = held && held.asked === asked ? held : null;
  const after = useCount({
    ...base,
    where: { op: 'and', args: [...(where() ? [where() as Where] : []), { field: 'events.v1.lastSeen', op: 'range', gt: paused?.newest ?? Number.MAX_SAFE_INTEGER }] },
  });
  const items = paused?.items ?? list.items;
  const since = paused ? (after.total?.count ?? 0) : 0;
  const group = (id: 'reason' | 'kind', title: string, count: CountResult) => ({
    id,
    title,
    // Those of no value (an event with no reason): not to be picked (nothing to ask by).
    items: (count.groups ?? [])
      .filter((g) => g.value !== null)
      .map((g) => ({ id: `${id}:${String(g.value)}`, label: `${String(g.value)}  ${g.count}`, on: picked.includes(`${id}:${String(g.value)}`) })),
  });
  const tools = (
    <>
      <Segmented
        label={say(t.type)}
        value={all ? 'all' : 'warning'}
        onChange={(v) => {
          setAll(v === 'all');
          setPicked([]);
        }}
        options={[
          { value: 'warning', label: say(t.warning) },
          { value: 'all', label: say(t.all) },
        ]}
      />
      <Button buttonRef={anchor} size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {picked.length ? `${say(t.filter)} · ${picked.length}` : say(t.filter)}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={paused ? 'circle-play' : 'pause'}
        title={paused ? (since ? say(t.resumeNew, { count: since }) : say(t.resume)) : say(t.pause)}
        aria-pressed={!!paused}
        onClick={() => setPaused(paused ? null : { items: list.items, asked, newest: Math.max(0, ...list.items.map((i) => Number(one(i.values?.['events.v1.lastSeen']) ?? 0))) })}
      />
      {open && (
        <Popover anchor={anchor} align="end" label={say(t.filterTitle)} onClose={() => setOpen(false)} class="uk-checklist-pop">
          <Checklist
            groups={[group('reason', say(t.reason), byReason), group('kind', say(t.kind), byKind)]}
            onChange={(ids, on) => setPicked(on ? [...new Set([...picked, ...ids])] : picked.filter((p) => !ids.includes(p)))}
            onReset={() => setPicked([])}
            labels={{ filter: say(t.filter), shown: (n) => (n ? say(t.chosen, { count: n }) : say(t.allShown)), reset: say(t.clear), locked: '', none: say(t.noneMatch) }}
          />
        </Popover>
      )}
    </>
  );
  return (
    <Panel
      header={
        <PanelHead
          title={say(t.title)}
          {...(list.state === 'loading' ? {} : { count: list.total?.count ?? 0 })}
          tools={tools}
          more={{ label: say(t.more), href: page.href(kindPath(Event)) }}
        />
      }
    >
      {picked.length > 0 && (
        <ChosenTokens
          tokens={picked.map((p) => ({ id: p, name: say(p.startsWith('kind:') ? t.kind : t.reason), value: p.slice(p.indexOf(':') + 1) }))}
          remove={(id) => setPicked(picked.filter((p) => p !== id))}
          label={(value) => say(t.remove, { value })}
        />
      )}
      <PanelBody>
        {list.state === 'loading' ? (
          <Loading />
        ) : refused(list) ? (
          <RefusedQuietly kind={Event} error={list.error} />
        ) : items.length === 0 ? (
          <Nothing icon="circle-check">{say(picked.length ? t.noneMatch : all ? t.none : t.noneWarning)}</Nothing>
        ) : (
          <Rows>
            {items.map((i) => {
              const v = i.values ?? {};
              const warning = text(v['.type']) === 'Warning';
              const kind = text(v['.involvedObject.kind']);
              const namespace = text(v['.involvedObject.namespace']);
              const name = text(v['.involvedObject.name']);
              const times = Number(one(v['events.v1.count']) ?? 1);
              const seen = timeOf(v['events.v1.lastSeen']);
              return (
                <Row
                  key={i.key}
                  mark={warning ? <Status tone="warn" icon="warning" title={say(t.warning)} /> : <Status tone="done" icon="circle-check" title={say(t.normal)} />}
                  lead={
                    <span class="uk-board-object">
                      <b class={warning ? undefined : 'uk-quiet'}>{text(v['.reason'])}</b>
                      <span class="uk-quiet">
                        {kind} {namespace ? `${namespace}/${name}` : name}
                      </span>
                    </span>
                  }
                  end={
                    <span class="uk-board-when">
                      {times > 1 && <span>×{times}</span>}
                      <span class="uk-board-age">{seen ? <Since time={seen} /> : EMPTY}</span>
                    </span>
                  }
                  under={text(v['.message'])}
                />
              );
            })}
          </Rows>
        )}
      </PanelBody>
    </Panel>
  );
}

// ── Side ────────────────────────────────────────────────────────────────────

/**
 * The cluster (core.page.overview.cluster): its Kubernetes version, its
 * distribution, how many nodes, how old (kube-system's age), whether the
 * API server is reachable (why not, under the pointer) — the header region
 * in its head (a GitOps tool's mark), the health region under it (an alert
 * manager's alerts).
 */
export function ClusterInfo(props: PageProps) {
  const say = useSay();
  const t = T.page.overview.cluster;
  const status = useStatus();
  const nodes = useCount({ kind: kindRef(Node) }).total?.count;
  const system = useGet<{ metadata?: { creationTimestamp?: string } }>({ kind: kindRef(Namespace), name: 'kube-system' }).object;
  const born = system?.metadata?.creationTimestamp ? Date.parse(system.metadata.creationTimestamp) : Number.NaN;
  const version = status?.kube.version;
  const reachable = status?.kube.reachable;
  return (
    <Panel header={<PanelHead title={say(t.title)} tools={slotElement(region('header'), props)} />}>
      <PanelBody>
        {!status ? (
          <Loading />
        ) : (
          <dl class="uk-board-facts">
            <dt>{say(t.apiServer)}</dt>
            <dd>
              <Status tone={reachable ? 'ok' : 'error'} icon={reachable ? 'heartbeat' : 'circle-x'} {...(status.kube.error ? { title: status.kube.error.message } : {})}>
                {say(reachable ? t.reachable : t.unreachable)}
              </Status>
            </dd>
            <dt>{say(t.kubernetes)}</dt>
            <dd class="uk-mono">{version ? version.split('+')[0] : EMPTY}</dd>
            <dt>{say(t.distribution)}</dt>
            <dd>{(version && distroOf(version)) || EMPTY}</dd>
            <dt>{say(t.nodes)}</dt>
            <dd>{nodes ?? EMPTY}</dd>
            <dt>{say(t.age)}</dt>
            <dd>{Number.isNaN(born) ? EMPTY : humanDuration(Date.now() - born)}</dd>
          </dl>
        )}
      </PanelBody>
      {slotElement(region('health'), props)}
    </Panel>
  );
}

/** Pods taking a node's room: those not done (as kubectl describe node takes them). */
const TAKING: Where = { op: 'not', arg: { field: 'pods.v1.phase', op: 'in', values: ['Succeeded', 'Failed'] } };
const RESOURCES = ['pods.v1.cpu-requests', 'pods.v1.cpu-limits', 'pods.v1.memory-requests', 'pods.v1.memory-limits'];
const ROOM = ['nodes.v1.cpu-allocatable', 'nodes.v1.memory-allocatable', 'nodes.v1.pods-allocatable'];

/** Pods on a node taking its room (scheduled: one waiting for a node takes none yet). */
const PLACED: Where = { op: 'and', args: [TAKING, { field: 'pods.v1.node', op: 'exists' }] };

/** Capacity (core.page.overview.capacity): CPU and memory requested and limited of what the nodes have allocatable, pods of how many they take — the whole cluster's; the capacity region under it (a metrics server's). */
export function Capacity(props: PageProps) {
  const say = useSay();
  const t = T.page.overview.capacity;
  const room = useCount({ kind: kindRef(Node), sum: ROOM });
  const taken = useCount({ kind: kindRef(Pod), where: PLACED, sum: RESOURCES });
  const loading = room.state === 'loading' || taken.state === 'loading';
  // Not read (refused, in part): not said as if it were none.
  const unsure = [room, taken].some((r) => refused(r) || r.state === 'partial');
  const has = (n: string) => room.sums?.[n] ?? 0;
  const used = (n: string) => taken.sums?.[n] ?? 0;
  const of = (label: string, part: number, whole: number, said: (n: number) => string) => (
    <Gauge label={label} value={part} of={whole} said={say(t.of, { part: percent(part, whole), whole: said(whole) })} />
  );
  return (
    <Panel header={<PanelHead title={say(t.title)} />}>
      {!loading && (
        <Refusals
          answers={[
            [Node, room],
            [Pod, taken],
          ]}
        />
      )}
      {loading ? (
        <div class="uk-gauges">
          <Skeleton width="100%" />
          <Skeleton width="100%" />
        </div>
      ) : unsure ? null : (
        <div class="uk-gauges">
          {of(say(t.cpuRequests), used('pods.v1.cpu-requests'), has('nodes.v1.cpu-allocatable'), cores)}
          {of(say(t.cpuLimits), used('pods.v1.cpu-limits'), has('nodes.v1.cpu-allocatable'), cores)}
          {of(say(t.memoryRequests), used('pods.v1.memory-requests'), has('nodes.v1.memory-allocatable'), bytes)}
          {of(say(t.memoryLimits), used('pods.v1.memory-limits'), has('nodes.v1.memory-allocatable'), bytes)}
          <Gauge
            label={say(t.pods)}
            value={taken.total?.count ?? 0}
            of={has('nodes.v1.pods-allocatable')}
            said={say(t.count, { count: taken.total?.count ?? 0, whole: has('nodes.v1.pods-allocatable') })}
          />
        </div>
      )}
      {slotElement(region('capacity'), props)}
    </Panel>
  );
}

/** The nodes (core.page.overview.nodes): each its state, name (a link), roles; pods of how many it takes; CPU and memory requested, its version — not Ready, its taints. */
export function OverviewNodes() {
  const say = useSay();
  const page = usePage();
  const t = T.page.overview.nodes;
  const nodes = useList({
    kind: kindRef(Node),
    sort: [{ field: 'core.name' }],
    page: { limit: SHOWN },
    select: ['core.name', 'nodes.v1.status', 'nodes.v1.roles', 'nodes.v1.version', 'nodes.v1.taints', ...ROOM],
  });
  // Of the nodes shown, their pods and requests (asked by their names: none of them left out past a top).
  const names = nodes.items.map((i) => text(i.values?.['core.name']));
  const taken = useCount({
    kind: kindRef(Pod),
    where: { op: 'and', args: [PLACED, { field: 'pods.v1.node', op: 'in', values: names }] },
    groupBy: 'pods.v1.node',
    top: SHOWN,
    sum: RESOURCES,
  });
  const on = new Map((taken.groups ?? []).map((g) => [g.value, g]));
  const known = taken.state !== 'loading' && !refused(taken);
  return (
    <Panel
      header={
        <PanelHead
          title={say(t.title)}
          {...(nodes.state === 'loading' ? {} : { count: nodes.total?.count ?? 0 })}
          more={{ label: say(t.title), href: page.href(kindPath(Node)) }}
        />
      }
    >
      <PanelBody>
        {nodes.state === 'loading' ? (
          <Loading />
        ) : refused(nodes) ? (
          <RefusedQuietly kind={Node} error={nodes.error} />
        ) : (
          <Rows>
            {nodes.items.map((i) => {
              const v = i.values ?? {};
              const name = text(v['core.name']);
              const state = text(v['nodes.v1.status']);
              const here = on.get(name);
              const ready = state.startsWith('Ready');
              const roles = (Array.isArray(v['nodes.v1.roles']) ? (v['nodes.v1.roles'] as Value[]) : []).map(String);
              const room = (n: string) => Number(one(v[n]) ?? 0);
              return (
                <Row
                  key={i.key}
                  mark={<StatusOf kind={Node} words={state} mark />}
                  lead={
                    <span class="uk-board-object">
                      <a href={page.href(openIn('/', Node, { metadata: { name } }))}>{name}</a>
                      {roles.map((r) => (
                        <Badge key={r}>{r}</Badge>
                      ))}
                    </span>
                  }
                  end={<span class="uk-mono">{known ? say(t.pods, { count: here?.count ?? 0, whole: room('nodes.v1.pods-allocatable') }) : EMPTY}</span>}
                  under={
                    <span class="uk-mono">
                      {ready && known
                        ? `${say(t.requested, {
                            cpu: percent(here?.sums?.['pods.v1.cpu-requests'] ?? 0, room('nodes.v1.cpu-allocatable')),
                            memory: percent(here?.sums?.['pods.v1.memory-requests'] ?? 0, room('nodes.v1.memory-allocatable')),
                          })} · ${text(v['nodes.v1.version'])}`
                        : ready
                          ? text(v['nodes.v1.version'])
                          : (Array.isArray(v['nodes.v1.taints']) ? (v['nodes.v1.taints'] as Value[]) : []).map(String).join(', ') || state}
                    </span>
                  }
                />
              );
            })}
          </Rows>
        )}
      </PanelBody>
    </Panel>
  );
}

/** The namespaces (core.page.overview.namespaces): those of the most pods, each how many and how many unhealthy (a link to it). */
export function OverviewNamespaces() {
  const say = useSay();
  const page = usePage();
  const t = T.page.overview.namespaces;
  const pods = useCount({ kind: kindRef(Pod), groupBy: 'core.namespace', top: SHOWN });
  // Of the namespaces shown, how many pods unhealthy (as the Unhealthy panel says it; asked by their names: none left out past a top).
  const names = (pods.groups ?? []).flatMap((g) => (g.value === null ? [] : [String(g.value)]));
  const bad = useCount({
    kind: kindRef(Pod),
    where: { op: 'and', args: [UNHEALTHY_PODS, { field: 'core.namespace', op: 'in', values: names }] },
    groupBy: 'core.namespace',
    top: SHOWN,
  });
  const unhealthy = new Map((bad.groups ?? []).map((g) => [g.value, g.count]));
  const known = bad.state !== 'loading' && !refused(bad);
  return (
    <Panel header={<PanelHead title={say(t.title)} more={{ label: say(t.title), href: page.href(kindPath(Namespace)) }} />}>
      <PanelBody>
        {pods.state === 'loading' ? (
          <Loading />
        ) : refused(pods) ? (
          <RefusedQuietly kind={Pod} error={pods.error} />
        ) : (
          <div class="uk-board-grid">
            <span class="uk-board-th">{say(t.name)}</span>
            <span class="uk-board-th uk-board-num">{say(t.pods)}</span>
            <span class="uk-board-th uk-board-num">{say(t.unhealthy)}</span>
            {(pods.groups ?? []).flatMap((g) => {
              const name = String(g.value ?? '');
              const n = known ? (unhealthy.get(g.value) ?? 0) : undefined;
              return [
                <span key={`${name}-n`} class="uk-board-td">
                  <a href={page.href(openIn('/', Namespace, { metadata: { name } }))}>{name}</a>
                </span>,
                <span key={`${name}-p`} class="uk-board-td uk-board-num uk-mono">
                  {g.count}
                </span>,
                <span key={`${name}-u`} class={`uk-board-td uk-board-num uk-mono${n ? ' uk-board-bad' : ' uk-quiet'}`}>
                  {n === undefined ? '?' : n || EMPTY}
                </span>,
              ];
            })}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

/** The core's start: the page itself; in its regions, the core's parts — each a fill another may hide, move, or take the place of. */
export function addOverview(c: KubeContributor, chosen: Chosen): void {
  // The unhealthy's table as it is set out: as by default, the user's to change (a fallback another's takes the place of).
  c.add('TableView', UNHEALTHY_VIEW, {}, { fallback: true });
  c.add('Fill', 'core.page.overview.dashboard', fill(slots.page('overview'), { render: Dashboard }));
  c.add('Fill', 'core.page.overview.suggested', fill(region('notices'), { render: Suggested }));
  c.add('Fill', 'core.page.overview.tiles', fill(region('tiles'), { render: () => <OverviewTiles chosen={chosen} /> }));
  c.add('Fill', 'core.page.overview.unhealthy', fill(region('main'), { order: 100, render: () => <Unhealthy chosen={chosen} /> }));
  c.add('Fill', 'core.page.overview.rolling', fill(region('main'), { order: 200, render: () => <RollingOut chosen={chosen} /> }));
  c.add('Fill', 'core.page.overview.events', fill(region('main'), { order: 300, render: () => <OverviewEvents chosen={chosen} /> }));
  c.add('Fill', 'core.page.overview.cluster', fill(region('side'), { order: 100, render: ClusterInfo }));
  c.add('Fill', 'core.page.overview.capacity', fill(region('side'), { order: 200, render: Capacity }));
  c.add('Fill', 'core.page.overview.nodes', fill(region('side'), { order: 300, render: OverviewNodes }));
  c.add('Fill', 'core.page.overview.namespaces', fill(region('side'), { order: 400, render: OverviewNamespaces }));
}
