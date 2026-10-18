import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { Where } from '@overkube/query';
import { filterIn, KindView, kindOfRef, kindPath, kindRef, lookOf, type ResourceOwnerProps, type ResourceProps, StatusLook, slots } from '@overkube/sdk';
import { useCount, useFields, useGet, useList, useOwned, usePage, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Dot, type Level, Ref, type Tone } from '@overkube/uikit';
import { slotElement, useDefinition, useDefinitions } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { titleOf } from './kinds.ts';
import { T } from './texts.ts';

/*
 * What a resource is tied to by ownership, both ways: up — what controls it,
 * to the root (the root first, those between quiet: a pod's ReplicaSet
 * after its Deployment); down — what it owns, a line for each kind (how
 * many, a dot for each one's state, a link to them: its kind's page
 * filtered by its owner), and what those own in turn (a Deployment's pods,
 * by its ReplicaSets). Which kinds an object's own are of: the kinds that
 * own as Kubernetes's controllers do (OWNED), and those the page has seen
 * owned by its kind (an operator's: a Certificate's CertificateRequests).
 */

/** The kinds an object of a kind owns, as Kubernetes's own controllers make them (by their refs). */
export const OWNED: Readonly<Record<string, readonly string[]>> = {
  'deployments.v1.apps': ['replicasets.v1.apps'],
  'replicasets.v1.apps': ['pods.v1'],
  'statefulsets.v1.apps': ['pods.v1'],
  'daemonsets.v1.apps': ['pods.v1'],
  'jobs.v1.batch': ['pods.v1'],
  'cronjobs.v1.batch': ['jobs.v1.batch'],
  'services.v1': ['endpointslices.v1.discovery.k8s.io'],
};

/** The field a kind's state is said by (as its table's Status column): its own status, its health (a workload's), else kstatus's. */
const stateOf = (ref: string, fields: Readonly<Record<string, unknown>> | undefined) => [`${ref}.status`, `${ref}.health`].find((f) => fields && f in fields) ?? 'core.health';

/** The kinds an object of a kind owns, served: Kubernetes's own, those seen. */
function useOwnedKinds(kind: KindInfo): KindInfo[] {
  const { kinds } = useServedKinds();
  const ref = kindRef(kind);
  const seen = useOwned(ref);
  return [...new Set([...(OWNED[ref] ?? []), ...seen])].flatMap((r) => kindOfRef(kinds, r) ?? []);
}

/** A state's tone as a dot's level (done as fine; on its way or waiting as to look at; gone, not known: none). */
const LEVEL: Partial<Record<Tone, Level>> = { ok: 'ok', done: 'ok', progress: 'warn', waiting: 'warn', warn: 'warn', error: 'error' };

/** Dots shown at most (the rest counted). */
const DOTS = 10;
/** Those owned looked through for what they own in turn, at most (their uids in a filter: within its length). */
const LOOKED = 100;

/** Owned by this object (its uid among their owners'). */
const ownedBy = (object: KubeObject): Where => ({ field: 'core.owner.uid', op: 'eq', value: object.metadata?.uid ?? '' });

// ── Up: what controls it, to the root ──────────────────────────────────────

/** An owner's kind as served: of its version, else of another of its group (an operator's owners say the version it reconciles). */
function servedAs(kinds: ReadonlyMap<string, KindInfo>, apiVersion: string, kind: string): KindInfo | undefined {
  const exact = kinds.get(`${apiVersion}/${kind}`);
  if (exact) return exact;
  const group = apiVersion.includes('/') ? apiVersion.slice(0, apiVersion.indexOf('/')) : '';
  return [...kinds.values()].find((k) => k.group === group && k.kind === kind);
}

/** One of its owners (each drawn as related.owner says): its controller's controllers above it first, to the root — then it, quiet where there are. */
export function OwnerChain({ kind, object, owner, depth = 0 }: ResourceOwnerProps & { depth?: number }) {
  const { kinds } = useServedKinds();
  const of = servedAs(kinds, owner.apiVersion, owner.kind);
  const link = slotElement(slots.resource.view.related.owner, { kind, object, owner }, { limit: 1 });
  // Not its controller, its kind not served (nothing to read of it), or far enough: it alone.
  if (!of || !owner.controller || depth > 4) return <>{link}</>;
  return <Above of={of} object={object} owner={owner} depth={depth} link={link} />;
}

/** An owner read, its own controller (if it has one) drawn before it. */
function Above({ of, object, owner, depth, link }: { of: KindInfo; object: KubeObject; owner: ResourceOwnerProps['owner']; depth: number; link: ComponentChildren }) {
  const namespace = of.namespaced ? object.metadata?.namespace : undefined;
  const got = useGet<KubeObject>({ kind: kindRef(of), ...(namespace ? { namespace } : {}), name: owner.name }).object;
  const above = got?.metadata?.ownerReferences?.find((o) => o.controller);
  if (!got || !above) return <>{link}</>;
  return (
    <span class="uk-chain">
      <OwnerChain kind={of} object={got} owner={above} depth={depth + 1} />
      {/* The one after it, its › with it (a line broken before it, not between). */}
      <span class="uk-chain-next">
        <span class="uk-chain-sep" aria-hidden="true">
          ›
        </span>
        {link}
      </span>
    </span>
  );
}

// ── Down: what it owns ──────────────────────────────────────────────────────

/** What it owns (the core's related fields): a line for each kind its kind's objects own, and for what those own in turn. */
export function Owned({ kind, object }: ResourceProps) {
  const mine = useOwnedKinds(kind);
  return (
    <>
      {mine.map((child) => (
        <OwnedKind key={child.id} kind={kind} object={object} child={child} mine={mine} />
      ))}
    </>
  );
}

/** Those of a kind it owns: their line; what they own in turn, a line each (theirs: by them) — not of its own kinds (a line of them already). */
function OwnedKind({ kind, object, child, mine }: ResourceProps & { child: KindInfo; mine: readonly KindInfo[] }) {
  const below = useOwnedKinds(child).filter((k) => !mine.some((m) => m.id === k.id));
  return (
    <>
      <OwnedLine kind={kind} object={object} child={child} where={ownedBy(object)} />
      {below.map((grand) => (
        <ByThem key={grand.id} kind={kind} object={object} child={child} grand={grand} />
      ))}
    </>
  );
}

/** What those it owns own in turn (a Deployment's pods, by its ReplicaSets): asked by their uids. */
function ByThem({ kind, object, child, grand }: ResourceProps & { child: KindInfo; grand: KindInfo }) {
  const scope = scopeOf(child, object);
  const theirs = useList({ kind: kindRef(child), ...(scope ? { scope } : {}), where: ownedBy(object), page: { limit: LOOKED }, select: ['core.uid'] });
  const uids = theirs.items.flatMap((i) => (typeof i.values?.['core.uid'] === 'string' ? [i.values['core.uid'] as string] : []));
  if (!uids.length) return null;
  // More of them than looked through: of those only, said so.
  const all = theirs.total?.count ?? uids.length;
  return <OwnedLine kind={kind} object={object} child={grand} where={{ field: 'core.owner.uid', op: 'in', values: uids }} by={child} {...(all > uids.length ? { of: all } : {})} />;
}

/** A kind's objects in an object's namespace (its own: of none, every one). */
const scopeOf = (child: KindInfo, object: KubeObject) => (child.namespaced && object.metadata?.namespace ? { namespaces: [object.metadata.namespace] } : undefined);

/** A line of those of a kind: how many (a link to them), a dot for each one's state; whose they are (by: those of another kind it owns). */
function OwnedLine({ kind, object, child, where, by, of }: ResourceProps & { child: KindInfo; where: Where; by?: KindInfo; of?: number }) {
  const page = usePage();
  const say = useSay();
  const looks = useDefinitions(StatusLook);
  const icon = useDefinition(KindView, child.id)?.spec.icon ?? 'cube';
  const ref = kindRef(child);
  const scope = scopeOf(child, object);
  const fields = useFields(ref).catalog?.fields;
  const answer = useCount({ kind: ref, ...(scope ? { scope } : {}), where, groupBy: stateOf(ref, fields), top: DOTS });
  const count = answer.total?.count ?? 0;
  if (!count) return null;
  // Its objects' states, the worst first: a dot each, so many — each its words (under the pointer, and for those who cannot see it).
  const states = (answer.groups ?? []).flatMap((g) => {
    const words = g.value === null || g.value === undefined || g.value === '' ? undefined : String(g.value);
    const tone = words === undefined ? undefined : lookOf(looks, child, words)?.tone;
    return Array.from({ length: g.count }, () => ({ level: tone ? LEVEL[tone] : undefined, words: words ?? '—' }));
  });
  const rank = (l: Level | undefined) => (l === 'error' ? 0 : l === 'warn' ? 1 : l === undefined ? 2 : 3);
  states.sort((a, b) => rank(a.level) - rank(b.level));
  const filter =
    where.op === 'in' && 'values' in where ? `owner_uid.exists(it, it in ${JSON.stringify(where.values)})` : `${JSON.stringify(object.metadata?.uid ?? '')} in owner_uid`;
  const href = page.href(filterIn(kindPath(child), filter));
  const label = titleOf(child);
  const drawn = (
    <span class="uk-owned">
      {/* Its kind the row's label: not said again. */}
      <Ref icon={icon} href={href}>
        {String(count)}
      </Ref>
      <span class="uk-dots">
        {states.slice(0, DOTS).map((d, i) => (
          <Dot key={i} level={d.level} title={d.words} />
        ))}
        {count > DOTS && <span class="uk-quiet">+{count - DOTS}</span>}
      </span>
      {by && <span class="uk-quiet">{say(of ? T.resource.view.related.byFirst : T.resource.view.related.by, { kind: titleOf(by), count: LOOKED, of: of ?? 0 })}</span>}
    </span>
  );
  return slotElement(
    slots.resource.view.related.field,
    { kind, object, field: { name: `owns.${ref}${by ? `.by.${kindRef(by)}` : ''}`, label }, value: count, display: String(count), drawn },
    { limit: 1 },
  );
}
