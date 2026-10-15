import type { Meta, StoryObj } from '@storybook/preact-vite';
import { EmptyState } from './EmptyState';

const meta = { title: 'Display/EmptyState', component: EmptyState, args: { icon: 'cube', title: 'No pods', children: 'None in shop, web.' } } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithAction: Story = { args: { action: { label: 'Show all namespaces', run: () => {} } } };
