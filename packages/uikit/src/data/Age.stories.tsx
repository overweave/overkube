import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Age } from './Age';

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const meta = { title: 'Data/Age', component: Age, args: { since: ago(90) } } satisfies Meta<typeof Age>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Seconds: Story = {};
export const Hours: Story = { args: { since: ago(3 * 3600) } };
export const Days: Story = { args: { since: ago(5 * 86_400) } };
