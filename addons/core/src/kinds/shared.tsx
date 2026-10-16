import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { Where } from '@overkube/query';
import { filterIn, forKinds, type KubeContributor, kindPath, kindRef, type Label, type ResourceProps, slots } from '@overkube/sdk';
import { useList, usePage, useSay } from '@overkube/sdk/preact';
import { Badge, Chips } from '@overkube/uikit';
import { fill, slotElement } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { relatedField, useChipLabels } from '../details.tsx';
import { titleOf } from '../kinds.ts';
import { ObjectRef } from '../refs.tsx';
import { RefusedQuietly, refused } from '../refused.tsx';
import { type Selector, selectorFilter } from '../selectors.ts';
import { T } from '../texts.ts';

/*
 * What the usual kinds' views share: a label selector as it is shown (its
 * labels as chips, its expressions as kubectl says them — leading to the
 * pods it picks), as a filter (CEL) and as a test of labels; what points
 * at an object (selects it, scales it, binds it,
 * routes to it, uses it) — each a related field of some kinds.
 */

export type { Selector } from '../selectors.ts';

/** A selector's expression as kubectl says it: tier in (a, b), env notin (dev), team (it exists), !old (it does not). */
export function said({ key, operator, values = [] }: NonNullable<Selector['matchExpressions']>[number]): string {
  if (operator === 'Exists') return key;
  if (operator === 'DoesNotExist') return `!${key}`;
  return `${key} ${operator.toLowerCase()} (${values.join(', ')})`;
}

/** A selector shown: its labels as chips, its expressions as badges — and as text; none of either: undefined. */
export function shown(selector: Selector | undefined): [ComponentChildren, string] | undefined {
  const labels = selector?.matchLabels ?? {};
  const expressions = (selector?.matchExpressions ?? []).map(said);
  if (!Object.keys(labels).length && !expressions.length) return undefined;
  return [
    <span class="uk-badges">
      {Object.keys(labels).length > 0 && <LabelChips items={labels} />}
      {expressions.map((e) => (
        <Badge key={e}>{e}</Badge>
      ))}
    </span>,
    [...Object.entries(labels).map(([k, v]) => `${k}=${v}`), ...expressions].join(', '),
  ];
}

/** A selector's labels as chips, in the page's language. */
const LabelChips = ({ items }: { items: Record<string, string> }) => <Chips items={items} labels={useChipLabels()} />;

const { Pod } = kinds.core.v1;

/** A selector leading to the pods it picks (of its namespace): its labels' chips, its expressions' badges — each a link there. */
function Picking({ selector, namespace, text }: { selector: Selector; namespace: string | undefined; text: string }) {
  const page = usePage();
  const say = useSay();
  const chips = useChipLabels();
  const href = page.href(filterIn(kindPath(Pod), selectorFilter(selector, namespace)));
  const follow = say(T.resource.view.metadata.follow, { kind: titleOf(Pod), text });
  const labels = selector.matchLabels ?? {};
  return (
    <span class="uk-badges">
      {Object.keys(labels).length > 0 && <Chips items={labels} labels={{ ...chips, follow: () => follow }} href={() => href} />}
      {(selector.matchExpressions ?? []).map(said).map((e) => (
        <a key={e} class="uk-badge-link" href={href} aria-label={follow}>
          <Badge>{e}</Badge>
        </a>
      ))}
    </span>
  );
}

/** A selector of an object (its namespace's pods it picks) shown as a link to them, and as text; none of it: undefined. */
export function pickingLink(selector: Selector | undefined, namespace: string | undefined): [ComponentChildren, string] | undefined {
  const text = shown(selector)?.[1];
  return selector && text ? [<Picking selector={selector} namespace={namespace} text={text} />, text] : undefined;
}

/** A related field of some kinds (a fill of resource.view.related, for them: core.resource.view.related.<of>.<name>): its order, label, what it reads of the object. */
export function addRelated<O extends KubeObject>(
  c: KubeContributor,
  [of, ...kinds]: [string, ...{ id: string }[]],
  name: string,
  order: number,
  label: Label,
  read: (object: O) => [drawn: ComponentChildren, display: string] | undefined,
): void {
  c.add('Fill', `core.resource.view.related.${of}.${name}`, fill(slots.resource.view.related, { order, target: forKinds(...kinds), render: relatedField<O>(name, label, read) }));
}

/** Whether a label selector picks these labels: all its labels, all its expressions (an empty selector picks every one; none, none). */
export function picks(selector: Selector | undefined, labels: Record<string, string> | undefined): boolean {
  if (!selector) return false;
  const have = labels ?? {};
  return (
    Object.entries(selector.matchLabels ?? {}).every(([k, v]) => have[k] === v) &&
    (selector.matchExpressions ?? []).every(({ key, operator, values = [] }) => {
      if (operator === 'In') return key in have && values.includes(have[key] as string);
      if (operator === 'NotIn') return !(key in have) || !values.includes(have[key] as string);
      if (operator === 'Exists') return key in have;
      if (operator === 'DoesNotExist') return !(key in have);
      return false;
    })
  );
}

/** How many of those that point at it are named at most (the rest counted). */
const MATCHED = 20;
/** How many of a kind are looked through for those pointing at it (a namespace's: few). */
const LOOKED = 500;

/**
 * What points at an object (what it is tied to, the other way): the objects
 * of a kind — in its namespace, or (cluster-scoped, or any namespace)
 * everywhere — that one's test takes (its selector picks it, its ref names
 * it), looked through here; each a link, the rest counted.
 */
export interface Pointing<O extends KubeObject> {
  kind: KindInfo;
  /** In which namespace (none: every one allowed). */
  namespace?: string | undefined;
  /** Those that point at it, as the cluster can tell (a field of theirs: a pod's config maps); none: all, looked through by test. */
  where?: Where;
  /** Whether it points at the object (none: all those asked). */
  test?: (other: O) => boolean;
  /** Their kind not said (where it goes without saying: the pods using it). */
  quiet?: boolean;
}

/** Those pointing at it, asked of the cluster and looked through: what is found, refused, still coming. */
function usePointing<O extends KubeObject>({ kind, namespace, where, test }: Pointing<O>) {
  const answer = useList<O>({ kind: kindRef(kind), ...(namespace ? { scope: { namespaces: [namespace] } } : {}), ...(where ? { where } : {}), page: { offset: 0, limit: LOOKED } });
  const found = answer.items.flatMap((i) => (i.object && (test?.(i.object) ?? true) ? [i.object] : []));
  return { found, answer };
}

/**
 * A related field of some kinds, of what points at them (a fill of
 * resource.view.related, for them: core.resource.view.related.<of>.<name>):
 * none pointing (and none refused), not drawn.
 */
export function addPointing<O extends KubeObject>(
  c: KubeContributor,
  [of, ...forThem]: [string, ...KindInfo[]],
  name: string,
  order: number,
  label: Label,
  pointing: (object: KubeObject, kind: KindInfo) => Pointing<O> | undefined,
): void {
  function Found({ asked, ...props }: ResourceProps & { asked: Pointing<O> }) {
    const say = useSay();
    const { found, answer } = usePointing<O>(asked);
    const isRefused = refused(answer);
    // More of them than looked through: those tested past it not known — said so, never taken for none.
    const total = answer.total?.count ?? answer.items.length;
    const partial = !!asked.test && total > answer.items.length;
    if (!found.length && !isRefused && !partial) return null;
    const shown = found.slice(0, MATCHED);
    // Asked of the cluster (no test): all of them counted, not only those looked through.
    const more = (asked.test ? found.length : total) - shown.length;
    const names = found.map((o) => o.metadata?.name).join(', ');
    const drawn = isRefused ? (
      <RefusedQuietly kind={asked.kind} error={answer.error} />
    ) : (
      <span class="uk-refs">
        {shown.map((o) => (
          <ObjectRef key={o.metadata?.uid ?? o.metadata?.name} kind={asked.kind.id} name={o.metadata?.name ?? ''} namespace={o.metadata?.namespace} quiet={asked.quiet} />
        ))}
        {more > 0 && <span class="uk-quiet">{say(T.resource.view.used.more, { count: more })}</span>}
        {partial && <span class="uk-quiet">{say(T.resource.view.used.scanned, { scanned: answer.items.length, total })}</span>}
      </span>
    );
    return slotElement(slots.resource.view.related.field, { ...props, field: { name, label: say(label) }, value: names, display: names, drawn }, { limit: 1 });
  }
  /** Its field: asked of what points at it, where it says what to ask (else none). */
  function Field(props: ResourceProps) {
    const asked = pointing(props.object, props.kind);
    return asked ? <Found {...props} asked={asked} /> : null;
  }
  c.add('Fill', `core.resource.view.related.${of}.${name}`, fill(slots.resource.view.related, { order, target: forKinds(...forThem), render: Field }));
}
