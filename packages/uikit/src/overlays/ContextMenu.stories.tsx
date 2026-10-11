import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { usePresence } from '../lib/motion';
import { ContextMenu, type ContextMenuGroup } from './ContextMenu';

/* A tab's menu, opened as a page opens it: a right click at the pointer, the menu key (or Shift+F10) at the element. */

function Demo() {
  const [open, setOpen] = useState<{ x: number; y: number; keyboard: boolean }>();
  const [said, setSaid] = useState('—');
  const presence = usePresence(!!open);
  const [at, setAt] = useState({ x: 0, y: 0, keyboard: false });
  const show = (o: { x: number; y: number; keyboard: boolean }) => {
    setAt(o);
    setOpen(o);
  };
  const groups: ContextMenuGroup[] = [
    {
      key: 'tab',
      items: [
        { key: 'unpin', label: 'Unpin', icon: 'pin', onSelect: () => setSaid('unpin') },
        { key: 'copy', label: 'Copy link', icon: 'copy', keys: 'mod+c', onSelect: () => setSaid('copy') },
        { key: 'refresh', label: 'Refresh', icon: 'refresh', disabled: true, onSelect: () => setSaid('refresh') },
      ],
    },
    { key: 'close', items: [{ key: 'close', label: 'Close', icon: 'x', keys: 'delete', danger: true, onSelect: () => setSaid('close') }] },
  ];
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
      <button
        type="button"
        class="uk-tab"
        onContextMenu={(e) => {
          if (e.shiftKey) return;
          e.preventDefault();
          show({ x: e.clientX, y: e.clientY, keyboard: false });
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          show({ x: r.left, y: r.bottom, keyboard: true });
        }}
      >
        Pods (right click, or the menu key)
      </button>
      <span style={{ color: 'var(--uk-muted)', fontSize: '12px' }}>Chosen: {said}</span>
      {presence.mounted && <ContextMenu at={at} keyboard={at.keyboard} label="Pods" title="Pods" groups={groups} state={presence.state} onClose={() => setOpen(undefined)} />}
    </div>
  );
}

const meta = { title: 'Overlays/ContextMenu', component: Demo, parameters: { controls: { disable: true } } } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnATab: Story = {};
