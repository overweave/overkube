import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { Cluster, RemoveOptions } from '@overkube/sdk';
import { kindRef } from '@overkube/sdk';
import { OpenedView, useList, useNotify, useSay } from '@overkube/sdk/preact';
import { Button, Notice } from '@overkube/uikit';
import { useState } from 'preact/hooks';
import { refusalOf } from './asked.ts';
import { T } from './texts.ts';

/*
 * An object deleted as kubectl delete does it: its dependents shown (what
 * owns them, by their ownerReferences: a Deployment's ReplicaSets and
 * pods, a workload's pods, a CronJob's Jobs), its cascade chosen
 * (background, the default; foreground; orphan), its name typed to say so.
 * Deleted by its uid: not one made anew under its name since.
 */

const { Pod, Namespace, ReplicationController } = kinds.core.v1;
const { ReplicaSet, Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;

/** The kinds whose pods are theirs (a level down: a Deployment's ReplicaSets', a CronJob's Jobs'). */
const POD_OWNERS = [Deployment, ReplicaSet, StatefulSet, DaemonSet, ReplicationController, Job, CronJob];

type Policy = NonNullable<RemoveOptions['propagationPolicy']>;
const POLICIES: { policy: Policy; term: string; hint: typeof T.delete.background }[] = [
  { policy: 'Background', term: 'background', hint: T.delete.background },
  { policy: 'Foreground', term: 'foreground', hint: T.delete.foreground },
  { policy: 'Orphan', term: 'orphan', hint: T.delete.orphan },
];

const CSS = `
.ok-edit-delete { display: flex; flex-direction: column; gap: 20px; grid-column: 1 / -1; }
.ok-edit-part { display: flex; flex-direction: column; gap: 8px; }
.ok-edit-head { color: var(--uk-muted); font-size: 12px; font-weight: 500; }
.ok-edit-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ok-edit-list li { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: baseline; gap: 12px; font-size: 13px; }
.ok-edit-list li > span:first-child { color: var(--uk-muted); }
.ok-edit-list li > span:last-child { font-family: var(--uk-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok-edit-list[data-kept] li > span:last-child { color: var(--uk-muted); }
.ok-edit-hint { color: var(--uk-muted); font-size: 12px; line-height: 1.5; }
.ok-edit-hint b { color: var(--uk-text); font-family: var(--uk-mono); font-weight: 500; }
.ok-edit-cascade { display: flex; flex-direction: column; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: hidden; }
.ok-edit-cascade label { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; column-gap: 10px; align-items: baseline; padding: 9px 12px; cursor: pointer; }
.ok-edit-cascade label + label { border-top: 1px solid var(--uk-border); }
.ok-edit-cascade label:has(input:checked) { background: var(--uk-panel-2); }
.ok-edit-cascade input { margin: 0; accent-color: var(--uk-accent); align-self: center; }
.ok-edit-cascade b { font: 500 13px var(--uk-mono); }
.ok-edit-cascade small { grid-column: 2 / -1; color: var(--uk-muted); font-size: 12px; margin-top: 2px; }
.ok-edit-cascade code { grid-column: 3; grid-row: 1; color: var(--uk-muted); font: 11px var(--uk-mono); }
`;

const ownedBy = (o: KubeObject | undefined, uid: string | undefined) => !!uid && !!o?.metadata?.ownerReferences?.some((r) => r.uid === uid);

/** Its dependents, as their ownerReferences say: those of the kinds a workload owns (and theirs, a level down). */
function useDependents(kind: KindInfo, object: KubeObject): { list: [string, string][]; more: boolean } {
  const ns = object.metadata?.namespace ?? '';
  const uid = object.metadata?.uid;
  const scope = { namespaces: [ns] };
  const owns = (k: KindInfo, of: readonly KindInfo[]) => of.some((x) => x.id === k.id);
  const sets = useList<KubeObject>(owns(kind, [Deployment]) ? { kind: kindRef(ReplicaSet), scope, page: { limit: 200 } } : undefined);
  const jobs = useList<KubeObject>(owns(kind, [CronJob]) ? { kind: kindRef(Job), scope, page: { limit: 200 } } : undefined);
  const pods = useList<KubeObject>(owns(kind, POD_OWNERS) ? { kind: kindRef(Pod), scope, page: { limit: 500 } } : undefined);
  const objects = (l: { items: readonly { object?: unknown }[] }) => l.items.flatMap((i) => (i.object ? [i.object as KubeObject] : []));
  const mine = [...objects(sets), ...objects(jobs)].filter((o) => ownedBy(o, uid));
  const owners = new Set([uid, ...mine.map((o) => o.metadata?.uid)]);
  const myPods = objects(pods).filter((p) => p.metadata?.ownerReferences?.some((r) => owners.has(r.uid)));
  // Past a window of them (a namespace of very many): more than shown, said so.
  const more = [sets, jobs, pods].some((l) => l.next !== undefined);
  return {
    list: [...mine.map((o): [string, string] => [o.kind ?? '', o.metadata?.name ?? '']), ...myPods.map((p): [string, string] => ['Pod', p.metadata?.name ?? ''])],
    more,
  };
}

export function Delete({ kind, object, cluster, onClose }: { kind: KindInfo; object: KubeObject; cluster: Cluster; onClose: () => void }) {
  const say = useSay();
  const notify = useNotify();
  const name = object.metadata?.name ?? '';
  const [typed, setTyped] = useState('');
  const [policy, setPolicy] = useState<Policy>('Background');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const { list: dependents, more } = useDependents(kind, object);
  const remove = async () => {
    setBusy(true);
    setRefused(null);
    try {
      await cluster.remove(kind, object, { propagationPolicy: policy });
      notify({ level: 'ok', title: `${kind.kind} ${name}`, text: say(T.delete.deleted) });
      onClose();
    } catch (error) {
      setRefused(refusalOf(error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <OpenedView
      title={say(T.delete.title, { kind: kind.kind, name })}
      onClose={onClose}
      footer={
        <div class="uk-bar" style={{ width: '100%', justifyContent: 'flex-end' }} data-part="delete-footer">
          <Button variant="ghost" onClick={onClose}>
            {say(T.cancel)}
          </Button>
          <Button variant="danger" icon="trash" busy={busy} disabled={typed !== name} onClick={() => void remove()}>
            {say(T.actions.delete)}
          </Button>
        </div>
      }
    >
      <style>{CSS}</style>
      <div class="ok-edit-delete" data-part="delete">
        {refused && (
          <Notice level="error" icon="warning" title={say(T.delete.title, { kind: kind.kind, name })}>
            {refused}
          </Notice>
        )}
        {kind.id === Namespace.id && (
          <Notice level="error" icon="warning" title={`Namespace ${name}`}>
            {say(T.delete.namespace, { name })}
          </Notice>
        )}
        {dependents.length > 0 && (
          <div class="ok-edit-part">
            <span class="ok-edit-head">{policy === 'Orphan' ? say(T.delete.orphaned) : say(T.delete.dependents)}</span>
            <ul class="ok-edit-list" data-kept={policy === 'Orphan' ? '' : undefined}>
              {dependents.map(([k, n]) => (
                <li key={`${k}/${n}`}>
                  <span>{k}</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
            {more && <span class="ok-edit-hint">{say(T.delete.more)}</span>}
          </div>
        )}
        <div class="ok-edit-part">
          <span class="ok-edit-head">{say(T.delete.cascade)}</span>
          <div class="ok-edit-cascade" role="radiogroup" aria-label={say(T.delete.cascade)}>
            {POLICIES.map((p) => (
              <label key={p.policy}>
                <input type="radio" name="cascade" checked={policy === p.policy} onChange={() => setPolicy(p.policy)} />
                <b>{p.term}</b>
                <code>{p.policy === 'Background' ? say(T.delete.default) : ''}</code>
                <small>{say(p.hint)}</small>
              </label>
            ))}
          </div>
        </div>
        <label class="ok-edit-part">
          <span class="ok-edit-head">{say(T.delete.confirm)}</span>
          <input
            class="uk-input uk-mono"
            placeholder={name}
            value={typed}
            onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
            // Its name typed, Enter deletes it (as the button would).
            onKeyDown={(e) => e.key === 'Enter' && typed === name && !busy && void remove()}
          />
          <span class="ok-edit-hint">{say(T.delete.type, { name })}</span>
        </label>
      </div>
    </OpenedView>
  );
}
