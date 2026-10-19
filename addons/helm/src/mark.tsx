import { addNameMark, type KubeContributor, type NameMarkProps } from '@overkube/sdk';
import { useList, usePage, useSay } from '@overkube/sdk/preact';
import { Status } from '@overkube/uikit';
import { F, SECRETS } from './kinds.ts';
import { PATH, releaseIn } from './page.tsx';
import { useDecoded } from './releases.ts';
import { T } from './texts.ts';
import { HelmState } from './view.tsx';

/*
 * What helm made, marked beside its name in its kind's table — and what a
 * workload of it runs (its pods, its replica sets: addNameMark): helm's
 * mark (its release in its tip), a link opening its release. In its view,
 * under Managed By: its release as it is now (its state, its chart, its
 * revision — its Secrets of that namespace asked, its latest decoded).
 */

function HelmMark({ value }: NameMarkProps) {
  const say = useSay();
  const page = usePage();
  const name = value.split('/').pop() ?? value;
  return (
    <a class="uk-mark-link" href={page.href(releaseIn(PATH, value))}>
      <Status tone="unknown" icon="helm" title={say(T.mark, { name })} />
    </a>
  );
}

function HelmDetail({ value }: NameMarkProps) {
  const say = useSay();
  const page = usePage();
  const [namespace = '', name = ''] = value.split('/');
  const got = useList({
    kind: SECRETS,
    scope: { namespaces: [namespace] },
    where: { field: F.release, op: 'eq', value: name },
    page: { limit: 100 },
    select: ['core.name', F.state, F.version],
  });
  const latest = [...got.items].sort((a, b) => Number(b.values?.[F.version] ?? 0) - Number(a.values?.[F.version] ?? 0))[0]?.values;
  const secret = String(latest?.['core.name'] ?? '');
  const r = useDecoded(secret ? [{ namespace, secret }] : []).get(`${namespace}/${secret}`);
  return (
    <>
      <dt>{say(T.managed.helm)}</dt>
      <dd>
        <span class="uk-line">
          <a href={page.href(releaseIn(PATH, value))}>{name}</a>
          {latest && <HelmState status={String(latest[F.state])} />}
        </span>
      </dd>
      {r && (
        <>
          <dt>{say(T.columns.chart)}</dt>
          <dd class="uk-mono">{say(T.managed.chart, { chart: `${r.chart.metadata.name}-${r.chart.metadata.version}`, revision: r.version })}</dd>
        </>
      )}
    </>
  );
}

export function addMark(c: KubeContributor): void {
  addNameMark(c, 'helm.release', { target: {}, field: F.made, render: HelmMark, detail: HelmDetail, order: 10 });
}
