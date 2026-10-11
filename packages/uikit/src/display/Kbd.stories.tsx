import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Button } from '../actions/Button';
import { Kbd } from './Kbd';

const meta = { title: 'Display/Kbd', component: Kbd, args: { children: '/' } } satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Key: Story = {};

/** A combination: a cap each, named as this platform names them. */
export const Combination: Story = { args: { children: undefined, keys: 'mod+k' } };

/** As it is used: in a line of text, in a field's button, in hints. */
export const InUse: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', alignItems: 'flex-start' }}>
      <span>
        Press <Kbd>/</Kbd> or <Kbd keys="mod+k" /> to search.
      </span>
      <Button variant="field" icon="search">
        Search or jump to… <Kbd>/</Kbd>
      </Button>
      <span style={{ display: 'flex', gap: '14px', color: 'var(--uk-muted)', fontSize: '12px' }}>
        <span>
          <Kbd keys="up" /> <Kbd keys="down" /> to move
        </span>
        <span>
          <Kbd keys="enter" /> to open
        </span>
        <span>
          <Kbd keys="esc" /> to close
        </span>
        <span>
          <Kbd keys="shift+alt+right" /> to move a tab
        </span>
      </span>
    </div>
  ),
};
