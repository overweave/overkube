import { type Cel, CelError, createCel, type FilterVariable, filterCaret, filterParts, filterValue, filterVariables, planFilter, resugar } from '@overkube/cel';
import type { Where } from '@overkube/query';
import { filteredIn, filterIn, type KindProps, kindRef, type Label } from '@overkube/sdk';
import { useCount, useFields, usePage, useSay } from '@overkube/sdk/preact';
import { QueryField, type QueryProblem, type QuerySuggestion, type QuerySuggestions } from '@overkube/uikit';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Chosen, scopeOf } from './namespaces.tsx';
import { T } from './texts.ts';

/*
 * A kind's filter (core.kind.header.filter; anywhere, the kind.filter slot's — an addon's page's): typed as a user types it (a
 * field compared, a label selector, words of a name — or CEL), its parts
 * coloured, what is wrong under where it is, what may go at the caret (the
 * kind's fields, the operators, the values its objects have, with how many
 * have each; Tab takes one); typing stopped a while, or Enter: the page
 * filtered by its CEL (?filter=, in the page's path: Back, a link keep it),
 * the table's objects those it holds. The page's filter shown as typed
 * (CEL back to its sugar) — what is typed kept while it means what the
 * page's filter is (as it was typed, not as it is said back); the page's
 * filter changed elsewhere (Back, a link): its own. One for each kind (one
 * kind's typing not another's).
 */

/** How long typing stops before what is typed is applied. */
const PAUSE_MS = 600;

/** Values offered at most. */
const OFFERED = 30;

/** Operators offered after a field, by its type (a label's: a string's; a list's: one of its values is, is not, in). */
const OPS: Record<string, string[]> = {
  string: ['=', '!=', 'in ('],
  number: ['=', '!=', '>', '>=', '<', '<=', 'in ('],
  time: ['>', '>=', '<', '<='],
  bool: ['=', '!='],
  many: ['=', '!=', 'in ('],
};

/** An age's values offered (as kubectl's AGE says them), a time's (now's, the page clock's days). */
const AGES = ['5m', '1h', '1d', '7d', '30d'];
const TIMES = ['now-1h', 'now-1d', 'today', 'yesterday'];

/** CEL with the kind's functions (they may be called in a filter); its functions none (not made): CEL's own. */
function celOf(functions: Readonly<Record<string, string>> | undefined): Cel {
  try {
    return createCel({ functions: functions ?? {} });
  } catch {
    return createCel();
  }
}

/** What values are offered of: a field's (grouped by it), a label's keys, a label's values (those of its key). */
interface Asking {
  groupBy: string;
  where?: Where;
}

export function KindFilter({ kind, chosen, placeholder }: KindProps & { chosen: Chosen; placeholder?: Label }) {
  const page = usePage();
  const say = useSay();
  const ref = kindRef(kind);
  const path = page.path.value;
  /** The page it is on (its path but its query): what it filters, while the page is it. */
  const home = useRef(path.split('?')[0]);
  const applied = filteredIn(path);
  const { catalog } = useFields(ref);
  const cel = useMemo(() => celOf(catalog?.functions), [catalog?.functions]);
  const variables = useMemo<FilterVariable[]>(() => (catalog ? filterVariables(ref, catalog.fields) : []), [catalog, ref]);
  const shown = useMemo(() => (applied && catalog ? resugar(applied, variables, cel) : (applied ?? '')), [applied, variables, cel, catalog]);

  const [text, setText] = useState(shown);
  /** The page's filter as this one applied it last (its own going: not one from elsewhere), and as it was shown. */
  const mine = useRef(applied);
  const last = useRef(shown);
  useEffect(() => {
    // From elsewhere (Back, a link): its text; its own, or shown anew (its fields come): kept as typed, unless it was the one shown.
    if (applied !== mine.current || text === last.current) setText(shown);
    mine.current = applied;
    last.current = shown;
  }, [applied, shown]);

  const checked = useMemo((): { cel?: string; problems: QueryProblem[] } => {
    if (!text.trim() || !catalog) return { problems: [] };
    try {
      return { cel: planFilter(text, variables, cel).cel.trim(), problems: [] };
    } catch (e) {
      const at = e instanceof CelError ? e.at : undefined;
      return { problems: [{ start: at?.start ?? 0, end: Math.max(at?.end ?? text.length, (at?.start ?? 0) + 1), message: (e as Error).message }] };
    }
  }, [text, variables, cel, catalog]);
  const parts = useMemo(() => filterParts(text, variables), [text, variables]);
  // Wrong at its end (being typed: not ended yet): said once typing stops a while, or it is asked (Enter).
  const [asked, setAsked] = useState(false);
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), PAUSE_MS);
    return () => clearTimeout(t);
  }, [text]);
  const end = text.trimEnd().length;
  const problems = asked || settled ? checked.problems : checked.problems.filter((p) => p.end < end);

  // The values offered: of the field being typed a value of (its values, how many of each), once asked.
  const [asking, setAsking] = useState<Asking>();
  const scope = scopeOf(kind, undefined, chosen.value);
  const groups = useCount({
    kind: ref,
    ...(scope ? { scope } : {}),
    ...(asking ? { groupBy: asking.groupBy, top: 200, ...(asking.where ? { where: asking.where } : {}) } : {}),
  }).groups;

  const suggest = (value: string, caret: number): QuerySuggestions | undefined => {
    const at = filterCaret(value, caret, variables);
    if (!at) return undefined;
    const { variable, label } = at;
    const wanted: Asking | undefined =
      at.want === 'label'
        ? { groupBy: 'core.label.keys' }
        : at.want !== 'value'
          ? undefined
          : label !== undefined
            ? { groupBy: 'core.labels', where: { field: 'core.labels', op: 'contains', value: `${label}=` } }
            : variable && (variable.type === 'string' || variable.type === 'number')
              ? { groupBy: variable.field }
              : undefined;
    const same = JSON.stringify(wanted) === JSON.stringify(asking);
    if (!same) queueMicrotask(() => setAsking(wanted));
    // Values there are (none's group aside).
    const had = same ? (groups ?? []).filter((g) => g.value !== null && g.value !== undefined && g.value !== '') : [];
    /** A value offered as typed: a string's a word as it is or quoted; a number's a number. */
    const offered = (v: string | number | boolean, count?: number): QuerySuggestion => ({
      value: `${typeof v === 'string' ? filterValue(v, variables) : String(v)} `,
      title: String(v),
      ...(count !== undefined ? { hint: String(count) } : {}),
    });
    const shortName = (v: FilterVariable) => (v.name.endsWith('_') ? v.name.slice(0, -1) : v.name);
    let items: QuerySuggestion[] = [];
    // An age: of when it was made (a kind with none such: none).
    const aged = variables.some((v) => v.field === 'core.created');
    if (at.want === 'field')
      items = [
        ...variables.map((v) => ({ value: `${shortName(v)} `, title: shortName(v), hint: v.many ? 'list' : v.type, kind: 'field' as const })),
        ...(aged ? [{ value: 'age ', title: 'age', hint: 'duration', kind: 'field' as const }] : []),
        { value: 'labels.', title: 'labels.', hint: 'map', kind: 'field' as const },
      ];
    else if (at.want === 'label') items = had.map((g) => ({ value: `${g.value} `, title: String(g.value), hint: String(g.count) }));
    else if (at.want === 'op') {
      const ops = label !== undefined ? OPS.string : at.field === 'age' && aged ? OPS.time : variable ? OPS[variable.many ? 'many' : variable.type] : [];
      items = (ops ?? []).map((o) => ({ value: o.endsWith('(') ? o : `${o} `, title: o.replace(' (', ''), kind: 'op' as const }));
    } else if (at.want === 'value') {
      if (variable?.type === 'bool') items = [offered(true), offered(false)];
      else if (at.field === 'age' && aged) items = AGES.map((a) => ({ value: `${a} `, title: a }));
      else if (variable?.type === 'time') items = TIMES.map((t) => ({ value: `${t} `, title: t }));
      else if (label !== undefined) {
        const prefix = `${label}=`;
        items = had.filter((g) => String(g.value).startsWith(prefix)).map((g) => offered(String(g.value).slice(prefix.length), g.count));
      } else items = had.map((g) => offered(variable?.type === 'number' ? Number(g.value) : String(g.value), g.count));
    } else items = ['and', 'or'].map((j) => ({ value: `${j} `, title: j, kind: 'keyword' as const }));
    const typed = at.typed.toLowerCase();
    const matching = items.filter((s) => (s.title ?? s.value).toLowerCase().includes(typed) && (s.title ?? s.value) !== at.typed);
    // Those it starts with first.
    matching.sort((a, b) => Number(!(a.title ?? a.value).toLowerCase().startsWith(typed)) - Number(!(b.title ?? b.value).toLowerCase().startsWith(typed)));
    return matching.length ? { from: at.from, to: at.to, items: matching.slice(0, OFFERED) } : undefined;
  };

  /** The page filtered by what is typed (nothing: not filtered; wrong: as it was) — a step of its own (Back: as it was) when it was not filtered or it is asked (Enter), else in its place. The page gone elsewhere: nothing. */
  const apply = (enter: boolean) => {
    const now = page.path.value;
    if (now.split('?')[0] !== home.current) return;
    const was = filteredIn(now);
    const next = text.trim() ? checked.cel : undefined;
    if ((text.trim() && !next) || next === was) return;
    mine.current = next;
    page.navigate(filterIn(now, next), { replace: !enter && was !== undefined });
  };
  // Typing stopped a while, what is typed meaning another filter than the page's: applied (if it is one).
  const typing = (text.trim() ? checked.cel : undefined) !== applied;
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => apply(false), PAUSE_MS);
    return () => clearTimeout(t);
  }, [text, checked.cel, typing]);

  return (
    <QueryField
      label={say(T.kind.filter.label)}
      placeholder={say(placeholder ?? T.kind.filter.placeholder)}
      icon="search"
      value={text}
      onChange={(v) => {
        setText(v);
        setAsked(false);
        setSettled(false);
        if (!v && applied) {
          mine.current = undefined;
          page.navigate(filterIn(path, undefined));
        }
      }}
      onSubmit={() => {
        setAsked(true);
        apply(true);
      }}
      parts={parts}
      problems={problems}
      suggest={suggest}
      labels={{ clear: say(T.kind.filter.clear) }}
    />
  );
}
