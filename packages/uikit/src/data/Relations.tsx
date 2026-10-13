import type { ComponentChildren } from 'preact';
import type { Level } from '../lib/level';
import { Dot } from '../status/Dot';
import { Table, type TableColumn } from './Table';

/*
 * What a thing is related to, as one table (a concept: what a resource's
 * view will show of its relations): a group a run of rows — what they are
 * to it (its owners, where it runs, its config, who reaches it), named on
 * its first row; each row one of them: its kind, its name (a link), how it
 * is doing in a few words, a dot of that before them (grey where its kind
 * says nothing of it; nothing said, no dot). A group of none is no rows —
 * but where none means something (a service selecting no pod), a row
 * saying so. One line each, cut short (in full under the pointer); in the
 * order given.
 */

/** One of them: its kind, its name, where it leads; how it is doing (a few words) and its level (none: grey). */
export interface Related {
  kind: string;
  name: string;
  href: string;
  state?: string;
  level?: Level;
}

/** A group of them: what they are to it; them — or, none of them, what that means (none said: not shown). */
export interface RelationGroup {
  label: string;
  items: Related[];
  none?: string;
}

export interface RelationsLabels {
  relation: string;
  kind: string;
  name: string;
  state: string;
}

const LABELS: RelationsLabels = { relation: 'Relation', kind: 'Kind', name: 'Name', state: 'State' };

/** A row: its group (named on its first row), one of them — or what none of them means. */
interface Row {
  key: string;
  group: string;
  first: boolean;
  item?: Related;
  none?: string;
}

/** The groups as rows, in the order given (the key leads with its place: a table sorted by nothing goes by key). */
function rowsOf(groups: readonly RelationGroup[]): Row[] {
  let n = 0;
  const key = (rest: string) => `${String(n++).padStart(4, '0')} ${rest}`;
  return groups.flatMap((g): Row[] => {
    if (!g.items.length) return g.none ? [{ key: key(g.label), group: g.label, first: true, none: g.none }] : [];
    return g.items.map((item, i) => ({ key: key(`${g.label}/${item.kind}/${item.name}`), group: g.label, first: i === 0, item }));
  });
}

const cut = (text: string, children: ComponentChildren = text) => (
  <span class="uk-relations-cut" title={text}>
    {children}
  </span>
);

function columnsOf(labels: RelationsLabels): TableColumn<Row>[] {
  return [
    { id: 'relation', header: labels.relation, width: '1.1fr', cell: (r) => (r.first ? <span class="uk-muted">{r.group}</span> : '') },
    {
      id: 'kind',
      header: labels.kind,
      width: '1fr',
      cell: (r) => (r.item ? <span class="uk-muted">{r.item.kind}</span> : <span class="uk-relations-none">{r.none}</span>),
    },
    { id: 'name', header: labels.name, width: '1.4fr', cell: (r) => r.item && <a href={r.item.href}>{cut(r.item.name)}</a> },
    {
      id: 'state',
      // Its header past a dot's room, as its words are: lined up with them.
      header: <span class="uk-relations-state-head">{labels.state}</span>,
      label: labels.state,
      width: '1.5fr',
      cell: (r) =>
        r.item?.state && (
          <span class="uk-relations-state" title={r.item.state}>
            <Dot level={r.item.level} />
            <span class="uk-relations-cut">{r.item.state}</span>
          </span>
        ),
    },
  ];
}

export function Relations({ groups, labels = LABELS }: { groups: readonly RelationGroup[]; labels?: RelationsLabels }) {
  return <Table rows={rowsOf(groups)} columns={columnsOf(labels)} rowKey={(r) => r.key} />;
}
