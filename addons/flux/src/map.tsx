import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { forKinds, KindView, type KubeContributor, kindRef, lookOf, mapCard, StatusLook } from '@overkube/sdk';
import { useGet, useList, useLists, useServedKinds } from '@overkube/sdk/preact';
import type { MapCard, MapGraph, MapLinkKind, Tone } from '@overkube/uikit';
import { useDefinitions } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { APPLIERS, byName, F, HelmChart, HelmRelease, own, type Ref, ref, SOURCES, sourceRefOf } from './kinds.ts';

/*
 * Flux's maps (MapScope, its objects' Map tab): a source's — what uses it
 * (its HelmCharts, the Kustomizations and HelmReleases of it and of them),
 * each Kustomization in a frame of its own with what it applied (its
 * inventory, each object as it is now); a Kustomization's, a HelmRelease's —
 * its source (a chart's too), it, what it applied. Each Flux object its
 * state as Flux leaves it (Ready, failing, on its way, Suspended), its
 * revision. Asked: what uses the source (by its key, of every namespace),
 * and of what was applied, each kind once (by their names).
 */

export const LINKS: Record<string, MapLinkKind> = {
  artifact: { label: 'artifact', tint: 'blue', weight: 2 },
  chart: { label: 'chart', tint: 'teal', icon: 'helm', weight: 1.8 },
  applies: { label: 'applies', tint: 'violet' },
};

/** Its columns: a chart's source, the source, its charts, what applies, what is applied. */
const LAYER = { source: 0, chart: 1, applier: 2, applied: 3 } as const;

type Flux = KubeObject & {
  spec?: { suspend?: boolean; path?: string; chart?: { spec?: { chart?: string; version?: string } } };
  status?: {
    conditions?: { type: string; status: string; reason?: string; message?: string }[];
    artifact?: { revision?: string };
    lastAppliedRevision?: string;
    history?: { chartVersion?: string; status?: string }[];
    inventory?: { entries?: { id: string; v: string }[] };
  };
};

const ICON: Partial<Record<Tone, string>> = { ok: 'circle-check', error: 'circle-x', progress: 'spinner', warn: 'pause' };

/** Its state as Flux leaves it: Ready; failing (its reason); on its way; Suspended. */
function stateOf(o: Flux): MapCard['status'] {
  const ready = o.status?.conditions?.find((c) => c.type === 'Ready');
  const [tone, title]: [Tone, string] = o.spec?.suspend
    ? ['warn', 'Suspended']
    : ready?.status === 'True'
      ? ['ok', 'Ready']
      : ready?.status === 'False'
        ? ['error', ready.reason || 'False']
        : ['progress', 'Reconciling'];
  return { tone, icon: ICON[tone] ?? 'help', title };
}

/** Flux's inventory id (namespace_name_group_Kind), as an object's kind, namespace, name. */
function entryOf(id: string, v: string, served: ReadonlyMap<string, KindInfo>) {
  const [namespace = '', name = '', group = '', k = ''] = id.split('_');
  return { namespace, name, k, kind: served.get(group ? `${group}/${v}/${k}` : `${v}/${k}`) };
}
type Entry = ReturnType<typeof entryOf>;

const keyOf = (k: KindInfo, o: KubeObject) => `${k.kind}/${o.metadata?.namespace}/${o.metadata?.name}`;
const idOf = (k: KindInfo, o: KubeObject) => mapCard(kindRef(k), o.metadata?.namespace, o.metadata?.name ?? '');

/** A kind's objects asked for: their health by namespace/name, and where the answer looked (a namespace denied, or not answered yet: not known there). */
type Healths = { of: ReadonlyMap<string, string>; covers: (namespace: string) => boolean };

interface Seen {
  /** The source(s), the charts, what applies: each its kind and object. */
  sources: readonly { kind: KindInfo; object: Flux }[];
  charts: readonly { kind: KindInfo; object: Flux }[];
  appliers: readonly { kind: KindInfo; object: Flux; uses: string }[];
  /** Each applied object's health, by kind id: by namespace/name ('' none said; none there, where it was looked for — covers —: gone). */
  healths: ReadonlyMap<string, Healths>;
  served: ReadonlyMap<string, KindInfo>;
  look: (kind: KindInfo, words: string) => { tone: Tone; icon: string } | undefined;
  icon: (kind: KindInfo) => string | undefined;
  /** A frame for each applier and what it applied (a source's map: there are several). */
  framed: boolean;
}

function fluxGraph(s: Seen, focus: string): MapGraph {
  const cards = new Map<string, MapCard>();
  const links: MapGraph['links'] = [];
  const add = (c: MapCard) => {
    const had = cards.get(c.id);
    if (had) return had;
    cards.set(c.id, c);
    return c;
  };
  const fluxCard = (kind: KindInfo, object: Flux, layer: number, lines: string[], more: Partial<MapCard> = {}) =>
    add({
      id: idOf(kind, object),
      layer,
      title: object.metadata?.name ?? '',
      sub: kind.kind,
      lines: lines.filter(Boolean),
      status: stateOf(object),
      ports: [],
      ...(s.icon(kind) ? { icon: s.icon(kind) } : {}),
      ...more,
    });
  // A link, its ends' pins (a card's only where it is linked).
  const link = (kind: string, from: string, to: string) => {
    for (const [id, side] of [
      [from, 'out'],
      [to, 'in'],
    ] as const) {
      const c = cards.get(id);
      if (c && !c.ports.some((p) => p.id === side)) c.ports.push({ id: side, side });
    }
    links.push({ id: `${from}>${to}`, kind, from: { card: from, port: 'out' }, to: { card: to, port: 'in' } });
  };

  for (const { kind, object } of s.sources) fluxCard(kind, object, LAYER.source, [object.status?.artifact?.revision ?? '']);
  for (const { kind, object } of s.charts) {
    const c = fluxCard(kind, object, LAYER.chart, [object.status?.artifact?.revision ?? '']);
    const r = sourceRefOf(object);
    const from = r && s.sources.find((x) => x.kind.kind === r.kind && x.object.metadata?.name === r.name);
    if (from) link('artifact', idOf(from.kind, from.object), c.id);
  }
  for (const { kind, object, uses } of s.appliers) {
    const group = s.framed ? idOf(kind, object) : undefined;
    // The revision applied: a HelmRelease's, its history's latest deployed (or superseded).
    const applied = object.status?.lastAppliedRevision ?? object.status?.history?.find((h) => h.status === 'deployed' || h.status === 'superseded')?.chartVersion ?? '';
    const c = fluxCard(kind, object, LAYER.applier, [applied, object.spec?.path ?? object.spec?.chart?.spec?.chart ?? ''], group ? { group } : {});
    const [usedKind] = uses.split('/');
    const from = [...s.sources, ...s.charts].find((x) => keyOf(x.kind, x.object) === uses);
    if (from) link(usedKind === HelmChart.kind ? 'chart' : 'artifact', idOf(from.kind, from.object), c.id);
    // What it applied: each as it is now (gone: dashed).
    for (const e of (object.status?.inventory?.entries ?? []).map((x) => entryOf(x.id, x.v, s.served))) {
      const id = mapCard(e.kind ? kindRef(e.kind) : `kind:${e.k}`, e.namespace || undefined, e.name);
      const healths = e.kind && s.healths.get(e.kind.id);
      const health = healths?.of.get(`${e.kind?.namespaced ? e.namespace : ''}/${e.name}`);
      const look = e.kind && health ? s.look(e.kind, health) : undefined;
      add({
        id,
        layer: LAYER.applied,
        title: e.name,
        sub: e.k,
        ports: [],
        ...(group ? { group } : {}),
        ...(e.namespace && e.namespace !== object.metadata?.namespace ? { lines: [e.namespace] } : {}),
        ...(look && health ? { status: { ...look, title: health } } : {}),
        ...(healths && health === undefined && healths.covers(e.namespace) ? { missing: true, warn: `${e.k} ${e.name} not found` } : {}),
        ...(!e.kind ? { external: true } : {}),
        ...(e.kind && s.icon(e.kind) ? { icon: s.icon(e.kind) } : {}),
      });
      link('applies', c.id, id);
    }
  }
  const all = [...cards.values()].map((c) => (c.id === focus ? { ...c, main: true } : c));
  const groups = s.framed
    ? s.appliers
        .filter((a) => a.object.status?.inventory?.entries?.length)
        .map(({ kind, object }) => ({ id: idOf(kind, object), title: object.metadata?.name ?? '', sub: kind.kind, ...(s.icon(kind) ? { icon: s.icon(kind) } : {}) }))
    : [];
  return { kinds: LINKS, cards: all, links, ...(groups.length ? { groups } : {}), wrap: [LAYER.applied] };
}

/** A state's look, a kind's icon, as the page has them. */
function useLooks(): Pick<Seen, 'look' | 'icon'> {
  const looks = useDefinitions(StatusLook);
  const views = useDefinitions(KindView);
  return useMemo(
    () => ({
      look: (kind, words) => {
        const l = lookOf(looks, kind, words);
        return l ? { tone: l.tone, icon: l.icon ?? 'help' } : undefined;
      },
      icon: (kind) => views.find((v) => v.name === kind.id)?.spec.icon,
    }),
    [looks, views],
  );
}

/** What its appliers applied, as it is now: each kind asked once, by the names of its objects (of their namespaces). */
function useHealths(appliers: readonly { object: Flux }[], served: ReadonlyMap<string, KindInfo>) {
  const byKind = new Map<KindInfo, Entry[]>();
  for (const { object } of appliers)
    for (const x of object.status?.inventory?.entries ?? []) {
      const e = entryOf(x.id, x.v, served);
      if (e.kind) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
    }
  const asked = [...byKind].sort(([a], [b]) => a.id.localeCompare(b.id));
  const answers = useLists(
    asked.map(([kind, entries]) => {
      const names = [...new Set(entries.map((e) => e.name))].sort();
      const namespaces = [...new Set(entries.map((e) => e.namespace))].sort();
      return {
        kind: kindRef(kind),
        ...(kind.namespaced ? { scope: { namespaces } } : {}),
        where: { field: 'core.name', op: 'in' as const, values: names },
        page: { limit: names.length * Math.max(1, namespaces.length) },
        select: ['core.name', 'core.namespace', 'core.health'],
      };
    }),
  );
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const loading = answers.some((a) => a.state === 'loading');
  const healths = new Map(
    asked.map(([kind], i): [string, Healths] => {
      const a = answers[i];
      const answered = !!a && (a.state === 'live' || a.state === 'stale' || a.state === 'partial');
      return [
        kind.id,
        {
          of: new Map((a?.items ?? []).map((x) => [`${text(x.values?.['core.namespace'])}/${text(x.values?.['core.name'])}`, text(x.values?.['core.health'])])),
          covers: (namespace) =>
            answered && (!kind.namespaced || (!a.coverage.denied.includes(namespace) && (a.coverage.namespaces === 'all' || a.coverage.namespaces.includes(namespace)))),
        },
      ];
    }),
  );
  return { healths, loading, version: answers.map((a) => a.items) };
}

const objects = <O,>(l: { items: readonly { object?: unknown }[] }) => l.items.flatMap((i) => (i.object ? [i.object as O] : []));

/** A source's map: it, its charts, what applies it or them (each with what it applied, framed). */
function useSourceMap(kind: KindInfo, object: Flux): MapGraph | undefined {
  const { kinds: served } = useServedKinds();
  const key = keyOf(kind, object);
  const users = (k: KindInfo, values: readonly string[]) => ({ kind: ref(k), where: { field: own(F.uses, k), op: 'in' as const, values }, page: { limit: 500 } });
  const charts = useList<Flux>(users(HelmChart, [key]));
  const chartKeys = objects<Flux>(charts).map((c) => keyOf(HelmChart, c));
  const [kustomizations, releases] = APPLIERS.map((k) => useList<Flux>(users(k, k.id === HelmRelease.id ? [key, ...chartKeys] : [key])));
  const appliers = [
    ...objects<Flux>(kustomizations).map((o) => ({ kind: APPLIERS[0], object: o, uses: key })),
    ...objects<Flux>(releases).map((o) => ({ kind: HelmRelease, object: o, uses: usesOf(o) })),
  ];
  const { healths, loading, version } = useHealths(appliers, served);
  const looks = useLooks();
  const answers = [charts, kustomizations, releases];
  return useMemo(
    () =>
      answers.some((a) => a.state === 'loading') || loading
        ? undefined
        : fluxGraph(
            { sources: [{ kind, object }], charts: objects<Flux>(charts).map((o) => ({ kind: HelmChart, object: o })), appliers, healths, served, framed: true, ...looks },
            idOf(kind, object),
          ),
    [object, looks, served, loading, ...answers.map((a) => a.items), ...version],
  );
}

/** What a HelmRelease uses, as Flux's field says it (its chartRef's; its chart template's HelmChart, <namespace>-<name> in its source's namespace). */
function usesOf(o: Flux): string {
  const spec = o.spec as { chartRef?: Ref; chart?: { spec?: { sourceRef?: Ref } } } | undefined;
  const ns = o.metadata?.namespace ?? '';
  if (spec?.chartRef) return `${spec.chartRef.kind}/${spec.chartRef.namespace ?? ns}/${spec.chartRef.name}`;
  return `${HelmChart.kind}/${spec?.chart?.spec?.sourceRef?.namespace ?? ns}/${ns}-${o.metadata?.name}`;
}

/** An applier's map: its source (a chart's, its source too), it, what it applied. */
function useApplierMap(kind: KindInfo, object: Flux): MapGraph | undefined {
  const { kinds: served } = useServedKinds();
  const uses =
    kind.id === HelmRelease.id
      ? usesOf(object)
      : (() => {
          const r = sourceRefOf(object);
          return r ? `${r.kind}/${r.namespace ?? object.metadata?.namespace}/${r.name}` : '';
        })();
  const get = (key: string) => {
    const [k = '', namespace = '', name = ''] = key.split('/');
    const sk = byName(k);
    return sk && name ? { kind: ref(sk), namespace, name } : undefined;
  };
  const used = useGet<Flux>(get(uses));
  const usedKind = byName(uses.split('/')[0] ?? '');
  // A chart's own source (a chart template's HelmChart: a HelmRepository's, a GitRepository's…).
  const chartSource = usedKind?.id === HelmChart.id && used.object ? sourceRefOf(used.object) : undefined;
  const further = useGet<Flux>(chartSource ? get(`${chartSource.kind}/${chartSource.namespace ?? used.object?.metadata?.namespace}/${chartSource.name}`) : undefined);
  const { healths, loading, version } = useHealths([{ object }], served);
  const looks = useLooks();
  return useMemo(() => {
    if (used.state === 'loading' || further.state === 'loading' || loading) return undefined;
    const sources = [
      ...(usedKind && usedKind.id !== HelmChart.id && used.object ? [{ kind: usedKind, object: used.object }] : []),
      ...(chartSource && further.object ? [{ kind: byName(chartSource.kind) ?? HelmChart, object: further.object }] : []),
    ];
    const charts = usedKind?.id === HelmChart.id && used.object ? [{ kind: HelmChart, object: used.object }] : [];
    return fluxGraph({ sources, charts, appliers: [{ kind, object, uses }], healths, served, framed: false, ...looks }, idOf(kind, object));
  }, [object, used.object, used.state, further.object, further.state, looks, served, loading, ...version]);
}

export function addMap(c: KubeContributor): void {
  c.add('MapScope', 'flux.source', {
    target: forKinds(...SOURCES),
    order: 50,
    use: ({ kind, object }) => useSourceMap(kind, object as Flux),
  });
  c.add('MapScope', 'flux.applier', {
    target: forKinds(...APPLIERS),
    order: 50,
    use: ({ kind, object }) => useApplierMap(kind, object as Flux),
  });
}
