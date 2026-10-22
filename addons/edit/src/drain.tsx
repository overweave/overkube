import { type KubeObject, kinds } from '@overkube/kube-types';
import { type Cluster, kindRef } from '@overkube/sdk';
import { OpenedView, useList, useSay } from '@overkube/sdk/preact';
import { Badge, Button, Notice, Status, Switch } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { refusalOf } from './asked.ts';
import { T } from './texts.ts';

/*
 * A node drained as kubectl drain does it: cordoned (spec.unschedulable),
 * then its pods evicted through the Eviction API, all at once — each one's
 * PodDisruptionBudget respected: refused (429) while it allows no
 * disruption, retried every 5s. Its pods grouped as kubectl tells them:
 * evicted; those a budget holds; mirror pods, ignored; DaemonSet-managed
 * ones, refused without --ignore-daemonsets; those of no controller,
 * refused without --force; emptyDir data, refused without
 * --delete-emptydir-data. Each group's flag in it. A pod evicted once it
 * is gone (its eviction accepted, it terminates meanwhile).
 */

const { Pod, Node } = kinds.core.v1;
const { PodDisruptionBudget } = kinds.policy.v1;

/** Between a refused eviction (its budget) and the next try (kubectl drain's). */
export const RETRY_MS = 5000;

export type Group = 'evict' | 'budget' | 'daemonSet' | 'mirror' | 'noController';

export interface DrainPod {
  pod: KubeObject;
  name: string;
  namespace: string;
  group: Group;
  emptyDir: boolean;
  /** The budget that holds it. */
  budget?: string;
}

type P = KubeObject & { spec?: { volumes?: { emptyDir?: unknown }[] }; status?: { phase?: string } };
type Selector = { matchLabels?: Record<string, string>; matchExpressions?: { key: string; operator: string; values?: string[] }[] };
type Budget = KubeObject & { spec?: { selector?: Selector }; status?: { disruptionsAllowed?: number } };

/** Whether a label selector picks these labels (its matchLabels and matchExpressions: In, NotIn, Exists, DoesNotExist); an empty one, all. */
export function selects(selector: Selector | undefined, labels: Readonly<Record<string, string>>): boolean {
  if (!selector) return false;
  const byLabels = Object.entries(selector.matchLabels ?? {}).every(([k, v]) => labels[k] === v);
  return (
    byLabels &&
    (selector.matchExpressions ?? []).every((e) => {
      const has = Object.hasOwn(labels, e.key);
      const v = labels[e.key];
      if (e.operator === 'In') return has && (e.values ?? []).includes(v as string);
      if (e.operator === 'NotIn') return !has || !(e.values ?? []).includes(v as string);
      if (e.operator === 'Exists') return has;
      if (e.operator === 'DoesNotExist') return !has;
      return false;
    })
  );
}

/** A node's pods, each in its group: what kubectl drain would do with it (budgets spent pod by pod, as evictions would). */
export function groupsOf(pods: readonly KubeObject[], budgets: readonly KubeObject[]): DrainPod[] {
  const left = new Map<KubeObject, number>();
  return pods.map((o): DrainPod => {
    const p = o as P;
    // Done (Succeeded, Failed): deleted as any, whatever owns it — its emptyDir data no reason to stop (kubectl's localStorageFilter).
    const done = p.status?.phase === 'Succeeded' || p.status?.phase === 'Failed';
    const base = { pod: p, name: p.metadata?.name ?? '', namespace: p.metadata?.namespace ?? '', emptyDir: !done && !!p.spec?.volumes?.some((v) => v.emptyDir) };
    const owner = p.metadata?.ownerReferences?.find((r) => r.controller);
    if (p.metadata?.annotations?.['kubernetes.io/config.mirror']) return { ...base, group: 'mirror' };
    if (owner?.kind === 'DaemonSet') return { ...base, group: 'daemonSet' };
    if (!owner && !done) return { ...base, group: 'noController' };
    const labels = p.metadata?.labels ?? {};
    const b = budgets.find((x) => x.metadata?.namespace === base.namespace && selects((x as Budget).spec?.selector, labels)) as Budget | undefined;
    if (b && !done) {
      const allowed = left.get(b) ?? b.status?.disruptionsAllowed ?? 0;
      left.set(b, allowed - 1);
      if (allowed <= 0) return { ...base, group: 'budget', budget: b.metadata?.name ?? '' };
    }
    return { ...base, group: 'evict' };
  });
}

const CSS = `
.ok-drain { display: flex; flex-direction: column; gap: 18px; grid-column: 1 / -1; }
.ok-drain-sum { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; }
.ok-drain-sum span { display: inline-flex; align-items: center; gap: 6px; }
.ok-drain-sum i { width: 8px; height: 8px; border-radius: 50%; }
.ok-drain-group { display: flex; flex-direction: column; gap: 8px; }
.ok-drain-head { display: flex; align-items: baseline; gap: 8px; }
.ok-drain-head b { font-size: 12px; color: var(--uk-muted); font-weight: 500; }
.ok-drain-head small { color: var(--uk-muted); font-size: 12px; }
.ok-drain-list { display: flex; flex-direction: column; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: hidden; }
.ok-drain-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 12px; font-size: 12px; }
.ok-drain-row + .ok-drain-row { border-top: 1px solid var(--uk-border); }
.ok-drain-row > span:first-child { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ok-drain-row b { font-family: var(--uk-mono); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok-drain-row em { font-style: normal; color: var(--uk-muted); }
.ok-drain-note { color: var(--uk-muted); font-size: 12px; line-height: 1.5; }
.ok-drain-group[data-tone='error'] .ok-drain-list { border-color: color-mix(in srgb, var(--uk-error) 45%, var(--uk-border)); }
.ok-drain-group[data-tone='warn'] .ok-drain-list { border-color: color-mix(in srgb, var(--uk-warn) 45%, var(--uk-border)); }
`;

const GROUPS: { group: Group; title: typeof T.drain.evict; note: typeof T.drain.evict; tone: string }[] = [
  { group: 'noController', title: T.drain.noController, note: T.drain.noControllerNote, tone: 'var(--uk-error)' },
  { group: 'evict', title: T.drain.evict, note: T.drain.evictNote, tone: 'var(--uk-ok)' },
  { group: 'budget', title: T.drain.budget, note: T.drain.budgetNote, tone: 'var(--uk-warn)' },
  { group: 'daemonSet', title: T.drain.daemonSet, note: T.drain.daemonSetNote, tone: 'var(--uk-muted)' },
  { group: 'mirror', title: T.drain.mirror, note: T.drain.mirrorNote, tone: 'var(--uk-muted)' },
];

/** Each pod's eviction as it goes (accepted: evicting, till it is gone). */
type Step = 'pending' | 'evicting' | 'accepted' | 'evicted' | 'retrying' | 'error';
type Progress = Readonly<Record<string, Step>>;

export function Drain({ object, cluster, onClose }: { object: KubeObject; cluster: Cluster; onClose: () => void }) {
  const say = useSay();
  const node = object.metadata?.name ?? '';
  const pods = useList<KubeObject>({ kind: kindRef(Pod), where: { field: 'pods.v1.node', op: 'eq', value: node }, page: { limit: 1000 } });
  const budgets = useList<KubeObject>({ kind: kindRef(PodDisruptionBudget), page: { limit: 1000 } });
  const [force, setForce] = useState(false);
  const [emptyDir, setEmptyDir] = useState(false);
  const [daemonSets, setDaemonSets] = useState(false);
  // The pods as they were when the drain began (evicted ones go from the list): the drain's own.
  const [drained, setDrained] = useState<DrainPod[] | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [refused, setRefused] = useState<string | null>(null);
  // Asked to close while it goes: once more to stop it.
  const [leaving, setLeaving] = useState(false);
  // Gone (closed): no eviction more, its waits cut short.
  const stopped = useRef(false);
  const waits = useRef(new Set<() => void>());
  useEffect(
    () => () => {
      stopped.current = true;
      for (const done of waits.current) done();
    },
    [],
  );
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(at);
        waits.current.delete(done);
        resolve();
      };
      const at = setTimeout(done, ms);
      waits.current.add(done);
    });
  const objects = (l: { items: readonly { object?: unknown }[] }) => l.items.flatMap((i) => (i.object ? [i.object as KubeObject] : []));
  const all = drained ?? groupsOf(objects(pods), objects(budgets));
  const of = (g: Group) => all.filter((p) => p.group === g);
  const evicted = (list: readonly DrainPod[]) => list.filter((p) => p.group === 'evict' || p.group === 'budget' || (p.group === 'noController' && force));
  const needsForce = of('noController').length > 0 && !force;
  const needsDaemonSets = of('daemonSet').length > 0 && !daemonSets;
  // Its flag in the first group with a pod of emptyDir data (one evicted loses it).
  const emptyDirGroup = all.find((p) => p.emptyDir && p.group !== 'daemonSet' && p.group !== 'mirror')?.group;
  const needsEmptyDir = emptyDirGroup !== undefined && !emptyDir;
  const key = (p: DrainPod) => `${p.namespace}/${p.name}`;

  const start = async () => {
    const list = evicted(all);
    setRefused(null);
    setDrained(all);
    setProgress(Object.fromEntries(list.map((p) => [key(p), 'pending' as const])));
    // Cordoned first: refused, nothing evicted — said, and to be asked again.
    try {
      await cluster.patch(Node, object, { type: 'merge', patch: { spec: { unschedulable: true } } });
    } catch (error) {
      setDrained(null);
      setProgress({});
      setRefused(refusalOf(error).message);
      return;
    }
    // Each evicted at once, as kubectl drain does: one a budget refuses (429) tried again every RETRY_MS — till it goes, or the dialog does.
    const one = async (p: DrainPod) => {
      setProgress((now) => ({ ...now, [key(p)]: 'evicting' }));
      for (;;) {
        if (stopped.current) return;
        try {
          await cluster.evict(p.pod);
          setProgress((now) => ({ ...now, [key(p)]: 'accepted' }));
          return;
        } catch (error) {
          const r = refusalOf(error);
          // Gone already (done, or replaced meanwhile): as kubectl drain, evicted.
          if (r.status === 404) {
            setProgress((now) => ({ ...now, [key(p)]: 'evicted' }));
            return;
          }
          if (r.status !== 429) {
            setProgress((now) => ({ ...now, [key(p)]: 'error' }));
            setErrors((now) => ({ ...now, [key(p)]: r.message }));
            return;
          }
          setProgress((now) => ({ ...now, [key(p)]: 'retrying' }));
          await wait(RETRY_MS);
        }
      }
    };
    await Promise.all(list.map(one));
  };

  // Its eviction accepted: evicting still, till it is gone from the node (that pod: its uid).
  const there = new Set(objects(pods).map((o) => o.metadata?.uid));
  const step = (p: DrainPod): Step | undefined => {
    const s = progress[key(p)];
    return s === 'accepted' ? (there.has(p.pod.metadata?.uid) ? 'evicting' : 'evicted') : s;
  };
  const state = (p: DrainPod): ComponentChildren => {
    if (p.group === 'mirror' || (p.group === 'daemonSet' && daemonSets)) return <Badge>{say(T.drain.ignored)}</Badge>;
    const s = step(p);
    if (!drained) return null;
    if (s === 'evicting')
      return (
        <Status tone="progress" icon="spinner">
          {say(T.drain.evicting)}
        </Status>
      );
    if (s === 'evicted')
      return (
        <Status tone="ok" icon="circle-check">
          {say(T.drain.evicted)}
        </Status>
      );
    if (s === 'retrying')
      return (
        <Status tone="warn" icon="hourglass">
          {say(T.drain.retry)}
        </Status>
      );
    if (s === 'error')
      return (
        <Status tone="error" icon="circle-x" title={errors[key(p)] ?? ''}>
          {say(T.drain.failed)}
        </Status>
      );
    return s === 'pending' ? <span class="uk-quiet">{say(T.drain.pending)}</span> : null;
  };

  const list = drained ? evicted(drained) : [];
  const finished = list.filter((p) => step(p) === 'evicted' || step(p) === 'error').length;
  const retrying = list.filter((p) => step(p) === 'retrying').length;
  const groups = GROUPS.filter((g) => of(g.group).length);
  // Still going: closing it stops it (asked once more, said what is left).
  const going = !!drained && finished < list.length;
  const close = () => (going && !leaving ? setLeaving(true) : onClose());

  return (
    <OpenedView
      title={say(T.drain.title, { name: node })}
      // Its X, Escape: as its Close (asked once more while it goes).
      onClose={close}
      footer={
        <div class="uk-bar" style={{ width: '100%' }} data-part="drain-footer">
          <span class="uk-quiet" style={{ fontSize: '12px' }}>
            {going && leaving
              ? say(T.drain.stopWarning, { name: node, count: list.length - finished })
              : drained
                ? finished >= list.length
                  ? say(T.drain.done, { name: node })
                  : retrying && finished + retrying >= list.length
                    ? say(T.drain.retrying, { name: node, count: retrying })
                    : say(T.drain.progress, { done: Math.min(finished + 1, list.length), count: list.length })
                : needsForce
                  ? say(T.drain.needsForce)
                  : needsDaemonSets
                    ? say(T.drain.needsDaemonSets)
                    : needsEmptyDir
                      ? say(T.drain.needsEmptyDir)
                      : say(T.drain.ready, { name: node })}
          </span>
          <span style={{ flex: 1 }} />
          {going && leaving && (
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              {say(T.drain.keep)}
            </Button>
          )}
          <Button variant={going && leaving ? 'danger' : 'ghost'} onClick={close}>
            {going && leaving ? say(T.drain.stop) : drained ? say(T.close) : say(T.cancel)}
          </Button>
          {!drained && (
            <Button variant="danger" icon="way-out" disabled={needsForce || needsDaemonSets || needsEmptyDir || pods.state === 'loading'} onClick={() => void start()}>
              {say(T.drain.start)}
            </Button>
          )}
        </div>
      }
    >
      <style>{CSS}</style>
      <div class="ok-drain" data-part="drain">
        {refused && (
          <Notice level="error" icon="warning" title={say(T.drain.cordonRefused, { name: node })}>
            {refused}
          </Notice>
        )}
        <div class="ok-drain-sum">
          <b>{say(T.drain.pods, { count: all.length })}</b>
          {groups.map((g) => (
            <span key={g.group}>
              <i style={{ background: g.tone }} />
              {say(g.title)} {of(g.group).length}
            </span>
          ))}
        </div>
        {groups.map((g) => {
          const tone = (g.group === 'noController' && !force) || (g.group === 'daemonSet' && !daemonSets) ? 'error' : g.group === 'budget' ? 'warn' : undefined;
          return (
            <div key={g.group} class="ok-drain-group" data-group={g.group} data-tone={tone}>
              <span class="ok-drain-head">
                <b>{say(g.title)}</b>
                <small>{of(g.group).length}</small>
              </span>
              <div class="ok-drain-list">
                {of(g.group).map((p) => (
                  <div key={key(p)} class="ok-drain-row" data-pod={key(p)}>
                    <span>
                      <b>{p.name}</b>
                      <em>{p.namespace}</em>
                      {p.emptyDir && <Badge>emptyDir</Badge>}
                      {p.budget && <em>{say(T.drain.budgetOf, { name: p.budget })}</em>}
                    </span>
                    {state(p)}
                  </div>
                ))}
              </div>
              <span class="ok-drain-note">
                {say(g.group === 'noController' && force ? T.drain.forcedNote : g.group === 'daemonSet' && !daemonSets ? T.drain.daemonSetRefused : g.note)}
              </span>
              {!drained && g.group === 'noController' && <Switch checked={force} onChange={setForce} label={say(T.drain.force)} />}
              {!drained && g.group === 'daemonSet' && <Switch checked={daemonSets} onChange={setDaemonSets} label={say(T.drain.ignoreDaemonSets)} />}
              {!drained && g.group === emptyDirGroup && <Switch checked={emptyDir} onChange={setEmptyDir} label={say(T.drain.emptyDir)} />}
            </div>
          );
        })}
      </div>
    </OpenedView>
  );
}
