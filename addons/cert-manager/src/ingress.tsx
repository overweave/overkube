import { kinds } from '@overkube/kube-types';
import { type KubeContributor, type ResourceProps, wrap } from '@overkube/sdk';
import { ObjectRef, StatusOf, useList, useSay } from '@overkube/sdk/preact';
import { LifetimeCell, Notice, Row, Rows, Section, Status } from '@overkube/uikit';
import { Certificate, ClusterIssuer, F, Issuer, REF } from './kinds.ts';
import { addRelated, leftSaid, levelOf, refs, spanOf } from './shared.tsx';
import { T } from './texts.ts';

/*
 * Where certificates are used. An Ingress's TLS, in the place of the
 * core's section: each TLS entry's hosts, its Secret and the Certificate
 * that writes it (its state, its lifetime); a host of its rules no entry
 * covers (a wildcard covering its one label); the issuer its
 * cert-manager.io annotation names, not there (its
 * Certificate is made, never issued). A Secret's: the Certificate it is
 * managed by.
 */

const { Ingress } = kinds.networking.v1;
const { Secret } = kinds.core.v1;

type IngressObject = {
  metadata?: { name?: string; namespace?: string; annotations?: Record<string, string> };
  spec?: { tls?: { hosts?: string[]; secretName?: string }[]; rules?: { host?: string }[] };
};

const ANNOTATIONS: [annotation: string, kind: typeof Issuer][] = [
  ['cert-manager.io/cluster-issuer', ClusterIssuer],
  ['cert-manager.io/issuer', Issuer],
];

/** Whether a TLS host covers a rule's host: the same (case aside), or a wildcard's one label (*.shop.test: www.shop.test, not a.b.shop.test). */
export function covers(tlsHost: string, host: string): boolean {
  const [a, b] = [tlsHost.toLowerCase(), host.toLowerCase()];
  if (a === b) return true;
  if (!a.startsWith('*.')) return false;
  const dot = b.indexOf('.');
  return dot > 0 && b.slice(dot + 1) === a.slice(2) && !b.startsWith('*');
}

function IngressTls({ object }: ResourceProps) {
  const say = useSay();
  const o = object as IngressObject;
  const namespace = o.metadata?.namespace ?? '';
  const tls = o.spec?.tls ?? [];
  const secrets = tls.flatMap((t) => (t.secretName ? [t.secretName] : []));
  const certificates = useList(
    secrets.length
      ? {
          kind: REF.certificates,
          scope: { namespaces: [namespace] },
          where: { field: F.secret, op: 'in', values: secrets },
          page: { limit: 50 },
          select: [F.secret, 'core.name', F.state, F.notBefore, F.notAfter, F.renewal],
        }
      : undefined,
  );
  const annotated = ANNOTATIONS.flatMap(([annotation, kind]) => {
    const name = o.metadata?.annotations?.[annotation];
    return name ? [{ annotation, kind, name }] : [];
  });
  const issuer = annotated[0];
  // The issuer it names, looked for (none named: none asked of).
  const issuers = useList(
    issuer
      ? {
          kind: issuer.kind === Issuer ? REF.issuers : REF.clusterIssuers,
          ...(issuer.kind === Issuer ? { scope: { namespaces: [namespace] } } : {}),
          where: { field: 'core.name', op: 'eq', value: issuer.name },
          page: { limit: 1 },
          select: ['core.name'],
        }
      : undefined,
  );
  const missing = issuer && (issuers.state === 'live' || issuers.state === 'stale') && issuers.items.length === 0;
  const of = new Map(certificates.items.map((i) => [String(i.values?.[F.secret]), i.values ?? {}]));
  const tlsHosts = tls.flatMap((t) => t.hosts ?? []);
  const uncovered = [...new Set((o.spec?.rules ?? []).flatMap((r) => (r.host && !tlsHosts.some((h) => covers(h, r.host as string)) ? [r.host] : [])))];
  const now = Date.now();
  const time = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString() : undefined);
  return (
    <Section title={say(T.ingress.tls)} part="tls">
      <div class="uk-stack">
        <Rows>
          {tls.map((t, i) => {
            const cert = t.secretName ? of.get(t.secretName) : undefined;
            const span = cert && spanOf(time(cert[F.notBefore]), time(cert[F.notAfter]), time(cert[F.renewal]), now);
            return (
              <Row
                key={i}
                {...(cert ? { mark: <StatusOf kind={Certificate} words={String(cert[F.state] ?? '')} mark /> } : {})}
                lead={<span class="uk-mono">{t.hosts?.join(', ') || say(T.ingress.anyHost)}</span>}
                end={span ? <LifetimeCell {...span} level={levelOf(span)} said={leftSaid(say, span)} /> : undefined}
                under={refs([
                  t.secretName && <ObjectRef kind={Secret.id} name={t.secretName} namespace={namespace} />,
                  cert ? (
                    <ObjectRef kind={Certificate.id} name={String(cert['core.name'])} namespace={namespace} />
                  ) : (
                    t.secretName && <span class="uk-quiet">{say(T.ingress.noSecret, { name: t.secretName })}</span>
                  ),
                ])}
              />
            );
          })}
          {uncovered.map((host) => (
            <Row key={host} mark={<Status tone="error" icon="link-off" />} lead={<span class="uk-mono">{host}</span>} end={say(T.ingress.notCovered)} />
          ))}
        </Rows>
        {missing && (
          <Notice level="warn" icon="warning" title={say(T.ingress.noIssuer, { annotation: issuer.annotation, kind: issuer.kind.kind, name: issuer.name })}>
            {say(T.ingress.noIssuerText)}
          </Notice>
        )}
      </div>
    </Section>
  );
}

export function addUses(c: KubeContributor): void {
  // In the core's TLS section's place (drawn instead: its children not).
  c.add('Wrap', 'cert-manager.resource.view.ingress.tls', wrap<ResourceProps>('core.resource.view.ingress.tls', { kinds: [Ingress], order: 0, render: IngressTls }));
  addRelated(c, 'secret.managed', [Secret], 40, T.related.managedBy, ({ object }) => {
    const name = object.metadata?.annotations?.['cert-manager.io/certificate-name'];
    return name ? [<ObjectRef kind={Certificate.id} name={name} namespace={object.metadata?.namespace} />, name] : undefined;
  });
}
