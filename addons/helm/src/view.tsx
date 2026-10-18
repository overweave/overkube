import type { KindInfo } from '@overkube/kube-types';
import { humanDuration } from '@overkube/sdk';
import { ObjectRef, OpenedView, StatusOf, useList, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Badge, Code, Diff, KeyValue, Nothing, Notice, Section, Segmented, Status, TabBar, Table, type TableColumn, type Tone, toYaml, YamlView } from '@overkube/uikit';
import { useState } from 'preact/hooks';
import { merged, type Release, resourcesOf } from './release.ts';
import { type ReleaseRow, type Revision, useDecoded } from './releases.ts';
import { T } from './texts.ts';

/*
 * A release opened: Overview — its state and why (failed: helm's words;
 * stuck pending: what that means, the rollback that undoes it), its chart,
 * its revision, when deployed; what its manifest made, each as it is now;
 * its notes. Values — those given (helm get values), or with the chart's
 * own (--all). Manifest — what helm applied (helm get manifest). History —
 * each revision (helm history), two of them compared (their values, or
 * their manifests).
 */

const LOOK: Record<string, [Tone, string]> = {
  deployed: ['ok', 'circle-check'],
  failed: ['error', 'circle-x'],
  'pending-install': ['progress', 'spinner'],
  'pending-upgrade': ['progress', 'spinner'],
  'pending-rollback': ['progress', 'spinner'],
  uninstalling: ['progress', 'spinner'],
  superseded: ['done', 'circle-dashed'],
  uninstalled: ['gone', 'circle-dashed'],
};

/** helm's state of a release, as a state is drawn (what helm said of it: its tip). */
export function HelmState({ status, title }: { status: string; title?: string | undefined }) {
  const [tone, icon] = LOOK[status] ?? (['unknown', 'help'] as [Tone, string]);
  return (
    <Status tone={tone} icon={icon} {...(title ? { title } : {})}>
      {status}
    </Status>
  );
}

/** How long ago, as kubectl says an age; none: "—". */
export const ago = (time: string | number | undefined) => {
  const at = typeof time === 'number' ? time : Date.parse(time ?? '');
  return Number.isNaN(at) || !at ? '—' : humanDuration(Math.max(0, Date.now() - at));
};

/** A kind's id of an apiVersion and a kind (v1, ConfigMap: v1/ConfigMap; apps/v1, Deployment: apps/v1/Deployment). */
const kindIdOf = (apiVersion: string, kind: string) => `${apiVersion}/${kind}`;

/** What a manifest made, as it is now: its state as its kind's table says it (kstatus's, where none of its own). */
function Resource({ kind, name, namespace }: { kind: KindInfo; name: string; namespace: string | undefined }) {
  const ref = kind.group ? `${kind.plural}.${kind.version}.${kind.group}` : `${kind.plural}.${kind.version}`;
  const got = useList({
    kind: ref,
    ...(kind.namespaced && namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'core.name', op: 'eq', value: name },
    page: { limit: 1 },
    select: ['core.health'],
  });
  if (got.state === 'loading') return null;
  const item = got.items[0];
  if (!item)
    return (
      <Status tone="error" icon="circle-x">
        NotFound
      </Status>
    );
  const health = item.values?.['core.health'];
  return typeof health === 'string' && health ? <StatusOf kind={kind} words={health} /> : <span class="uk-quiet">—</span>;
}

function Overview({ row, r }: { row: ReleaseRow; r: Release }) {
  const say = useSay();
  const t = T.release;
  const { kinds } = useServedKinds();
  const made = resourcesOf(r.manifest).map((x) => ({ ...x, info: kinds.get(kindIdOf(x.apiVersion, x.kind)) }));
  const columns: TableColumn<(typeof made)[number]>[] = [
    { id: 'kind', header: say(T.columns.kind), width: '130px', cell: (x) => <Badge>{x.kind}</Badge> },
    {
      id: 'name',
      header: say(T.columns.name),
      width: 'minmax(0, 1fr)',
      cell: (x) => (x.info ? <ObjectRef kind={x.info.id} name={x.name} namespace={x.namespace ?? row.namespace} quiet /> : x.name),
    },
    {
      id: 'status',
      header: say(T.columns.status),
      width: '140px',
      cell: (x) => (x.info ? <Resource kind={x.info} name={x.name} namespace={x.namespace ?? row.namespace} /> : null),
    },
  ];
  const first = row.revisions[row.revisions.length - 1];
  const status = r.info.status;
  return (
    <>
      {status.startsWith('pending-') && (
        <Notice level="warn" icon="warning" title={say(t.stuck, { status, duration: ago(r.info.last_deployed) })}>
          <div class="uk-stack">
            {r.version > 1 ? (
              <>
                <span>{say(t.stuckText)}</span>
                <Code>{`helm rollback ${row.name} ${r.version - 1} -n ${row.namespace}`}</Code>
              </>
            ) : (
              <>
                <span>{say(t.stuckFirst)}</span>
                <Code>{`helm uninstall ${row.name} -n ${row.namespace}`}</Code>
              </>
            )}
          </div>
        </Notice>
      )}
      <Section title={say(t.summary)} part="summary">
        <KeyValue
          rows={[
            [say(T.columns.status), <HelmState status={status} />],
            [say(t.description), status === 'failed' ? <code class="uk-why">{r.info.description}</code> : r.info.description],
            [say(T.columns.chart), `${r.chart.metadata.name}-${r.chart.metadata.version}`],
            [say(T.columns.appVersion), r.chart.metadata.appVersion],
            [say(T.columns.revision), String(r.version)],
            [say(t.firstDeployed), ago(r.info.first_deployed ?? first?.modified)],
            [say(t.lastDeployed), ago(r.info.last_deployed)],
          ]}
        />
      </Section>
      <Section title={say(t.resources)} part="resources">
        {made.length ? (
          <Table plain rows={made} rowKey={(x) => `${x.apiVersion}/${x.kind}/${x.namespace ?? ''}/${x.name}`} columns={columns} reorderable={false} />
        ) : (
          <Nothing>{say(t.noResources)}</Nothing>
        )}
      </Section>
      {r.info.notes && (
        <Section title={say(t.notes)} part="notes">
          <Code>{r.info.notes}</Code>
        </Section>
      )}
    </>
  );
}

/** Its values in the YAML view (as a resource's YAML is): those given (helm get values), or with the chart's own (--all) — which, in its tools. */
function Values({ r, name }: { r: Release; name: string }) {
  const say = useSay();
  const [all, setAll] = useState(false);
  const given = r.config && Object.keys(r.config).length ? r.config : undefined;
  const text = all ? toYaml(merged(r.chart.values ?? {}, r.config ?? {})) : given ? toYaml(given) : `# ${say(T.release.noValues)}\n`;
  return (
    <div data-part="values">
      <YamlView
        text={text}
        name={`${name}-values`}
        tools={
          <Segmented
            label={say(T.release.values)}
            value={all ? 'all' : 'given'}
            onChange={(v) => setAll(v === 'all')}
            options={[
              { value: 'given', label: say(T.release.given) },
              { value: 'all', label: say(T.release.all) },
            ]}
          />
        }
      />
    </div>
  );
}

/** A manifest's objects, each its text (by kind, namespace where it says one, name): those of two revisions set side by side. */
function documentsOf(manifest: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const doc of (manifest ?? '').split(/^---\s*$/m)) {
    const [made] = resourcesOf(`---\n${doc}`);
    if (made) out.set(`${made.kind} ${made.namespace ? `${made.namespace}/` : ''}${made.name}`, doc.replace(/^\s*\n/, '').trimEnd());
  }
  return out;
}

/** Two revisions' manifests: each object changed, its own diff under its kind and name; those unchanged, one line. */
function ManifestDiff({ before, after }: { before: Release; after: Release }) {
  const say = useSay();
  const [a, b] = [documentsOf(before.manifest), documentsOf(after.manifest)];
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const changed = keys.filter((k) => a.get(k) !== b.get(k));
  const same = keys.filter((k) => a.get(k) === b.get(k));
  return (
    <div class="uk-stack">
      {changed.map((k) => (
        <Diff
          key={k}
          title={
            <span class="uk-line">
              {k}
              {!a.has(k) ? <Badge level="ok">{say(T.release.added)}</Badge> : !b.has(k) ? <Badge level="error">{say(T.release.removed)}</Badge> : null}
            </span>
          }
          before={a.get(k) ?? ''}
          after={b.get(k) ?? ''}
          expand={say(T.release.expand)}
        />
      ))}
      {!changed.length && <span class="uk-quiet">{say(T.release.same)}</span>}
      {same.length > 0 && <span class="uk-quiet">{say(T.release.sameObjects, { count: same.length, names: same.join(', ') })}</span>}
    </div>
  );
}

/** Its revisions (helm history), newest first; one chosen (the latest at first): what changed in it, from the one before. */
function History({ row }: { row: ReleaseRow }) {
  const say = useSay();
  const t = T.release;
  const [what, setWhat] = useState<'values' | 'manifest'>('values');
  const [chosen, setChosen] = useState(row.revisions[0]?.version ?? 1);
  const decoded = useDecoded(row.revisions.map((r) => ({ namespace: row.namespace, secret: r.secret })));
  const of = (v: number | undefined) => decoded.get(`${row.namespace}/${row.revisions.find((r) => r.version === v)?.secret}`);
  const at = row.revisions.findIndex((r) => r.version === chosen);
  const previous = row.revisions[at + 1]?.version;
  const [before, after] = [of(previous), of(chosen)];
  const columns: TableColumn<Revision>[] = [
    { id: 'revision', header: say(T.columns.revision), width: '80px', cell: (x) => <span class="uk-num">{x.version}</span> },
    { id: 'status', header: say(T.columns.status), width: '160px', cell: (x) => <HelmState status={x.status} title={of(x.version)?.info.description} /> },
    {
      id: 'chart',
      header: say(T.columns.chart),
      width: 'minmax(0, 1fr)',
      cell: (x) => (of(x.version) ? `${of(x.version)?.chart.metadata.name}-${of(x.version)?.chart.metadata.version}` : ''),
    },
    { id: 'updated', header: say(T.columns.updated), width: '90px', cell: (x) => ago(x.modified) },
  ];
  return (
    <>
      <Section title={say(t.history)} part="history">
        <Table
          plain
          rows={row.revisions}
          rowKey={(x) => String(x.version)}
          columns={columns}
          reorderable={false}
          onRowClick={(x) => setChosen(x.version)}
          selected={String(chosen)}
        />
      </Section>
      <Section title={previous === undefined ? say(t.first, { to: chosen }) : say(t.compare, { from: previous, to: chosen })} part="compare">
        {previous === undefined ? (
          <span class="uk-quiet">{say(t.nothingBefore)}</span>
        ) : !before || !after ? (
          <span class="uk-quiet">{say(t.reading)}</span>
        ) : (
          <div class="uk-stack">
            <Segmented
              label={say(t.compare, { from: previous, to: chosen })}
              value={what}
              onChange={setWhat}
              options={[
                { value: 'values', label: say(t.values) },
                { value: 'manifest', label: say(t.manifest) },
              ]}
            />
            {what === 'values' ? (
              <Diff title="values.yaml" before={toYaml(before.config ?? {})} after={toYaml(after.config ?? {})} same={say(t.same)} expand={say(t.expand)} />
            ) : (
              <ManifestDiff before={before} after={after} />
            )}
          </div>
        )}
      </Section>
    </>
  );
}

type Tab = 'overview' | 'values' | 'manifest' | 'history';

export function ReleaseOpened({ row, close }: { row: ReleaseRow; close: () => void }) {
  const say = useSay();
  const t = T.release;
  const [tab, setTab] = useState<Tab>('overview');
  const r = useDecoded([{ namespace: row.namespace, secret: row.latest.secret }]).get(`${row.namespace}/${row.latest.secret}`);
  return (
    <OpenedView
      onClose={close}
      title={
        <span class="uk-line">
          {say(t.title, { name: row.name })}
          <span class="uk-quiet">{row.namespace}</span>
        </span>
      }
      tabs={
        <TabBar
          label={say(t.title, { name: row.name })}
          active={tab}
          onSelect={(k) => setTab(k as Tab)}
          tabs={[
            { key: 'overview', label: say(t.overview), icon: 'grid' },
            { key: 'values', label: say(t.values), icon: 'file' },
            { key: 'manifest', label: say(t.manifest), icon: 'file' },
            { key: 'history', label: say(t.history), icon: 'activity' },
          ]}
        />
      }
    >
      <div class="uk-region uk-details">
        {!r ? (
          <span class="uk-quiet">{say(t.reading)}</span>
        ) : tab === 'overview' ? (
          <Overview row={row} r={r} />
        ) : tab === 'values' ? (
          <Values r={r} name={row.name} />
        ) : tab === 'manifest' ? (
          <div data-part="manifest">{r.manifest ? <YamlView text={r.manifest} name={`${row.name}-${r.version}`} /> : <Nothing>{say(t.noManifest)}</Nothing>}</div>
        ) : (
          <History row={row} />
        )}
      </div>
    </OpenedView>
  );
}
