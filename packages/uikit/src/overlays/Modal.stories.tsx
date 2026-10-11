import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { KeyValue } from '../data/KeyValue';
import { Modal, type ModalPlacement } from './Modal';

const meta = { title: 'Overlays/Modal', component: Modal, args: { title: 'Pod media/web', children: 'What is in it.', onClose: () => {} } } satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

const BODY = (
  <KeyValue
    rows={[
      ['Name', 'web-7d9c5f8b6d-xk2lp'],
      ['Namespace', 'media'],
      ['Node', 'node-1'],
      ['Created', '3d ago'],
    ]}
  />
);

/** Opened from a button: in the middle, from the left, from the right, from the bottom; one over another (Escape closes the top one). */
export const Placements: Story = {
  render: () => {
    const [open, setOpen] = useState<ModalPlacement | undefined>();
    const [inner, setInner] = useState(false);
    return (
      <div style={{ display: 'flex', gap: '10px', padding: '24px' }}>
        {(['center', 'left', 'right', 'bottom'] as const).map((p) => (
          <Button key={p} onClick={() => setOpen(p)}>
            {p}
          </Button>
        ))}
        {open && (
          <Modal
            title="Pod media/web"
            placement={open}
            onClose={() => setOpen(undefined)}
            footer={
              <>
                <Button variant="ghost">Edit YAML</Button>
                <Button variant="danger" icon="x">
                  Delete
                </Button>
              </>
            }
          >
            {BODY}
            <div>
              <Button onClick={() => setInner(true)}>Open another over it</Button>
            </div>
          </Modal>
        )}
        {inner && (
          <Modal title="Another" onClose={() => setInner(false)}>
            Escape closes this one, not the one under it.
          </Modal>
        )}
      </div>
    );
  },
};

export const Center: Story = { args: { children: BODY } };
export const Left: Story = { args: { placement: 'left', children: BODY } };
export const Right: Story = { args: { placement: 'right', children: BODY } };
export const Bottom: Story = { args: { placement: 'bottom', children: BODY } };
export const WithFooter: Story = {
  args: {
    children: BODY,
    footer: (
      <>
        <Button variant="ghost">Edit YAML</Button>
        <Button variant="danger" icon="x">
          Delete
        </Button>
      </>
    ),
  },
};

/** Asking before it is done, as the page does: the question, then Cancel, then the one that does it. */
export const Confirming: Story = {
  args: {
    children: BODY,
    footer: (
      <>
        <span style={{ marginRight: 'auto', color: 'var(--uk-muted)' }}>Delete Pod media/web?</span>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger" icon="x">
          Delete
        </Button>
      </>
    ),
  },
};
