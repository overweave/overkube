import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { action, type KubeContributor, parseRequest, type ResourceProps, section } from '@overkube/sdk';
import { useSay } from '@overkube/sdk/preact';
import { KeyValue, Notice, Section, textOf } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { CertificateRequest, ClusterIssuer, Issuer } from './kinds.ts';
import { addRelated, type CertificateObject, durationOf, durationSaid, IssuerOf, type IssuerRef } from './shared.tsx';
import { T } from './texts.ts';

/*
 * A CertificateRequest's view: what it asks (its CSR read: subject, its
 * names, key; its duration, usages — who requested it: its summary's
 * Requester); not approved yet,
 * who approves it; related: its issuer (another's: its group said).
 * Approve, Deny: its Approved or Denied condition, on its status, as cmctl
 * approve and deny set them — the rights to update its status and to
 * approve for its issuer (cert-manager's webhook checks the latter) asked.
 */

type Row = [string, ComponentChildren];

type RequestObject = CertificateObject & {
  spec?: { request?: string; duration?: string; usages?: string[]; username?: string; issuerRef?: IssuerRef };
};

const has = (o: RequestObject, type: string) => o.status?.conditions?.some((c) => c.type === type && c.status === 'True') ?? false;
/** Neither approved nor denied yet. */
const undecided = (o: RequestObject) => !has(o, 'Approved') && !has(o, 'Denied');

/** What it asks, its CSR read. */
function Request({ object }: ResourceProps) {
  const say = useSay();
  const o = object as RequestObject;
  const pem = o.spec?.request;
  const csr = useMemo(() => (pem ? parseRequest(textOf(pem) ?? '') : undefined), [pem]);
  const duration = durationOf(o.spec?.duration);
  const t = T.request;
  return (
    <Section title={say(t.request)} part="request">
      <KeyValue
        rows={[
          ...(csr
            ? [
                [say(t.subject), <span class="uk-mono">{csr.subject || '—'}</span>] as Row,
                // Its names by their type, as a Certificate's spec says them: those it asks any of.
                ...(
                  [
                    [T.certificate.dnsNames, csr.names.dns],
                    [T.certificate.ipAddresses, csr.names.ip],
                    [T.certificate.emailAddresses, csr.names.email],
                    [T.certificate.uris, csr.names.uri],
                  ] as const
                ).flatMap(([label, names]): Row[] => (names.length ? [[say(label), names.join(', ')]] : [])),
                [say(T.certificate.privateKey), csr.key] as Row,
              ]
            : []),
          [say(T.certificate.duration), duration ? durationSaid(duration) : (o.spec?.duration ?? '—')],
          [say(t.usages), o.spec?.usages?.join(', ') ?? '—'],
        ]}
      />
    </Section>
  );
}

/**
 * The names cert-manager's webhook asks approve of, for a request's issuer
 * (any one allowed: enough): every issuer of its kind
 * (issuers.cert-manager.io/*), or this one — a namespaced issuer's by its
 * namespace and name (issuers.cert-manager.io/shop.ca), a cluster one's by
 * its name. Its kind's plural and scope as discovery says them (the
 * webhook's own way); another's not served (nor known yet): its kind,
 * lower case, and an s, and either scope.
 */
export function signersOf(o: RequestObject, served: ReadonlyMap<string, KindInfo> | null = null): string[] {
  const ref = o.spec?.issuerRef;
  if (!ref?.name) return [];
  const group = ref.group || 'cert-manager.io';
  const kind = ref.kind || 'Issuer';
  const known = group === 'cert-manager.io' ? (kind === 'ClusterIssuer' ? ClusterIssuer : Issuer) : [...(served?.values() ?? [])].find((k) => k.group === group && k.kind === kind);
  const signer = `${known?.plural ?? `${kind.toLowerCase()}s`}.${group}`;
  const namespaced = `${signer}/${o.metadata?.namespace ?? ''}.${ref.name}`;
  const cluster = `${signer}/${ref.name}`;
  return [`${signer}/*`, ...(known ? [known.namespaced ? namespaced : cluster] : [namespaced, cluster])];
}

/** Not approved yet: who approves it. */
function Approval({ object }: ResourceProps) {
  const say = useSay();
  const o = object as RequestObject;
  if (!undecided(o)) return null;
  return (
    <Notice icon="hourglass" title={say(T.request.notApproved)}>
      {say(T.request.approvedBy, { kind: o.spec?.issuerRef?.kind ?? 'Issuer', group: o.spec?.issuerRef?.group || 'cert-manager.io' })}
    </Notice>
  );
}

/** It with a condition set (Approved, Denied) as cmctl sets it. */
const decided = (o: KubeObject, type: 'Approved' | 'Denied'): KubeObject => {
  const r = o as RequestObject;
  const condition = { type, status: 'True', reason: 'Overkube', message: `manually ${type.toLowerCase()} in overkube`, lastTransitionTime: new Date().toISOString() };
  return { ...r, status: { ...r.status, conditions: [...(r.status?.conditions ?? []), condition] } };
};

export function addRequest(
  c: KubeContributor,
  update: (kind: typeof CertificateRequest, object: KubeObject) => Promise<unknown>,
  served: () => ReadonlyMap<string, KindInfo> | null,
): void {
  const requests = [CertificateRequest] as const;
  c.add('Fill', 'cert-manager.resource.view.request.approval', section({ kinds: requests, order: 4, render: Approval }));
  c.add('Fill', 'cert-manager.resource.view.request.request', section({ kinds: requests, order: 5, render: Request }));
  addRelated(c, 'request.issuer', requests, 50, T.related.issuer, ({ object }) => {
    const o = object as RequestObject;
    const ref = o.spec?.issuerRef;
    return ref ? [<IssuerOf issuerRef={ref} namespace={o.metadata?.namespace} />, ref.name] : undefined;
  });
  // To approve or deny: its status updated, and approve on its issuer's signer (cert-manager's webhook checks it, by the signer's name).
  const needs = [
    { verb: 'update', subresource: 'status' },
    // Signers are of no namespace: the webhook asks with none, a namespace's RoleBindings never grant it.
    { verb: 'approve', group: 'cert-manager.io', resource: 'signers', cluster: true, name: (o: KubeObject) => signersOf(o as RequestObject, served()) },
  ];
  for (const [type, title, icon, dangerous] of [
    ['Approved', T.actions.approve, 'check', false],
    ['Denied', T.actions.deny, 'ban', true],
  ] as const)
    c.add(
      'Action',
      `cert-manager.request.${title.key.split('.').at(-1)}`,
      action({
        kinds: [CertificateRequest],
        title,
        icon,
        dangerous,
        needs,
        when: (o) => undecided(o as RequestObject),
        run: (o) => update(CertificateRequest, decided(o, type)),
      }),
    );
}
