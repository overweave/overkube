import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Highlight } from './Highlight';

const meta = { title: 'Display/Highlight', component: Highlight, args: { text: 'Deployments', query: 'dep' } } satisfies Meta<typeof Highlight>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Match: Story = {};
export const NoMatch: Story = { args: { query: 'xyz' } };
