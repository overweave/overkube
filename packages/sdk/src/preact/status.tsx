import type { KindInfo } from '@overkube/kube-types';
import { Status } from '@overkube/uikit';
import { useDefinitions } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import type { CellValue } from '../kinds.ts';
import { StatusLook } from '../kinds.ts';
import { lookOf } from '../status.ts';

/*
 * A state drawn as its look says (StatusLook: its tone, its icon) — a
 * table's cell, a view's field, wherever a state is.
 */

/** What an empty cell shows. */
const EMPTY = '—';

/** A state drawn as its look says (none: its words as they are); a mark, its icon only — what it says under the pointer (title: other words for it). */
export function StatusOf({ kind, words, mark = false, title }: { kind: KindInfo; words: string; mark?: boolean; title?: string }) {
  const looks = useDefinitions(StatusLook);
  const look = useMemo(() => lookOf(looks, kind, words), [looks, kind, words]);
  if (!look) return mark ? <Status tone="unknown" icon="help" title={title ?? words} /> : words;
  return (
    <Status tone={look.tone} icon={look.icon} title={title ?? (mark ? words : undefined)}>
      {mark ? undefined : words}
    </Status>
  );
}

/** A column's format of a state (its value, the first if many): drawn as its look says; none, "—". */
export const statusFormat = ([value]: readonly CellValue[], { kind }: { kind: KindInfo }) => {
  const words = Array.isArray(value) ? value[0] : value;
  return words === null || words === undefined || words === '' ? EMPTY : <StatusOf kind={kind} words={String(words)} />;
};
