import type { KubeObject } from '@overkube/kube-types';
import { type KubeContributor, type ResourceProps, section } from '@overkube/sdk';
import { useSay } from '@overkube/sdk/preact';
import { KeyValue, Section } from '@overkube/uikit';
import { Hint } from './certificate.tsx';
import { Challenge, Order } from './kinds.ts';
import { addRelated, IssuerOf, type IssuerRef } from './shared.tsx';
import { T } from './texts.ts';

/*
 * ACME's own: an Order's issuer; a Challenge's — what its reason usually
 * means (the reason itself: its summary's, as its CRD's column), its type,
 * whether it is presented and processing, its solver — related: its issuer
 * (what cert-manager made to solve it, owned by it: the core's).
 */

type AcmeObject = KubeObject & {
  spec?: {
    issuerRef?: IssuerRef;
    dnsName?: string;
    token?: string;
    type?: string;
    solver?: { http01?: { ingress?: { ingressClassName?: string; class?: string } }; dns01?: Record<string, unknown> };
  };
  status?: { state?: string; reason?: string; presented?: boolean; processing?: boolean };
};

/** What solves it, said: HTTP-01 by an Ingress class, DNS-01 by a provider. */
function solverOf(say: ReturnType<typeof useSay>, solver: NonNullable<AcmeObject['spec']>['solver']): string {
  if (solver?.http01) return say(T.issuer.http01, { class: solver.http01.ingress?.ingressClassName ?? solver.http01.ingress?.class ?? '—' });
  if (solver?.dns01) return say(T.issuer.dns01, { provider: Object.keys(solver.dns01).find((k) => k !== 'cnameStrategy') ?? '—' });
  return '—';
}

/** What it is (its reason in the summary: what that usually means, here). */
function ChallengeState({ object }: ResourceProps) {
  const say = useSay();
  const o = object as AcmeObject;
  const t = T.challenge;
  const yes = (v: boolean | undefined) => say(v ? t.yes : t.no);
  return (
    <Section title={say(t.challenge)} part="challenge">
      <div class="uk-stack">
        {o.status?.reason && o.status.state !== 'valid' && <Hint reason={o.status.reason} />}
        <KeyValue
          rows={[
            [say(t.type), o.spec?.type ?? '—'],
            [say(t.presented), yes(o.status?.presented)],
            [say(t.processing), yes(o.status?.processing)],
            [say(t.solver), solverOf(say, o.spec?.solver)],
          ]}
        />
      </div>
    </Section>
  );
}

export function addAcme(c: KubeContributor): void {
  c.add('Fill', 'cert-manager.resource.view.challenge.state', section({ kinds: [Challenge], order: 5, render: ChallengeState }));
  for (const kind of [Order, Challenge])
    addRelated(c, `${kind.singular}.issuer`, [kind], 50, T.related.issuer, ({ object }) => {
      const o = object as AcmeObject;
      const ref = o.spec?.issuerRef;
      return ref ? [<IssuerOf issuerRef={ref} namespace={o.metadata?.namespace} />, ref.name] : undefined;
    });
}
