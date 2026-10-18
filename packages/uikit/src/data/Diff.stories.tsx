import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Diff } from './Diff';

const BEFORE = `message: installed
replicas: 1
image: busybox:1.37
${Array.from({ length: 12 }, (_, i) => `key${i}: same`).join('\n')}
tail: one`;
const AFTER = `message: upgraded
replicas: 2
image: busybox:1.37
${Array.from({ length: 12 }, (_, i) => `key${i}: same`).join('\n')}
tail: two`;

/** Two revisions' values, as a code host shows a file's changes: its head, its hunks, what changed in a line. */
const meta = { title: 'Data/Diff', component: Diff, args: { title: 'values.yaml', before: BEFORE, after: AFTER } } satisfies Meta<typeof Diff>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Changed: Story = {};
export const Same: Story = { args: { before: 'a: 1', after: 'a: 1', same: 'No differences.' } };
