import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { Action, accessOf, type Cluster, kindRef } from '@overkube/sdk';
import { useList, useNotify, useSay } from '@overkube/sdk/preact';
import { Button, Icon, Tip } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import { useEffect, useState } from 'preact/hooks';
import { editLockedBy } from './managed.ts';
import { T } from './texts.ts';

/*
 * A workload's replicas in its view's footer, as kubectl scale sets them:
 * − n +, the change made there (✓: spec.replicas patched; ×: kept as it
 * is). Its HorizontalPodAutoscaler marked (it sets them back within its
 * range); what Flux or Helm manages, or a controller owns (a
 * Deployment's ReplicaSet: it sets them back), locked, its tip saying by
 * what.
 */

const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { Deployment, StatefulSet, ReplicaSet } = kinds.apps.v1;

/** The kinds scaled from here (those with spec.replicas and a scale subresource). */
export const SCALED = [Deployment, StatefulSet, ReplicaSet];

/** The Action that says what scaling a kind needs (patch): its stepper drawn for one who may. */
export const scaleAction = (k: KindInfo) => `edit.${k.plural}.scale`;

const CSS = `
.ok-scale { display: inline-flex; align-items: center; gap: 2px; margin-right: auto; padding: 2px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); }
.ok-scale-n { min-width: 3ch; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
.ok-scale-n small { color: var(--uk-muted); font-weight: 400; margin-left: 4px; }
.ok-scale > .uk-tip-at { display: inline-flex; align-self: stretch; align-items: center; }
.ok-scale-hpa { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--uk-muted); }
.ok-scale-hpa .uk-icon { width: 14px; height: 14px; display: block; }
`;

type Hpa = KubeObject & { spec?: { scaleTargetRef?: { kind: string; name: string }; minReplicas?: number; maxReplicas?: number } };

export function Scale({ kind, object, cluster }: { kind: KindInfo; object: KubeObject; cluster: Cluster }) {
  const say = useSay();
  const notify = useNotify();
  // What scaling it needs (its Action's): one who may not, no stepper.
  const needs = useDefinition(Action, scaleAction(kind));
  const denied = !needs || accessOf(needs, { kind, object }) === 'denied';
  const now = (object as { spec?: { replicas?: number } }).spec?.replicas ?? 1;
  const name = object.metadata?.name ?? '';
  const [want, setWant] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const hpas = useList<KubeObject>({ kind: kindRef(HorizontalPodAutoscaler), scope: { namespaces: [object.metadata?.namespace ?? ''] }, page: { limit: 200 } });
  const hpa = hpas.items.flatMap((i) => (i.object ? [i.object as Hpa] : [])).find((h) => h.spec?.scaleTargetRef?.kind === kind.kind && h.spec.scaleTargetRef.name === name);
  // Scaled (here, or by another): its own count again.
  useEffect(() => setWant(null), [now]);
  // Its controller's too (a Deployment's ReplicaSet): its replicas set by it.
  const locked = editLockedBy(object, kind);
  const lock = locked ? { 'aria-disabled': 'true' as const, title: typeof locked === 'object' && 'label' in locked ? say(locked.label, locked.params) : say(locked) } : {};
  const value = want ?? now;
  const changed = want !== null && want !== now;
  const scale = async () => {
    setBusy(true);
    try {
      await cluster.patch(kind, object, { type: 'merge', patch: { spec: { replicas: value } } });
      notify({ level: 'ok', title: `${kind.kind} ${name}`, text: say(T.scale.scaled, { from: now, to: value }) });
    } catch (error) {
      notify({ level: 'error', title: say(T.scale.apply, { from: now, to: value }), text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };
  if (denied) return null;
  return (
    <>
      <style>{CSS}</style>
      {/* biome-ignore lint/a11y/useSemanticElements: a group of controls (ARIA), not a form's fieldset. */}
      <span class="ok-scale" role="group" aria-label={say(T.scale.replicas)} data-part="scale">
        <Button size="sm" variant="ghost" icon="minus" aria-label={say(T.scale.fewer)} disabled={!locked && value === 0} {...lock} onClick={() => !locked && setWant(value - 1)} />
        <span class="ok-scale-n" data-part="replicas">
          {value}
          {changed && <small>/{now}</small>}
        </span>
        <Button size="sm" variant="ghost" icon="plus" aria-label={say(T.scale.more)} {...lock} onClick={() => !locked && setWant(value + 1)} />
        {hpa && (
          <Tip content={() => say(T.scale.hpa, { name: hpa.metadata?.name ?? '', min: hpa.spec?.minReplicas ?? 1, max: hpa.spec?.maxReplicas ?? '' })}>
            <span class="ok-scale-hpa" role="img" aria-label="HorizontalPodAutoscaler">
              <Icon name="activity" />
            </span>
          </Tip>
        )}
        {changed && (
          <>
            <Button size="sm" variant="primary" icon="check" busy={busy} title={say(T.scale.apply, { from: now, to: value })} onClick={() => void scale()} />
            <Button size="sm" variant="ghost" icon="x" title={say(T.scale.cancel, { count: now })} onClick={() => setWant(null)} />
          </>
        )}
      </span>
    </>
  );
}
