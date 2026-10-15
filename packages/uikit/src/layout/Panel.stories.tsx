import type { Meta, StoryObj } from '@storybook/preact-vite';
import { PageHeader } from '../display/PageHeader';
import { Panel } from './Panel';

const meta = {
  title: 'Layout/Panel',
  component: Panel,
  args: {
    header: (
      <PageHeader level={2} icon="cube" sub="v1 · 2 total">
        Pods
      </PageHeader>
    ),
    children: <p style={{ margin: 0, padding: '12px 16px' }}>What is in it.</p>,
  },
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithHeader: Story = {};
export const Alone: Story = { args: { header: undefined } };
