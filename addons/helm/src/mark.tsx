import type { KubeContributor, NameMarkProps } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import { Status } from '@overkube/uikit';
import { F } from './kinds.ts';
import { PATH, releaseIn } from './page.tsx';
import { T } from './texts.ts';

/*
 * What helm made, marked beside its name in its kind's table: helm's mark
 * (its release in its tip), a link opening its release.
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

export function addMark(c: KubeContributor): void {
  c.add('NameMark', 'helm.release', { target: {}, field: F.made, render: HelmMark, order: 10 });
}
