import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Table } from '../data/Table';
import { Skeleton } from './Skeleton';

/* Where something will be: lines, a block; a table whose rows are on their way. */

const meta: Meta = { title: 'Display/Skeleton', component: Skeleton };
export default meta;

export const Shapes: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '320px' }}>
      <Skeleton width="80%" />
      <Skeleton width="55%" />
      <Skeleton shape="block" />
    </div>
  ),
};

export const LoadingTable: StoryObj = {
  render: () => (
    <Table
      rows={[] as { name: string }[]}
      rowKey={(r) => r.name}
      loading
      columns={[
        { id: 'name', header: 'Name', cell: (r) => r.name },
        { id: 'ns', header: 'Namespace', cell: (r) => r.name },
        { id: 'age', header: 'Age', width: '90px', cell: (r) => r.name },
      ]}
    />
  ),
};
