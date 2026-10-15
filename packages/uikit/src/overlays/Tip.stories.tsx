import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Button } from '../actions/Button';
import { Status } from '../status/Status';
import { Tip, TipCard, TipField } from './Tip';

const meta = { title: 'Overlays/Tip' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A hint: words beside it, the pointer a while over it (or focus on it). */
export const Hint: Story = {
  render: () => (
    <Tip content={() => 'Restarts the rollout: kubectl rollout restart'}>
      <Button>Restart</Button>
    </Tip>
  ),
};

const conditions: [string, 'True' | 'False' | 'Unknown', string, string][] = [
  ['PodScheduled', 'True', '', ''],
  ['Initialized', 'True', '', ''],
  ['ContainersReady', 'False', 'ContainersNotReady', 'containers with unready status: [app]'],
  ['Ready', 'False', 'ContainersNotReady', 'containers with unready status: [app]'],
  ['DisruptionTarget', 'Unknown', '', ''],
];

/** A card each, the pointer going along them: the first a while, those after it at once; into one, it stays (its text chosen, its button pressed). */
export const Cards: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '6px' }}>
      {conditions.map(([type, status, reason, message]) => (
        <Tip
          key={type}
          card
          content={() => (
            <TipCard
              title={`${type} · Pod web-1`}
              fields={
                <>
                  <TipField label="Status">{status}</TipField>
                  <TipField label="Reason">{reason}</TipField>
                  <TipField label="Last Transition">5m</TipField>
                </>
              }
              sections={message && <div class="uk-muted">{message}</div>}
              actions={
                <Button size="sm" variant="ghost">
                  Copy
                </Button>
              }
            />
          )}
        >
          <Status tone={status === 'True' ? 'ok' : status === 'False' ? 'error' : 'unknown'} icon={status === 'True' ? 'circle-check' : status === 'False' ? 'circle-x' : 'help'} />
        </Tip>
      ))}
    </div>
  ),
};

/** Shown as it is said (a story's, a test's): no pointer asked. */
export const Open: Story = {
  render: () => (
    <div style={{ padding: '60px 0' }}>
      <Tip
        open
        card
        content={() => (
          <TipCard
            title="Ready · Pod web-1"
            fields={
              <>
                <TipField label="Status">False</TipField>
                <TipField label="Reason">ContainersNotReady</TipField>
              </>
            }
          />
        )}
      >
        <Status tone="error" icon="circle-x" />
      </Tip>
    </div>
  ),
};
