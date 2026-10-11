import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { Table, type TableColumn } from './Table';

interface Row {
  name: string;
  namespace: string;
  restarts: number;
  message: string;
}

const NAMESPACES = ['apps', 'media', 'kube-system', 'monitoring'];
const MESSAGES = ['', 'Back-off restarting failed container web in pod web-7d9c', 'Readiness probe failed: HTTP probe failed with statuscode: 503', ''];

const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', width: '2fr', cell: (r) => r.name, sort: (r) => r.name },
  { id: 'namespace', header: 'Namespace', cell: (r) => r.namespace, sort: (r) => r.namespace },
  { id: 'restarts', header: 'Restarts', width: '100px', cell: (r) => String(r.restarts), sort: (r) => r.restarts },
  { id: 'message', header: 'Message', width: '2fr', cell: (r) => r.message },
];
const make = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ name: `web-${i}`, namespace: NAMESPACES[i % 4], restarts: (i * 7) % 13, message: MESSAGES[i % 4] }));

const meta = {
  title: 'Data/Table',
  component: Table<Row>,
  args: { rows: make(6), columns, rowKey: (r: Row) => r.name, initialSort: { id: 'name' } },
} satisfies Meta<typeof Table<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

/** Five thousand rows, only those in view drawn. */
export const Many: Story = { args: { rows: make(5000), height: '420px' } };

/** The message column wraps: rows grow to fit it. */
export const Wrapping: Story = { args: { columns: columns.map((c) => (c.id === 'message' ? { ...c, wrap: true } : c)) } };

/** Narrow: the table scrolls sideways, its head with it. */
export const Narrow: Story = {
  args: { columns: columns.map((c) => ({ ...c, width: c.id === 'restarts' ? '100px' : '220px' })) },
  render: (args) => (
    <div style={{ width: '420px' }}>
      <Table {...args} />
    </div>
  ),
};

export const Picking: Story = {
  render: (args) => {
    const [selected, setSelected] = useState<Set<string>>(new Set(['web-1']));
    return <Table {...args} selection={{ selected, onChange: setSelected, label: 'All pods' }} />;
  },
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
        <Table {...args} rows={list} initialSort={{ id: 'restarts', desc: true }} />
      </div>
    );
  },
};
