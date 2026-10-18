import type { KubeObject } from '@overkube/kube-types';
import { action, humanDuration, ipOf, type KubeContributor, type Label, parseCertificate, type ResourceProps, section, shortTime } from '@overkube/sdk';
import { ObjectRef, StatusOf, useGet, useList, useSay } from '@overkube/sdk/preact';
import { Compare, type CompareRow, KeyValue, Lifetime, Notice, Section, Step, type StepState, Steps, textOf } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { Certificate, CertificateRequest, Challenge, F, Order, REF } from './kinds.ts';
import { addRelated, type CertificateObject, DAY, durationOf, durationSaid, IssuerOf, marksOf, refs, SecretOf, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * A Certificate's view: its lifetime (Not Before, Renewal Time, Not
 * After); its current revision as it goes — its CertificateRequest, the
 * ACME Order of it, the Order's Challenges, its Secret — each its state,
 * where it stops what cert-manager says of it (a self check's failure,
 * what it usually means); its spec against what its Secret holds; its
 * failed issuance attempts and when it tries again (cert-manager's backoff:
 * an hour, doubled each time, 32 at most); related: its issuer, its Secret,
 * what uses it. Renew: cert-manager issues it anew (as cmctl renew does: its
 * Issuing condition, its status updated — the right to update it asked).
 */

type Owned = KubeObject & { status?: Record<string, unknown> & { state?: string; reason?: string; presented?: boolean }; spec?: Record<string, unknown> };

const condition = (o: CertificateObject, type: string) => o.status?.conditions?.find((c) => c.type === type);
/** What a step is and how long ago it was made, as kubectl says an age. */
const metaOf = (kind: string, o: KubeObject, more?: string) => {
  const made = Date.parse(o.metadata?.creationTimestamp ?? '');
  return [kind, more, Number.isNaN(made) ? '' : humanDuration(Date.now() - made)].filter(Boolean).join(' · ');
};

/** Its lifetime, once issued. */
function Validity({ object }: ResourceProps) {
  const say = useSay();
  const s = (object as CertificateObject).status;
  const span = spanOf(s?.notBefore, s?.notAfter, s?.renewalTime, Date.now());
  if (!span) return null;
  return (
    <Section title={say(T.certificate.validity)} part="validity">
      <Lifetime {...span} marks={marksOf(say, span)} />
    </Section>
  );
}

/** What a challenge's reason usually means (the self check's most common failures). */
function hintOf(reason: string) {
  if (/no such host/.test(reason)) return T.challenge.hints.noHost;
  if (/wrong status code '404'/.test(reason)) return T.challenge.hints.wrongStatus;
  if (/connection refused/.test(reason)) return T.challenge.hints.refused;
  return undefined;
}

/** What cert-manager says of a step, as it says it: where it is stuck, set apart as what went wrong; else quiet. */
const Said = ({ stuck, children }: { stuck: boolean; children: string }) => (stuck ? <code class="uk-why">{children}</code> : <span class="uk-quiet">{children}</span>);

/** What a challenge's reason usually means, where it is one of the common ones. */
export function Hint({ reason }: { reason: string }) {
  const say = useSay();
  const hint = hintOf(reason);
  return hint ? <Notice icon="help">{say(hint)}</Notice> : null;
}

/** A challenge's reason as cert-manager says it, and what it usually means. */
function Why({ reason, stuck }: { reason: string; stuck: boolean }) {
  return (
    <>
      <Said stuck={stuck}>{reason}</Said>
      <Hint reason={reason} />
    </>
  );
}

const ORDER: Record<string, StepState> = { valid: 'done', invalid: 'stuck', errored: 'stuck', expired: 'stuck' };
/** A pending challenge stuck: told why, a while after it was made. */
const stuck = (o: Owned) => !!o.status?.reason && Date.now() - Date.parse(o.metadata?.creationTimestamp ?? '') > 5 * 60_000;

/** The objects of a kind in a namespace whose controller is this one. */
function useOwnedBy(kind: string, namespace: string, owner: string | undefined): Owned[] {
  const got = useList<Owned>(
    owner ? { kind, scope: { namespaces: [namespace] }, where: { field: '.metadata.ownerReferences[*].name', op: 'eq', value: owner }, page: { limit: 20 } } : undefined,
  );
  return got.items.flatMap((i) => (i.object ? [i.object] : []));
}

/** The Challenges of an Order, a step each. */
function Challenges({ namespace, order }: { namespace: string; order: string }) {
  return (
    <>
      {useOwnedBy(REF.challenges, namespace, order).map((ch) => {
        const state = ch.status?.state ?? 'pending';
        const reason = ch.status?.reason ?? '';
        const step = ORDER[state] ?? (stuck(ch) ? 'stuck' : 'going');
        return (
          <Step
            key={ch.metadata?.uid}
            state={step}
            title={<ObjectRef kind={Challenge.id} name={ch.metadata?.name ?? ''} label={String(ch.spec?.dnsName ?? ch.metadata?.name)} namespace={namespace} quiet />}
            status={<StatusOf kind={Challenge} words={state} />}
            meta={metaOf('Challenge', ch, String(ch.spec?.type ?? ''))}
          >
            {reason && state !== 'valid' ? <Why reason={reason} stuck={step === 'stuck'} /> : undefined}
          </Step>
        );
      })}
    </>
  );
}

/** Its current revision: its request, the Order of it and its Challenges, its Secret — each as it is. */
function Issuance({ object }: ResourceProps) {
  const say = useSay();
  const cert = object as CertificateObject;
  const namespace = cert.metadata?.namespace ?? '';
  const name = cert.metadata?.name;
  const requests = useList<CertificateObject>(
    name
      ? {
          kind: REF.requests,
          scope: { namespaces: [namespace] },
          where: { field: F.requestOf, op: 'eq', value: name },
          sort: [{ field: 'core.created', desc: true }],
          page: { limit: 1 },
        }
      : undefined,
  );
  const request = requests.items[0]?.object;
  const orders = useOwnedBy(REF.orders, namespace, request?.metadata?.name);
  if (!request) return null;
  const revision = request.metadata?.annotations?.['cert-manager.io/certificate-revision'] ?? '';
  const state = requestState(request);
  const ready = condition(cert, 'Ready')?.status === 'True' && condition(cert, 'Issuing')?.status !== 'True';
  // What its Ready condition says of its Secret (cert-manager's reason: Ready, DoesNotExist, Expired…).
  const secretSaid = condition(cert, 'Ready')?.reason;
  const message = condition(request, 'Ready')?.message ?? '';
  return (
    <Section title={say(T.certificate.revision, { revision })} part="issuance">
      <Steps>
        <Step
          state={state === 'Issued' ? 'done' : state === 'Failed' || state === 'Denied' ? 'stuck' : 'going'}
          title={<ObjectRef kind={CertificateRequest.id} name={request.metadata?.name ?? ''} namespace={namespace} quiet />}
          status={<StatusOf kind={CertificateRequest} words={state} />}
          meta={metaOf('CertificateRequest', request)}
        >
          {state !== 'Issued' && message ? <Said stuck={state === 'Failed' || state === 'Denied'}>{message}</Said> : undefined}
        </Step>
        {orders.map((order) => {
          const s = order.status?.state ?? 'pending';
          return [
            <Step
              key={order.metadata?.uid}
              state={ORDER[s] ?? 'going'}
              title={<ObjectRef kind={Order.id} name={order.metadata?.name ?? ''} namespace={namespace} quiet />}
              status={<StatusOf kind={Order} words={s} />}
              meta={metaOf('Order', order)}
            >
              {order.status?.reason ? <Said stuck={ORDER[s] === 'stuck'}>{order.status.reason}</Said> : undefined}
            </Step>,
            <Challenges key={`${order.metadata?.uid}-ch`} namespace={namespace} order={order.metadata?.name ?? ''} />,
          ];
        })}
        <Step
          state={ready ? 'done' : 'later'}
          title={<ObjectRef kind="v1/Secret" name={cert.spec?.secretName ?? ''} namespace={namespace} quiet />}
          status={secretSaid ? <span class="uk-quiet">{secretSaid}</span> : undefined}
          meta="Secret"
        />
      </Steps>
    </Section>
  );
}

/** A CertificateRequest's state, as its field says it (Denied, Issued, Failed, Pending). */
function requestState(r: CertificateObject): string {
  const has = (type: string, status = 'True') => condition(r, type)?.status === status;
  if (has('Denied')) return 'Denied';
  if (has('Ready')) return 'Issued';
  if (condition(r, 'Ready')?.reason === 'Failed') return 'Failed';
  return 'Pending';
}

/** Its key as asked: cert-manager's defaults (RSA 2048; ECDSA 256) said as the certificate says its own. */
function keyAsked(key: { algorithm?: string; size?: number } | undefined): string {
  const algorithm = key?.algorithm ?? 'RSA';
  if (algorithm === 'ECDSA') return `ECDSA P-${key?.size ?? 256}`;
  if (algorithm === 'Ed25519') return 'Ed25519';
  return `RSA ${key?.size ?? 2048}`;
}

const list = (items: readonly string[]) => (items.length ? items.join(', ') : '—');
/** The same names, in any order, as many times each (sorted once each: a long list is no slower to compare than to sort). */
function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}
/** DNS names compared as DNS compares them (case aside); IP addresses one way each (2001:db8::1, 2001:DB8:0::1). */
const dnsOf = (names: readonly string[]) => names.map((n) => n.toLowerCase());
const ipsOf = (names: readonly string[]) => names.map((n) => ipOf(n) ?? n);

/** Its spec against what its Secret holds (its certificate read): DNS names, IP addresses, emails, URIs, common name, key, duration. */
function InTheSecret({ object }: ResourceProps) {
  const say = useSay();
  const cert = object as CertificateObject;
  const name = cert.spec?.secretName;
  const got = useGet<KubeObject & { data?: Record<string, string> }>(name ? { kind: 'secrets.v1', namespace: cert.metadata?.namespace ?? '', name } : undefined);
  const pem = got.object?.data?.['tls.crt'];
  const held = useMemo(() => (pem ? parseCertificate(textOf(pem) ?? '') : undefined), [pem]);
  if (!held || !name) return null;
  const t = T.certificate;
  const spec = cert.spec ?? {};
  const asked = durationOf(spec.duration);
  const lasts = held.notAfter - held.notBefore;
  // Names of a type where either has any (one it holds, not asked for: told).
  const names = (label: Label, wanted: readonly string[], holds: readonly string[], as: (n: readonly string[]) => string[]): CompareRow[] =>
    wanted.length || holds.length ? [{ label: say(label), asked: list(wanted), holds: list(holds), differs: !same(as(wanted), as(holds)) }] : [];
  const rows: CompareRow[] = [
    ...names(t.dnsNames, spec.dnsNames ?? [], held.names.dns, dnsOf),
    ...names(t.ipAddresses, spec.ipAddresses ?? [], held.names.ip, ipsOf),
    ...names(t.emailAddresses, spec.emailAddresses ?? [], held.names.email, (n) => [...n]),
    ...names(t.uris, spec.uris ?? [], held.names.uri, (n) => [...n]),
    ...(spec.commonName ? [{ label: say(t.commonName), asked: spec.commonName, holds: held.commonName ?? '—', differs: spec.commonName !== held.commonName }] : []),
    { label: say(t.privateKey), asked: keyAsked(spec.privateKey), holds: held.key, differs: keyAsked(spec.privateKey) !== held.key },
    // Asked only where said (an ACME server gives its own).
    ...(asked ? [{ label: say(t.duration), asked: durationSaid(asked), holds: durationSaid(Math.round(lasts / 1000) * 1000), differs: Math.abs(asked - lasts) > DAY }] : []),
  ];
  return (
    <Section title={say(t.secret, { name })} part="secret">
      <Compare heads={[say(t.spec), say(t.holds)]} rows={rows} />
    </Section>
  );
}

/** Its failed issuance attempts (how many, in its title), when the last, when it tries again (an hour, doubled each time, 32 at most). */
function Failed({ object }: ResourceProps) {
  const say = useSay();
  const s = (object as CertificateObject).status;
  const attempts = s?.failedIssuanceAttempts ?? 0;
  const last = Date.parse(s?.lastFailureTime ?? '');
  if (!attempts || Number.isNaN(last)) return null;
  const next = last + Math.min(2 ** (attempts - 1), 32) * 3_600_000;
  const now = Date.now();
  // As the core says a time: the page's clock, how long ago (one to come: in how long).
  const at = (ms: number) => `${shortTime(ms)} (${ms <= now ? humanDuration(now - ms) : say(T.times.in, { duration: humanDuration(ms - now) })})`;
  const t = T.certificate;
  return (
    <Section title={say(t.failed, { count: attempts })} part="failed">
      <KeyValue
        rows={[
          [say(t.lastFailure), at(last)],
          [say(t.nextAttempt), at(next)],
        ]}
      />
    </Section>
  );
}

/** What uses its Secret: Ingresses serving it (but the one controlling it), pods mounting it. */
function useUsers({ object }: ResourceProps): [ComponentChildren, string] | undefined {
  const cert = object as CertificateObject;
  const namespace = cert.metadata?.namespace ?? '';
  const secret = cert.spec?.secretName;
  const usedBy = (kind: string, field: string) =>
    secret ? { kind, scope: { namespaces: [namespace] }, where: { field, op: 'eq' as const, value: secret }, page: { limit: 10 }, select: ['core.name'] } : undefined;
  const ingresses = useList(usedBy('ingresses.v1.networking.k8s.io', '.spec.tls[*].secretName'));
  const pods = useList(usedBy('pods.v1', 'pods.v1.secrets'));
  const named = (items: typeof ingresses.items) => items.map((i) => String(i.values?.['core.name'] ?? ''));
  // The Ingress that controls it (ingress-shim's): said already, as what controls it.
  const controller = cert.metadata?.ownerReferences?.find((r) => r.controller && r.kind === 'Ingress')?.name;
  const users = [
    ...named(ingresses.items)
      .filter((n) => n !== controller)
      .map((n) => ['networking.k8s.io/v1/Ingress', n] as const),
    ...named(pods.items).map((n) => ['v1/Pod', n] as const),
  ];
  if (!users.length) return undefined;
  return [refs(users.map(([kind, name]) => <ObjectRef key={`${kind}/${name}`} kind={kind} name={name} namespace={namespace} />)), users.map(([, n]) => n).join(', ')];
}

/** It with its Issuing condition set as cmctl renew sets it: cert-manager issues it anew. */
function renewed(cert: CertificateObject): CertificateObject {
  const conditions = (cert.status?.conditions ?? []).filter((c) => c.type !== 'Issuing');
  const issuing = {
    type: 'Issuing',
    status: 'True',
    reason: 'ManuallyTriggered',
    message: 'Certificate re-issuance manually triggered',
    lastTransitionTime: new Date().toISOString(),
    observedGeneration: cert.metadata?.generation,
  };
  return { ...cert, status: { ...cert.status, conditions: [...conditions, issuing] } };
}

export function addCertificate(c: KubeContributor, update: (kind: typeof Certificate, object: KubeObject) => Promise<unknown>): void {
  const certificates = [Certificate] as const;
  c.add('Fill', 'cert-manager.resource.view.certificate.validity', section({ kinds: certificates, order: 5, render: Validity }));
  c.add('Fill', 'cert-manager.resource.view.certificate.issuance', section({ kinds: certificates, order: 6, render: Issuance }));
  c.add('Fill', 'cert-manager.resource.view.certificate.secret', section({ kinds: certificates, order: 7, render: InTheSecret }));
  c.add('Fill', 'cert-manager.resource.view.certificate.failed', section({ kinds: certificates, order: 8, render: Failed }));
  addRelated(c, 'certificate.issuer', certificates, 50, T.related.issuer, ({ object }) => {
    const cert = object as CertificateObject;
    const ref = cert.spec?.issuerRef;
    return ref ? [<IssuerOf issuerRef={ref} namespace={cert.metadata?.namespace} />, ref.name] : undefined;
  });
  addRelated(c, 'certificate.secret', certificates, 60, T.related.secret, ({ object }) => {
    const cert = object as CertificateObject;
    const name = cert.spec?.secretName;
    return name ? [<SecretOf name={name} namespace={cert.metadata?.namespace ?? ''} />, name] : undefined;
  });
  addRelated(c, 'certificate.used', certificates, 70, T.related.usedBy, useUsers);
  c.add(
    'Action',
    'cert-manager.certificate.renew',
    action({
      kinds: [Certificate],
      title: T.actions.renew,
      icon: 'refresh',
      needs: [{ verb: 'update', subresource: 'status' }],
      // Not while it is being issued (as cmctl renew refuses).
      when: (o) => condition(o as CertificateObject, 'Issuing')?.status !== 'True',
      run: (o) => update(Certificate, renewed(o as CertificateObject)),
    }),
  );
}
