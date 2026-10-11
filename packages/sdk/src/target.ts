import type { KindInfo } from '@overkube/kube-types';
import type { Matcher } from '@overweave/ui';
import type { Target } from './kinds.ts';

/** A target of these kinds: forKinds(kinds.core.v1.Pod, kinds.apps.v1.Deployment). */
export function forKinds(...of: readonly Pick<KindInfo, 'id'>[]): Target {
  return { kinds: of.map((k) => k.id) };
}

/** Whether a target takes a kind: no kinds named, every one. */
export function takes(target: Target | undefined, kind: Pick<KindInfo, 'id'> | undefined): boolean {
  if (!target?.kinds) return true;
  return kind !== undefined && target.kinds.includes(kind.id);
}

/** The dashboard's matcher: a fill with a target is for slots drawn about a kind it names (props.kind). */
export const kindMatcher: Matcher<Target, { kind?: Pick<KindInfo, 'id'> }> = {
  matches: (target, props) => takes(target, props?.kind),
};
