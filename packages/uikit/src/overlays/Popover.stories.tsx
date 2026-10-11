import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useRef, useState } from 'preact/hooks';
import { Popover } from './Popover';

const meta = { title: 'Overlays/Popover' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  render: () => {
    const anchor = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" class="uk-button" ref={anchor} aria-expanded={open} onClick={() => setOpen(!open)}>
          Open
        </button>
        {open && (
          <Popover anchor={anchor} label="A popover" onClose={() => setOpen(false)}>
            <div style={{ padding: '12px' }}>A popover’s content</div>
          </Popover>
        )}
      </>
    );
  },
};
