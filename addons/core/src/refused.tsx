import type { KindInfo } from '@overkube/kube-types';
import type { QueryError, State } from '@overkube/query';
import { useSay } from '@overkube/sdk/preact';
import { Notice } from '@overkube/uikit';
import { T } from './texts.ts';

/*
 * What a view asked of the cluster and was refused (denied, an error): said
 * so, why under the pointer — never taken for none (no events, no quota, no
 * pods using it).
 */

/** Whether an answer was refused. */
export const refused = (answer: { state: State }) => answer.state === 'denied' || answer.state === 'error';

/** A refusal said in a section: its kind cannot be had, and why. */
export function Refused({ kind, error }: { kind: KindInfo; error?: QueryError | undefined }) {
  const say = useSay();
  return (
    <Notice level="warn" icon="warning">
      <span title={error?.message}>{say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</span>
    </Notice>
  );
}

/** A refusal said in a field (a related one): quietly, why under the pointer. */
export function RefusedQuietly({ kind, error }: { kind: KindInfo; error?: QueryError | undefined }) {
  const say = useSay();
  return (
    <span class="uk-quiet" title={error?.message}>
      {say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}
    </span>
  );
}
