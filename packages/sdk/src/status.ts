import type { KindInfo } from '@overkube/kube-types';
import type { Definition } from '@overweave/core';
import type { StatusLookSpec } from './kinds.ts';
import { takes } from './target.ts';

/*
 * How a state looks (StatusLook), found for a kind's words: the words as
 * said before a pattern (* any run of them: the longer first), a kind's own
 * before every kind's, then by order.
 */

/** Whether a look's words take these: as said, or as its pattern (* any run of them). */
const matches = (match: string, words: string) =>
  match.includes('*')
    ? new RegExp(
        `^${match
          .split('*')
          .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
      ).test(words)
    : match === words;

/** The look of these words for a kind: as said before a pattern (the longer pattern first), a kind's own before every kind's, then by order. */
export function lookOf(looks: readonly Definition<StatusLookSpec>[], kind: KindInfo, words: string): StatusLookSpec | undefined {
  const rank = (l: StatusLookSpec) => [l.match.includes('*') ? 1 : 0, l.target?.kinds ? 0 : 1, -l.match.length, l.order ?? 500];
  const taken = looks.filter((d) => takes(d.spec.target, kind) && matches(d.spec.match, words)).map((d) => d.spec);
  const before = (a: StatusLookSpec, b: StatusLookSpec) => {
    const [x, y] = [rank(a), rank(b)];
    const i = x.findIndex((v, j) => v !== y[j]);
    return i < 0 ? 0 : x[i] - y[i];
  };
  return taken.sort(before)[0];
}
