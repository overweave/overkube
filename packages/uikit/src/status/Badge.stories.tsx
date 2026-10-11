import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Fragment } from 'preact';
import { Badge } from './Badge';

const meta = {
  title: 'Status/Badge',
  component: Badge,
  args: { children: 'Running' },
  argTypes: { level: { control: 'select', options: [undefined, 'ok', 'warn', 'error'] } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Ok: Story = { args: { level: 'ok' } };
export const Warn: Story = { args: { level: 'warn', children: 'Pending' } };
export const Failing: Story = { args: { level: 'error', children: 'CrashLoopBackOff' } };
export const WithDot: Story = { args: { level: 'ok', dot: true } };

/** Every level: a word, with a dot, a count; and as a table's cell has them. */
export const All: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: '12px 18px', alignItems: 'center', padding: '24px' }}>
      {(
        [
          [undefined, 'Unknown', 'init'],
          ['ok', 'Running', 'True'],
          ['warn', 'Pending', 'Warning'],
          ['error', 'CrashLoopBackOff', 'ImagePullBackOff'],
        ] as const
      ).map(([level, word, other]) => (
        <Fragment key={word}>
          <Badge level={level}>{word}</Badge>
          <Badge level={level} dot>
            {word}
          </Badge>
          <Badge level={level}>{other}</Badge>
          <Badge level={level}>3</Badge>
        </Fragment>
      ))}
      <div style={{ gridColumn: '1 / -1', width: '120px' }}>
        <Badge level="error" title="CrashLoopBackOff: back-off restarting failed container">
          CrashLoopBackOff: back-off restarting failed container
        </Badge>
      </div>
    </div>
  ),
};
