import type { KubeObject } from '@overkube/kube-types';
import { type KubeContributor, parseCertificate, type ResourceProps, section } from '@overkube/sdk';
import { ObjectRef, StatusOf, useGet, useList, useSay } from '@overkube/sdk/preact';
import { KeyValue, Lifetime, LifetimeCell, Notice, Row, Rows, Section, textOf } from '@overkube/uikit';
import { useMemo } from 'preact/hooks';
import { Certificate, ClusterIssuer, F, Issuer, REF } from './kinds.ts';
import { addRelated, leftSaid, levelOf, marksOf, SecretOf, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * An Issuer's view, a ClusterIssuer's: a CA's own certificate (its
 * lifetime: what it issued is trusted till then — a Secret no Certificate
 * manages, nothing renews: said); an ACME server's (its server, email,
 * account) and its solvers; the Certificates it issues, the soonest end
 * first; related: the Secrets it reads (its CA, its ACME account's key,
 * Vault's token). A ClusterIssuer reads its Secrets in cert-manager's
 * cluster resource namespace — as its controller's Deployment says it
 * (--cluster-resource-namespace; $(POD_NAMESPACE): its own; not said:
 * cert-manager's default, kube-system); that not read: not known, none
 * guessed.
 */

type IssuerObject = KubeObject & {
  spec?: {
    ca?: { secretName?: string };
    acme?: {
      server?: string;
      email?: string;
      privateKeySecretRef?: { name?: string };
      solvers?: {
        http01?: { ingress?: { ingressClassName?: string; class?: string }; gatewayHTTPRoute?: unknown };
        dns01?: Record<string, unknown>;
        selector?: { dnsNames?: string[]; dnsZones?: string[] };
      }[];
    };
    vault?: { auth?: { tokenSecretRef?: { name?: string } } };
  };
  status?: { acme?: { uri?: string } };
};

type DeploymentObject = KubeObject & { spec?: { template?: { spec?: { containers?: { args?: string[] }[] } } } };

const FLAG = '--cluster-resource-namespace';

/** cert-manager's cluster resource namespace, as its controller's Deployment says it (--flag=value, or --flag value); not asked, or not read (none, or not allowed): undefined. */
function useClusterResourceNamespace(asked: boolean): string | undefined {
  const got = useList<DeploymentObject>(
    asked
      ? {
          kind: 'deployments.v1.apps',
          where: {
            op: 'and',
            args: [
              { field: '.metadata.labels.app\\.kubernetes\\.io/name', op: 'eq', value: 'cert-manager' },
              { field: '.metadata.labels.app\\.kubernetes\\.io/component', op: 'eq', value: 'controller' },
            ],
          },
          page: { limit: 1 },
        }
      : undefined,
  );
  const deployment = got.items[0]?.object;
  if (!deployment) return undefined;
  const args = deployment.spec?.template?.spec?.containers?.flatMap((c) => c.args ?? []) ?? [];
  const at = args.findIndex((a) => a === FLAG || a.startsWith(`${FLAG}=`));
  if (at < 0) return 'kube-system';
  const said = args[at] === FLAG ? args[at + 1] : args[at]?.slice(FLAG.length + 1);
  return said?.replace('$(POD_NAMESPACE)', deployment.metadata?.namespace ?? '') || undefined;
}

/** Where its Secrets are: its own namespace; a ClusterIssuer's, cert-manager's cluster resource namespace (not known: undefined). */
function useSecretsIn(kindId: string, o: KubeObject): string | undefined {
  const cluster = useClusterResourceNamespace(kindId === ClusterIssuer.id);
  return kindId === ClusterIssuer.id ? cluster : o.metadata?.namespace;
}

/** A CA issuer's own certificate: its lifetime; no Certificate managing its Secret, nothing renews it. */
function Ca({ kind, object }: ResourceProps) {
  const say = useSay();
  const o = object as IssuerObject;
  const name = o.spec?.ca?.secretName;
  const namespace = useSecretsIn(kind.id, o);
  const got = useGet<KubeObject & { data?: Record<string, string> }>(name && namespace ? { kind: 'secrets.v1', namespace, name } : undefined);
  const pem = got.object?.data?.['tls.crt'];
  const ca = useMemo(() => (pem ? parseCertificate(textOf(pem) ?? '') : undefined), [pem]);
  if (!ca || !name) return null;
  const managed = !!got.object?.metadata?.annotations?.['cert-manager.io/certificate-name'];
  const span = { from: ca.notBefore, till: ca.notAfter, now: Date.now() };
  return (
    <Section title={say(T.issuer.ca)} part="ca">
      <div class="uk-stack">
        <Lifetime {...span} level={managed ? undefined : levelOf(span)} marks={marksOf(say, span)} />
        {!managed && (
          <Notice level={levelOf(span) ? 'warn' : undefined} icon="cert" title={say(T.issuer.unmanaged, { name })}>
            {say(T.issuer.unmanagedText)}
          </Notice>
        )}
        <KeyValue
          rows={[
            [say(T.request.subject), <span class="uk-mono">{ca.subject || '—'}</span>],
            [say(T.certificate.privateKey), ca.key],
          ]}
        />
      </div>
    </Section>
  );
}

/** An ACME issuer's server, account, and its solvers (each what it solves with, for which names). */
function Acme({ object }: ResourceProps) {
  const say = useSay();
  const acme = (object as IssuerObject).spec?.acme;
  if (!acme) return null;
  const t = T.issuer;
  return (
    <>
      <Section title="ACME" part="acme">
        <KeyValue
          rows={[
            [say(t.server), <span class="uk-mono">{acme.server ?? '—'}</span>],
            [say(t.email), acme.email ?? '—'],
            [say(t.account), <span class="uk-mono">{(object as IssuerObject).status?.acme?.uri ?? '—'}</span>],
          ]}
        />
      </Section>
      <Section title={say(t.solvers)} part="solvers">
        <Rows>
          {(acme.solvers ?? []).map((s, i) => (
            <Row
              key={i}
              lead={
                s.http01?.gatewayHTTPRoute
                  ? say(t.http01Gateway)
                  : s.http01
                    ? say(t.http01, { class: s.http01.ingress?.ingressClassName ?? s.http01.ingress?.class ?? '—' })
                    : say(t.dns01, { provider: Object.keys(s.dns01 ?? {}).find((k) => k !== 'cnameStrategy') ?? '—' })
              }
              under={[...(s.selector?.dnsNames ?? []), ...(s.selector?.dnsZones ?? []).map((z) => `*.${z}`)].join(', ') || say(t.anyName)}
            />
          ))}
        </Rows>
      </Section>
    </>
  );
}

const SHOWN = 10;

/** The Certificates it issues (a ClusterIssuer's: of every namespace), the soonest end first. */
function Issued({ kind, object }: ResourceProps) {
  const say = useSay();
  const cluster = kind.id === ClusterIssuer.id;
  const namespace = object.metadata?.namespace;
  const name = object.metadata?.name;
  // Its own: by its name and kind, of cert-manager's group (another's issuer of the same kind and name is not it).
  const certificates = useList(
    name
      ? {
          kind: REF.certificates,
          ...(!cluster && namespace ? { scope: { namespaces: [namespace] } } : {}),
          where: {
            op: 'and',
            args: [
              { field: F.issuer, op: 'eq', value: name },
              { field: F.issuerKind, op: 'eq', value: cluster ? 'ClusterIssuer' : 'Issuer' },
              { field: F.issuerGroup, op: 'eq', value: 'cert-manager.io' },
            ],
          },
          sort: [{ field: F.notAfter }],
          page: { limit: SHOWN },
          select: ['core.name', 'core.namespace', F.state, F.notBefore, F.notAfter, F.renewal],
        }
      : undefined,
  );
  if (!certificates.items.length) return null;
  const now = Date.now();
  const time = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString() : undefined);
  const more = (certificates.total?.count ?? 0) - certificates.items.length;
  return (
    <Section title={say(T.issuer.certificates)} part="certificates">
      <Rows>
        {certificates.items.map((i) => {
          const v = i.values ?? {};
          const span = spanOf(time(v[F.notBefore]), time(v[F.notAfter]), time(v[F.renewal]), now);
          return (
            <Row
              key={i.key}
              mark={<StatusOf kind={Certificate} words={String(v[F.state] ?? '')} mark />}
              lead={
                <span class="uk-board-object">
                  <ObjectRef kind={Certificate.id} name={String(v['core.name'])} namespace={String(v['core.namespace'])} quiet />
                  <span class="uk-quiet">{String(v['core.namespace'])}</span>
                </span>
              }
              end={span ? <LifetimeCell {...span} level={levelOf(span)} said={leftSaid(say, span)} /> : <StatusOf kind={Certificate} words={String(v[F.state] ?? '')} />}
            />
          );
        })}
      </Rows>
      {more > 0 && <p class="uk-quiet">{say(T.issuer.more, { count: more })}</p>}
    </Section>
  );
}

export function addIssuers(c: KubeContributor): void {
  const issuers = [Issuer, ClusterIssuer] as const;
  c.add('Fill', 'cert-manager.resource.view.issuer.ca', section({ kinds: issuers, order: 5, when: ({ object }) => !!(object as IssuerObject).spec?.ca, render: Ca }));
  c.add('Fill', 'cert-manager.resource.view.issuer.acme', section({ kinds: issuers, order: 6, render: Acme }));
  c.add('Fill', 'cert-manager.resource.view.issuer.certificates', section({ kinds: issuers, order: 7, render: Issued }));
  const secret = (name: string, label: Parameters<typeof addRelated>[4], order: number, of: (o: IssuerObject) => string | undefined) =>
    addRelated(c, `issuer.${name}`, issuers, order, label, ({ kind, object }) => {
      const n = of(object as IssuerObject);
      const namespace = useSecretsIn(kind.id, object);
      if (!n) return undefined;
      // Its namespace not known (cert-manager's Deployment not read): its name alone.
      return [namespace ? <SecretOf name={n} namespace={namespace} /> : <span class="uk-mono">{n}</span>, n];
    });
  secret('ca', T.related.caSecret, 50, (o) => o.spec?.ca?.secretName);
  secret('account', T.related.privateKeySecret, 51, (o) => o.spec?.acme?.privateKeySecretRef?.name);
  secret('token', T.related.tokenSecret, 52, (o) => o.spec?.vault?.auth?.tokenSecretRef?.name);
}
