import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Button } from '../actions/Button';
import { PageHeader } from './PageHeader';

const meta = { title: 'Display/PageHeader', component: PageHeader, args: { icon: 'kube', children: 'Kubernetes', sub: 'v1.35.7 · single node' } } satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithLine: Story = {};
export const Alone: Story = { args: { sub: undefined } };
export const WithActions: Story = {
  args: {
    end: (
      <Button size="sm" icon="refresh">
        Refresh
      </Button>
    ),
  },
};
