import { selectorCel } from '@overkube/cel';
import { kinds } from '@overkube/kube-types';
import { entriesOf, type LabelSelector, type LogCursor, type LogEntry, type LogLine, logTimeKey, requirementsOf } from '@overkube/query';
import type { ResourceProps } from '@overkube/sdk';
import { useList, useLog, useSay } from '@overkube/sdk/preact';
import { Button, GroupPicker, Icon, type LogRow, LogView, Nothing, Notice, type PickGroup, Segmented, Status } from '@overkube/uikit';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { T } from './texts.ts';

/*
 * A log in its own tab (core.logs): a pod's — its containers — or a
 * workload's (its pods, as its selector takes them: each its containers).
 * Its sources picked in a list grouped by pod (none picked: all of them),
 * each its colour; each read (useLog) — its newest lines followed, the
 * windows further back as it is scrolled to its top (a source picked later:
 * from then on) — their lines put together by time (each source's in order
 * already: merged, not sorted again), whose each is said when there are
 * several. A level (as a line's words say it), what is looked for; time and
 * wrap; a download of the lines shown. How it is: live (followed), held
 * (scrolled up), ended (no run of them goes on).
 */

const t = T.logs;
const { Pod } = kinds.core.v1;

/** The newest lines read at first, and so many a window further back. */
const WINDOW = 500;

/** Each source's colour, in turn: the kit's. */
const COLOURS = ['var(--uk-info)', 'var(--uk-accent)', 'var(--uk-ok)', 'var(--uk-warn)', 'color-mix(in srgb, var(--uk-info), var(--uk-error))'];

/** How a line reads, as its words say: an error's, a warning's. */
const levelOf = (text: string): LogRow['level'] => (/\b(error|fatal|panic|emerg|crit(ical)?)\b/i.test(text) ? 'error' : /\b(warn|warning)\b/i.test(text) ? 'warn' : undefined);

interface PodLike {
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  spec?: { initContainers?: { name: string; restartPolicy?: string }[]; containers?: { name: string }[] };
  status?: { containerStatuses?: { name: string; restartCount?: number }[]; initContainerStatuses?: { name: string; restartCount?: number }[] };
}

/** A container of a pod: a log to read. */
interface Source {
  key: string;
  pod: string;
  container: string;
  role?: 'init' | 'sidecar';
  restarts: number;
  colour: string;
}

/** Pods' containers as sources: its init containers first (one that keeps running: a sidecar), then the rest. */
function sourcesOf(pods: readonly PodLike[]): Source[] {
  const out: Source[] = [];
  for (const p of pods) {
    const pod = p.metadata?.name ?? '';
    const restarts = (name: string) => [...(p.status?.initContainerStatuses ?? []), ...(p.status?.containerStatuses ?? [])].find((s) => s.name === name)?.restartCount ?? 0;
    const each = [
      ...(p.spec?.initContainers ?? []).map((c) => ({ name: c.name, role: c.restartPolicy === 'Always' ? ('sidecar' as const) : ('init' as const) })),
      ...(p.spec?.containers ?? []).map((c) => ({ name: c.name, role: undefined })),
    ];
    for (const c of each)
      out.push({ key: `${pod}/${c.name}`, pod, container: c.name, ...(c.role ? { role: c.role } : {}), restarts: restarts(c.name), colour: COLOURS[out.length % COLOURS.length] });
  }
  return out;
}

/** What is read of a source: its lines (as entries); how it is; whether there is more further back, a window of it on its way; why not. */
type Read = { entries: readonly LogEntry[]; state: string; more: boolean; pending: boolean; error?: string };
/** A window further back, as read: its lines, where the one before begins (none: no more), why not. */
type Window = { entries: LogEntry[]; older?: LogCursor; error?: string };

/** One source read: its newest lines followed, the windows further back as many as asked since it was picked — told up; let go of, said so. */
function Reading({ namespace, source, back, onRead, onGone }: { namespace: string; source: Source; back: number; onRead: (read: Read) => void; onGone: () => void }) {
  const whose = { kind: 'pods.v1', namespace, name: source.pod, container: source.container };
  const newest = useLog({ ...whose, follow: true, limit: WINDOW });
  const [from] = useState(back);
  const [olders, setOlders] = useState<Window[]>([]);
  const cursor = olders.length ? olders[0].older : newest.older;
  const pending = back - from > olders.length && !!cursor;
  const entries = useMemo(() => [...olders.flatMap((o) => o.entries), ...entriesOf(newest.lines)], [olders, newest.lines]);
  const error = newest.error?.message ?? olders.find((o) => o.error)?.error;
  useEffect(() => onRead({ entries, state: newest.state, more: !!cursor, pending, ...(error ? { error } : {}) }), [entries, newest.state, cursor, pending, error]);
  useEffect(() => onGone, []);
  return pending && cursor ? <Older whose={whose} before={cursor} onRead={(o) => setOlders((all) => [o, ...all])} /> : null;
}

/** A window further back, read once and told up (refused or failed: none, and why). */
function Older({ whose, before, onRead }: { whose: { kind: string; namespace: string; name: string; container: string }; before: LogCursor; onRead: (window: Window) => void }) {
  const log = useLog({ ...whose, before, limit: WINDOW });
  useEffect(() => {
    if (log.state === 'done') onRead({ entries: entriesOf(log.lines), ...(log.older ? { older: log.older } : {}) });
    else if (log.state === 'error' || log.state === 'denied') onRead({ entries: [], error: log.error?.message ?? log.state });
  }, [log.state]);
  return null;
}

/** A source's lines as rows, made once for each line (by the line itself: the same lines read again, the same rows) — keyed by their time and their place among those of it. */
const made = new WeakMap<LogLine, { row: LogRow; order: string }>();
function rowsOf(source: Source, name: string, entries: readonly LogEntry[]): { row: LogRow; order: string }[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const head = entry[0];
    const nth = (seen.get(head.time ?? '') ?? 0) + 1;
    seen.set(head.time ?? '', nth);
    const key = `${source.key}|${head.time ?? ''}|${nth}`;
    const had = made.get(head);
    if (had && had.row.key === key && had.row.text.length === entry.reduce((n, l) => n + l.text.length, 0)) return had;
    const text = entry.map((l) => l.text).join('');
    const level = levelOf(text);
    const out = {
      row: { key, ...(head.time ? { time: head.time } : {}), text, source: { name, colour: source.colour }, ...(level ? { level } : {}) },
      order: logTimeKey(head.time),
    };
    made.set(head, out);
    return out;
  });
}

/** Lists each in order, merged in order (of equal ones, the earlier list's first). */
function merged<T>(lists: readonly (readonly { row: T; order: string }[])[]): T[] {
  const at = lists.map(() => 0);
  const out: T[] = [];
  for (;;) {
    let best = -1;
    for (let i = 0; i < lists.length; i++) if (at[i] < lists[i].length && (best < 0 || lists[i][at[i]].order < lists[best][at[best]].order)) best = i;
    if (best < 0) return out;
    out.push(lists[best][at[best]++].row);
  }
}

/** The log of these pods (a workload's: grouped by pod). */
function Logs({ pods, byPod }: { pods: readonly PodLike[]; byPod: boolean }) {
  const say = useSay();
  const sources = useMemo(() => sourcesOf(pods), [pods]);
  const [picked, pick] = useState<string[]>([]);
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  const [find, setFind] = useState('');
  const [times, setTimes] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [held, setHeld] = useState(false);
  const [back, setBack] = useState(0);
  const [read, setRead] = useState<Readonly<Record<string, Read>>>({});
  const reading = picked.length ? sources.filter((s) => picked.includes(s.key)) : sources;
  const namespace = pods[0]?.metadata?.namespace ?? '';
  const several = reading.length > 1;

  // Every source's lines together, by time (a line's pieces with it): each source's made into rows once, merged.
  const all = useMemo(
    () => merged(reading.map((s) => rowsOf(s, byPod ? `${s.pod.split('-').at(-1)}/${s.container}` : s.container, read[s.key]?.entries ?? []))),
    [read, picked, sources],
  );
  const rows = useMemo(() => {
    const f = find.toLowerCase();
    return all.filter((r) => (level === 'all' || r.level === level) && (!f || r.text.toLowerCase().includes(f)));
  }, [all, level, find]);

  const groups: PickGroup[] = (byPod ? [...new Set(sources.map((s) => s.pod))] : ['']).map((pod) => {
    const of = sources.filter((s) => !pod || s.pod === pod);
    return {
      key: pod || 'containers',
      ...(pod ? { label: pod, hint: say(t.containers, { count: of.length }) } : {}),
      items: of.map((s) => ({
        key: s.key,
        label: s.container,
        colour: s.colour,
        ...(s.role ? { tag: s.role } : {}),
        ...(s.restarts ? { hint: say(t.restarts, { count: s.restarts }) } : {}),
      })),
    };
  });
  const live = reading.some((s) => read[s.key]?.state === 'live');
  const errors = reading.map((s) => read[s.key]?.error && `${s.key}: ${read[s.key]?.error}`).filter(Boolean);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => `${r.time ?? ''} ${several ? `[${r.source?.name}] ` : ''}${r.text}`).join('\n')], { type: 'text/plain' }));
    a.download = `${pods.length === 1 ? pods[0].metadata?.name : namespace}.log`;
    a.click();
    // Let go once the download has it.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div class="uk-log-pane">
      {reading.map((s) => (
        <Reading
          key={s.key}
          namespace={namespace}
          source={s}
          back={back}
          onRead={(r) => setRead((now) => ({ ...now, [s.key]: r }))}
          onGone={() =>
            setRead((now) => {
              const { [s.key]: _, ...rest } = now;
              return rest;
            })
          }
        />
      ))}
      <div class="uk-log-bar">
        <GroupPicker
          groups={groups}
          picked={picked}
          onPick={pick}
          labels={{
            label: say(t.sources),
            all: say(byPod ? t.allPods : t.all),
            allShort: byPod ? say(t.podsShort, { count: groups.length }) : say(t.all),
            some: (n, of) => say(t.some, { picked: n, all: of }),
            search: say(byPod ? t.findPodSource : t.findSource),
          }}
        />
        <Segmented
          label={say(t.level)}
          value={level}
          onChange={setLevel}
          options={[
            { value: 'all', label: say(t.allLevels) },
            { value: 'warn', label: say(t.warnings) },
            { value: 'error', label: say(t.errors) },
          ]}
        />
        <span class="uk-log-bar-end">
          {live && !held ? (
            <Status tone="ok" icon="circle-play">
              {say(t.live, { count: all.length })}
            </Status>
          ) : live ? (
            <Status tone="waiting" icon="pause">
              {say(t.held, { count: all.length })}
            </Status>
          ) : (
            <Status tone="gone" icon="circle-check">
              {say(t.ended, { count: all.length })}
            </Status>
          )}
        </span>
      </div>
      <div class="uk-log-bar">
        <label class="uk-query">
          <Icon name="search" />
          <input class="uk-query-plain" aria-label={say(t.find)} placeholder={say(t.find)} value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
          {(find || level !== 'all') && <span class="uk-query-count">{say(t.found, { count: rows.length, all: all.length })}</span>}
        </label>
        <Button size="sm" variant="ghost" icon="clock" title={say(t.time)} aria-pressed={times} onClick={() => setTimes(!times)} />
        <Button size="sm" variant="ghost" icon="wrap" title={say(t.wrap)} aria-pressed={wrap} onClick={() => setWrap(!wrap)} />
        <Button size="sm" variant="ghost" icon="download" title={say(t.download)} onClick={download} />
      </div>
      {errors.length > 0 && (
        <Notice level="warn" icon="warning">
          {errors.join(' · ')}
        </Notice>
      )}
      <LogView
        rows={rows}
        times={times}
        wrap={wrap}
        find={find}
        sources={several}
        more={reading.some((s) => read[s.key]?.more)}
        loading={reading.some((s) => read[s.key]?.pending)}
        onOlder={() => setBack((b) => b + 1)}
        onHeld={setHeld}
        labels={{ newLines: (count) => say(t.newLines, { count }), older: say(t.older) }}
        empty={<Nothing icon="file">{say(t.none)}</Nothing>}
      />
    </div>
  );
}

/** A pod's log tab: its containers. */
export function PodLogs({ object }: ResourceProps) {
  const pods = useMemo(() => [object as PodLike], [object]);
  return <Logs pods={pods} byPod={false} />;
}

/** A workload's log tab: its pods (those its selector takes, in its namespace — asked by it), each its containers. */
export function WorkloadLogs({ object }: ResourceProps) {
  const say = useSay();
  const w = object as { metadata?: { namespace?: string }; spec?: { selector?: LabelSelector } };
  const namespace = w.metadata?.namespace ?? '';
  const selector = requirementsOf(w.spec?.selector);
  const filter = selector.length ? selectorCel(selector) : undefined;
  const list = useList<PodLike>({ kind: 'pods.v1', scope: { namespaces: [namespace] }, ...(filter ? { filter } : {}), sort: [{ field: 'core.name' }], page: { limit: 500 } });
  const pods = useMemo(() => (filter ? list.items.map((i) => i.object as PodLike) : []), [list.items, filter]);
  if (!pods.length) return list.state === 'loading' ? null : <Nothing icon="file">{say(t.noPods)}</Nothing>;
  return <Logs pods={pods} byPod />;
}

/** The kinds a log tab is of: a pod, and the workloads that run pods by a selector. */
export const LOGGED = { pod: Pod, workloads: [kinds.apps.v1.Deployment, kinds.apps.v1.StatefulSet, kinds.apps.v1.DaemonSet, kinds.apps.v1.ReplicaSet, kinds.batch.v1.Job] };
