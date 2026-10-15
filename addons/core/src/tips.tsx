import type { KindInfo, KubeObject, kinds, ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceConditionProps, type ResourceContainerProps, type ResourceProps, slots } from '@overkube/sdk';
import { fill, tipField, useGet, useSay } from '@overkube/sdk/preact';
import { Skeleton, TipCard, TipField } from '@overkube/uikit';
import type { SlotRef } from '@overweave/ui';
import { slotElement, useSlotView } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { Since } from './details.tsx';
import { RefusedQuietly, refused } from './refused.tsx';
import { StatusOf } from './statuses.tsx';
import { T } from './texts.ts';

/*
 * The core's tips: about a condition (a mark in a table's cell) — the
 * object read as it is shown (once, the source's: every part of it given
 * it; on its way, a placeholder; refused, why; not there, so), its parts the slots' (slots.tip.condition): the core's title (its
 * type, the object's kind and name), fields (its status, reason, when it
 * last changed), its message; another's beside them. About a pod's
 * container (a mark in its Container States): the core's title (its name,
 * the pod's), fields (its state, as a mark and its words — kubectl's,
 * a reason where it waits or ended; its exit code; its restarts; when it
 * started; its image), its state's message. About a node's taints (its
 * Taints count): the core's title, each taint.
 */

/** A tip's card of its parts' slots, drawn with the same props — nothing in any of them: none (the tip not shown). */
function Card<P>({ parts, props }: { parts: Record<'title' | 'fields' | 'sections' | 'actions', SlotRef<P>>; props: P }) {
  const title = useSlotView(parts.title, props).selected.length;
  const fields = useSlotView(parts.fields, props).selected.length;
  const sections = useSlotView(parts.sections, props).selected.length;
  const actions = useSlotView(parts.actions, props).selected.length;
  if (!title && !fields && !sections && !actions) return null;
  return (
    <TipCard
      title={title > 0 && slotElement(parts.title, props, { limit: 1 })}
      fields={fields > 0 && slotElement(parts.fields, props)}
      sections={sections > 0 && slotElement(parts.sections, props)}
      actions={actions > 0 && slotElement(parts.actions, props)}
    />
  );
}

/** The object a tip is about, read as it is shown: there, drawn by the tip; on its way, a placeholder; refused, why; not there, so. */
function Read<O extends KubeObject>({
  kind,
  namespace,
  name,
  children,
}: {
  kind: KindInfo;
  namespace?: string | undefined;
  name: string;
  children: (object: O) => ComponentChildren;
}) {
  const say = useSay();
  const got = useGet<O>({ kind: kindRef(kind), ...(namespace ? { namespace } : {}), name });
  if (got.object) return <>{children(got.object)}</>;
  if (got.state === 'loading') return <Skeleton width="180px" />;
  if (refused(got)) return <RefusedQuietly kind={kind} error={got.error} />;
  return <span class="uk-muted">{say(T.resource.view.missing.gone, { kind: kind.kind, name })}</span>;
}

/** A condition's tip: its object read, the condition of its type found in it (none now: no tip). */
export function ConditionTip({ kind, namespace, name, type }: { kind: KindInfo; namespace?: string; name: string; type: string }) {
  return (
    <Read kind={kind} namespace={namespace} name={name}>
      {(object) => {
        const conditions = ((object as { status?: { conditions?: ResourceConditionProps['condition'][] } }).status?.conditions ?? []) as ResourceConditionProps['condition'][];
        const condition = conditions.find((c) => c.type === type);
        return condition ? <Card parts={slots.tip.condition} props={{ kind, object, condition }} /> : null;
      }}
    </Read>
  );
}

type Pod = ObjectOf<typeof kinds.core.v1.Pod>;

/** A container's state as kubectl's words: running (ready or not), waiting or terminated (its reason). */
export const stateOf = (status: ResourceContainerProps['container']['status']): string => {
  const s = status?.state;
  if (s?.running) return status?.ready ? 'Running' : 'NotReady';
  if (s?.waiting) return s.waiting.reason ?? 'Waiting';
  if (s?.terminated) return s.terminated.reason ?? 'Terminated';
  return 'Unknown';
};

/** A pod's container's tip: the pod read, the container of its name found in it (an init container's, an ephemeral one's too; none now: no tip). */
export function ContainerTip({ kind, namespace, name, container }: { kind: KindInfo; namespace?: string; name: string; container: string }) {
  return (
    <Read<Pod & KubeObject> kind={kind} namespace={namespace} name={name}>
      {(object) => {
        const spec = object.spec;
        const status = object.status;
        const init = (spec?.initContainers ?? []).find((c) => c.name === container);
        const ephemeral = (spec?.ephemeralContainers ?? []).find((c) => c.name === container) as ResourceContainerProps['container']['spec'] | undefined;
        const found = (spec?.containers ?? []).find((c) => c.name === container) ?? init ?? ephemeral;
        if (!found) return null;
        const role = found === init ? 'init' : found === ephemeral ? 'ephemeral' : undefined;
        const own = [...(status?.containerStatuses ?? []), ...(status?.initContainerStatuses ?? []), ...(status?.ephemeralContainerStatuses ?? [])].find(
          (c) => c.name === container,
        );
        return (
          <Card parts={slots.tip.container} props={{ kind, object, container: { name: container, ...(role ? { role } : {}), spec: found, ...(own ? { status: own } : {}) } }} />
        );
      }}
    </Read>
  );
}

type Node = ObjectOf<typeof kinds.core.v1.Node>;

/** A node's taints' tip: the node read. */
export function TaintsTip({ kind, name }: { kind: KindInfo; name: string }) {
  return (
    <Read kind={kind} name={name}>
      {(object) => <Card parts={slots.tip.taints} props={{ kind, object }} />}
    </Read>
  );
}

/** Each taint of a node: its key, its value and effect, since when (a NoExecute one's). */
function Taints({ object }: ResourceProps) {
  const taints = (object as Node).spec?.taints ?? [];
  return (
    <dl class="uk-tip-fields">
      {taints.map((t) => (
        <TipField key={`${t.key}:${t.effect}`} label={t.key}>
          {[t.value, t.effect].filter(Boolean).join(':')}
          {t.timeAdded && (
            <>
              {' '}
              (<Since time={t.timeAdded} />)
            </>
          )}
        </TipField>
      ))}
    </dl>
  );
}

function ContainerTitle({ object, container }: ResourceContainerProps) {
  return <>{useSay()(T.tip.container.title, { container: container.name, name: object.metadata?.name ?? '' })}</>;
}

function ConditionTitle({ kind, object, condition }: ResourceConditionProps) {
  return <>{useSay()(T.tip.condition.title, { type: condition.type, kind: kind.kind, name: object.metadata?.name ?? '' })}</>;
}

/** The core's parts of the tips. */
export function addTips(c: KubeContributor): void {
  const t = T.tip.condition;
  const tip = slots.tip.condition;
  c.add('Fill', 'core.tip.condition.title', fill(tip.title, { order: 1000, render: ConditionTitle }));
  c.add('Fill', 'core.tip.condition.status', tipField(tip.fields, { order: 100, label: t.status, value: ({ condition }) => condition.status }));
  c.add('Fill', 'core.tip.condition.reason', tipField(tip.fields, { order: 200, label: t.reason, value: ({ condition }) => condition.reason }));
  c.add(
    'Fill',
    'core.tip.condition.last-transition',
    tipField(tip.fields, { order: 300, label: t.lastTransition, value: ({ condition }) => <Since time={condition.lastTransitionTime} /> }),
  );
  c.add(
    'Fill',
    'core.tip.taints.title',
    fill(slots.tip.taints.title, { order: 1000, render: ({ object }: ResourceProps) => <>{useSay()(T.tip.taints.title, { name: object.metadata?.name ?? '' })}</> }),
  );
  c.add('Fill', 'core.tip.taints.list', fill(slots.tip.taints.sections, { order: 100, render: Taints }));
  const k = T.tip.container;
  const box = slots.tip.container;
  const state = ({ container }: ResourceContainerProps) => container.status?.state;
  c.add('Fill', 'core.tip.container.title', fill(box.title, { order: 1000, render: ContainerTitle }));
  c.add(
    'Fill',
    'core.tip.container.state',
    tipField(box.fields, { order: 100, label: k.state, value: ({ kind, container }) => <StatusOf kind={kind} words={stateOf(container.status)} /> }),
  );
  c.add(
    'Fill',
    'core.tip.container.exit-code',
    tipField(box.fields, { order: 300, label: k.exitCode, when: (p) => state(p)?.terminated !== undefined, value: (p) => String(state(p)?.terminated?.exitCode ?? '') }),
  );
  c.add(
    'Fill',
    'core.tip.container.restarts',
    tipField(box.fields, { order: 400, label: k.restarts, when: ({ container }) => !!container.status, value: ({ container }) => String(container.status?.restartCount ?? 0) }),
  );
  c.add(
    'Fill',
    'core.tip.container.started',
    tipField(box.fields, { order: 500, label: k.started, when: (p) => !!state(p)?.running?.startedAt, value: (p) => <Since time={state(p)?.running?.startedAt} /> }),
  );
  c.add('Fill', 'core.tip.container.image', tipField(box.fields, { order: 600, label: k.image, value: ({ container }) => <code>{container.spec.image}</code> }));
  c.add(
    'Fill',
    'core.tip.container.message',
    fill(box.sections, {
      order: 100,
      when: (p) => !!(state(p)?.waiting?.message || state(p)?.terminated?.message),
      render: (p: ResourceContainerProps) => <div class="uk-muted">{state(p)?.waiting?.message ?? state(p)?.terminated?.message}</div>,
    }),
  );
  c.add(
    'Fill',
    'core.tip.condition.message',
    fill(tip.sections, {
      order: 100,
      when: ({ condition }) => !!condition.message,
      render: ({ condition }: ResourceConditionProps) => <div class="uk-muted">{condition.message}</div>,
    }),
  );
}
