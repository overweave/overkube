import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { Table, type TableColumn, type TableProps, type TableSort } from './Table';

interface Row {
  name: string;
  namespace: string;
  restarts: number;
  message: string;
}

const NAMESPACES = ['apps', 'media', 'kube-system', 'monitoring'];
const MESSAGES = ['', 'Back-off restarting failed container web in pod web-7d9c', 'Readiness probe failed: HTTP probe failed with statuscode: 503', ''];

const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', width: '2fr', cell: (r) => r.name, sortable: true },
  { id: 'namespace', header: 'Namespace', cell: (r) => r.namespace, sortable: true },
  { id: 'restarts', header: 'Restarts', width: '100px', cell: (r) => String(r.restarts), sortable: true },
  { id: 'message', header: 'Message', width: '2fr', cell: (r) => r.message },
];
const row = (i: number): Row => ({ name: `web-${i}`, namespace: NAMESPACES[i % 4], restarts: (i * 7) % 13, message: MESSAGES[i % 4] });
const make = (n: number): Row[] => Array.from({ length: n }, (_, i) => row(i));

/** The rows as whoever gives them sorts them (the table sorts nothing): by the sort it asks for. */
function sorted(rows: readonly Row[], sort: TableSort | undefined): readonly Row[] {
  if (!sort) return rows;
  const by = sort.id as keyof Row;
  return [...rows].sort((a, b) => (a[by] < b[by] ? -1 : a[by] > b[by] ? 1 : 0) * (sort.desc ? -1 : 1));
}

/** A table and its rows' owner: the sort it asks for, given back with the rows sorted so. */
function Sorting(props: TableProps<Row>) {
  const [sort, setSort] = useState<TableSort | undefined>(props.sort);
  return <Table {...props} rows={sorted(props.rows, sort)} sort={sort} onSort={setSort} />;
}

const meta = {
  title: 'Data/Table',
  component: Table<Row>,
  args: { rows: make(6), columns, rowKey: (r: Row) => r.name, sort: { id: 'name' } },
  render: (args) => <Sorting {...args} />,
} satisfies Meta<typeof Table<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

/** Five thousand rows, only those in view drawn. */
export const Many: Story = { args: { rows: make(5000), height: '420px' } };

/** A hundred thousand rows, none held but those in view: a window of them given as the table says which are in view (the rest placeholders till then). */
export const Window: Story = {
  args: { height: '420px' },
  render: (args) => {
    const [range, setRange] = useState<[number, number]>([0, 0]);
    const rows = Array.from({ length: range[1] - range[0] }, (_, i) => row(range[0] + i));
    return <Table {...args} rows={rows} offset={range[0]} total={100_000} onRange={(first, last) => setRange([first, last])} />;
  },
};

/** The message column wraps: rows grow to fit it. */
export const Wrapping: Story = { args: { columns: columns.map((c) => (c.id === 'message' ? { ...c, wrap: true } : c)) } };

/** Narrow: the table scrolls sideways, its head with it. */
export const Narrow: Story = {
  args: { columns: columns.map((c) => ({ ...c, width: c.id === 'restarts' ? '100px' : '220px' })) },
  render: (args) => (
    <div style={{ width: '420px' }}>
      <Sorting {...args} />
    </div>
  ),
};

export const Fixed: Story = { args: { resizable: false } };
export const Empty: Story = { args: { rows: [], empty: 'No Pods' } };

/** As a watched list changes: a row goes (it folds), comes (it fades in), moves a little (it slides); a new sort is at once. */
export const Live: Story = {
  render: (args) => {
    const [list, setList] = useState(() => make(12));
    const [n, setN] = useState(100);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" onClick={() => setList((l) => l.filter((_, i) => i !== 2))}>
            Remove the third
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setList((l) => [...l.slice(0, 1), { name: `web-${n}`, namespace: 'apps', restarts: 0, message: '' }, ...l.slice(1)]);
              setN(n + 1);
            }}
          >
            Add one
          </Button>
          <Button size="sm" onClick={() => setList((l) => l.map((r, i) => (i === 7 ? { ...r, restarts: 99 } : r)))}>
            Restart the eighth (sorted by restarts: it moves)
          </Button>
        </div>
        <Sorting {...args} rows={list} sort={{ id: 'restarts', desc: true }} />
      </div>
    );
  },
};
