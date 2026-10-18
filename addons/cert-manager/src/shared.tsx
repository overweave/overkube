import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { calendarDays, forKinds, humanDuration, type KubeContributor, kindRef, type Label, type ResourceProps, type Say, shortTime, slots } from '@overkube/sdk';
import { fill, ObjectRef, useGet, useList, useSay } from '@overkube/sdk/preact';
import type { LifetimeMark, LifetimeSpan } from '@overkube/uikit';
import { slotElement } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { ClusterIssuer, Issuer } from './kinds.ts';
import { T } from './texts.ts';

/*
 * What the addon's parts share: a Certificate's lifetime and how it is
 * (its end near, its renewal past), days as said, the issuer an issuerRef
 * names, a related field of the addon's (the core's related section's row:
 * its label, what it draws).
 */

export const DAY = 86_400_000;

/** A Certificate's as cert-manager keeps it (what the addon reads of it). */
export type CertificateObject = KubeObject & {
  spec?: {
    secretName?: string;
    dnsNames?: string[];
    ipAddresses?: string[];
    emailAddresses?: string[];
    uris?: string[];
    commonName?: string;
    duration?: string;
    privateKey?: { algorithm?: string; size?: number };
    issuerRef?: IssuerRef;
  };
  status?: {
    notBefore?: string;
    notAfter?: string;
    renewalTime?: string;
    revision?: number;
    failedIssuanceAttempts?: number;
    lastFailureTime?: string;
    conditions?: { type: string; status: string; reason?: string; message?: string; lastTransitionTime?: string }[];
  };
};

export type IssuerRef = { name: string; kind?: string; group?: string };

/** Days as said: today, in so many, so many ago. */
const whenSaid = (say: Say, days: number) => (days === 0 ? say(T.days.today) : days > 0 ? say(T.days.in, { days }) : say(T.days.ago, { days: -days }));

/** A lifetime of times (RFC 3339; a renewal none: nothing renews it) — none: not issued, or a time of it not one. */
export function spanOf(from: string | undefined, till: string | undefined, renewal: string | undefined, now: number): LifetimeSpan | undefined {
  const [start, end, renews] = [from, till, renewal].map((t) => (t ? Date.parse(t) : Number.NaN)) as [number, number, number];
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return { from: start, till: end, now, ...(Number.isNaN(renews) ? {} : { renewal: renews }) };
}

/** Ended: its Not After past (even by an hour). */
const ended = (span: LifetimeSpan) => span.till <= span.now;

/** How a lifetime is: ended or a week left, an error; past its renewal (renewing failed), or a month left of one nothing renews, a warning. */
export function levelOf(span: LifetimeSpan): 'warn' | 'error' | undefined {
  const left = calendarDays(span.till, span.now);
  if (ended(span) || left < 7) return 'error';
  if (span.renewal === undefined) return left < 30 ? 'warn' : undefined;
  return span.now > span.renewal ? 'warn' : undefined;
}

/** What a cell says of a lifetime: its days left, or since it expired. */
export const leftSaid = (say: Say, span: LifetimeSpan) => {
  if (!ended(span)) return say(T.days.left, { days: calendarDays(span.till, span.now) });
  const ago = -calendarDays(span.till, span.now);
  return ago > 0 ? say(T.days.expired, { days: ago }) : say(T.days.expiredToday);
};

/** A Go duration (2160h0m0s, 90m) in ms; none, or not one: undefined. */
export function durationOf(text: string | undefined): number | undefined {
  if (!text || !/^(\d+(\.\d+)?(h|m|s|ms))+$/.test(text)) return undefined;
  let ms = 0;
  for (const [, n, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) ms += Number(n) * { h: 3_600_000, m: 60_000, s: 1000, ms: 1 }[unit as 'h' | 'm' | 's' | 'ms'];
  return ms || undefined;
}

/** A duration as said beside a certificate's: whole days (90d) where it is, else as kubectl says one (36h). */
export const durationSaid = (ms: number) => (ms % DAY === 0 ? `${ms / DAY}d` : humanDuration(ms));

/** A lifetime's times as said under its bar. */
export function marksOf(say: Say, span: LifetimeSpan): LifetimeMark[] {
  const date = (ms: number) => shortTime(ms).slice(0, 10);
  const level = levelOf(span);
  return [
    { label: say(T.times.notBefore), date: date(span.from), when: whenSaid(say, calendarDays(span.from, span.now)) },
    ...(span.renewal === undefined
      ? []
      : [
          {
            label: say(T.times.renewalTime),
            date: date(span.renewal),
            when: whenSaid(say, calendarDays(span.renewal, span.now)),
            ...(span.now > span.renewal && span.now < span.till ? { level: 'warn' as const } : {}),
          },
        ]),
    {
      label: say(T.times.notAfter),
      date: date(span.till),
      when: whenSaid(say, calendarDays(span.till, span.now)),
      ...(level === 'error' || span.renewal === undefined ? { level } : {}),
    },
  ];
}

/** The issuer kind an issuerRef names (cert-manager's: its group none or cert-manager.io); another's: none. */
function issuerKindOf(ref: IssuerRef | undefined): KindInfo | undefined {
  if (!ref || (ref.group && ref.group !== 'cert-manager.io')) return undefined;
  return ref.kind === 'ClusterIssuer' ? ClusterIssuer : Issuer;
}

/**
 * An issuerRef drawn: a link to cert-manager's issuer (its kind said where
 * it is a ClusterIssuer: an Issuer goes without saying), not there: its
 * kind and name, said not found; another's, its kind, name and group.
 */
export function IssuerOf({ issuerRef: ref, namespace }: { issuerRef: IssuerRef; namespace?: string | undefined }) {
  const say = useSay();
  const kind = issuerKindOf(ref);
  const scoped = kind?.namespaced ? namespace : undefined;
  const got = useGet(kind ? { kind: kindRef(kind), name: ref.name, ...(scoped ? { namespace: scoped } : {}) } : undefined);
  if (!kind) return <span class="uk-mono">{`${ref.kind ?? 'Issuer'} ${ref.name} (${ref.group})`}</span>;
  if (got.state === 'live' && !got.object)
    return (
      <span class="uk-line">
        <span class="uk-mono">{`${kind.kind} ${ref.name}`}</span>
        <span class="uk-quiet">{say(T.issuer.notFound)}</span>
      </span>
    );
  return <ObjectRef kind={kind.id} name={ref.name} namespace={scoped} quiet={kind === Issuer} />;
}

/**
 * A Secret it names, as a link — there not: its name, said not found
 * (asked by its name alone: its data never read here; not allowed to know:
 * the link, as is).
 */
export function SecretOf({ name, namespace }: { name: string; namespace: string }) {
  const say = useSay();
  const got = useList({ kind: 'secrets.v1', scope: { namespaces: [namespace] }, where: { field: 'core.name', op: 'eq', value: name }, page: { limit: 1 }, select: ['core.name'] });
  if (got.state === 'live' && !got.items.length)
    return (
      <span class="uk-line">
        <span class="uk-mono">{name}</span>
        <span class="uk-quiet">{say(T.issuer.notFound)}</span>
      </span>
    );
  return <ObjectRef kind="v1/Secret" name={name} namespace={namespace} quiet />;
}

/**
 * A related field of the addon's, of some kinds (a row of the core's
 * related section): what it draws of the object, and as text — read by a
 * hook (it may ask the cluster); none: no row.
 */
export function addRelated(
  c: KubeContributor,
  name: string,
  kinds: readonly KindInfo[],
  order: number,
  label: Label,
  use: (props: ResourceProps) => [drawn: ComponentChildren, display: string] | undefined,
): void {
  function Related(props: ResourceProps) {
    const say = useSay();
    const got = use(props);
    if (!got) return null;
    const [drawn, display] = got;
    return slotElement(slots.resource.view.related.field, { ...props, field: { name, label: say(label) }, value: display, display, drawn }, { limit: 1 });
  }
  c.add('Fill', `cert-manager.resource.view.related.${name}`, fill(slots.resource.view.related, { order, target: forKinds(...kinds), render: Related }));
}

/** Refs, one after another (the core's look). */
export const refs = (items: ComponentChildren[]) => <span class="uk-refs">{items}</span>;
