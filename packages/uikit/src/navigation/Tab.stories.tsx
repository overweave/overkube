import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Tab, type TabItem } from './Tab';

/*
 * One tab, each state of it side by side: as it is drawn alone, in a tab
 * list of its own. Each is live: a click selects it, its × closes it (Delete
 * too, focused).
 */

const STATES: { name: string; tab: TabItem; selected?: boolean }[] = [
  { name: 'A page’s own', tab: { key: 'overview', label: 'Overview' } },
  { name: 'Selected', tab: { key: 'overview', label: 'Overview' }, selected: true },
  { name: 'Pinned', tab: { key: 'pods', label: 'Pods', title: 'Pods (v1/Pod)' } },
  { name: 'Open (not kept)', tab: { key: 'nodes', label: 'Nodes', title: 'Nodes (v1/Node)', transient: true, closable: true } },
  { name: 'Open, selected', tab: { key: 'nodes', label: 'Nodes', title: 'Nodes (v1/Node)', transient: true, closable: true }, selected: true },
  { name: 'Warn', tab: { key: 'deployments', label: 'Deployments', dot: 'warn' } },
  { name: 'Error', tab: { key: 'pods', label: 'Pods', dot: 'error' } },
  { name: 'Ok (no dot)', tab: { key: 'pods', label: 'Pods', dot: 'ok' } },
  { name: 'Error, open', tab: { key: 'jobs', label: 'Jobs', transient: true, closable: true, dot: 'error' } },
  { name: 'Long name', tab: { key: 'pvcs', label: 'PersistentVolumeClaims', transient: true, closable: true } },
  { name: 'No tools', tab: { key: 'map', label: 'Map', closable: true } },
];

function Live({ tab: first, selected: on = false }: { tab: TabItem; selected?: boolean }) {
  const [tab] = useState(first);
  const [selected, setSelected] = useState(on);
  const [closed, setClosed] = useState(false);
  if (closed)
    return (
      <button type="button" class="uk-link" onClick={() => setClosed(false)}>
        closed — bring back
      </button>
    );
  return (
    <div class="uk-tabs" style={{ display: 'inline-flex' }}>
      <div class="uk-tab-list" role="tablist" aria-label={String(tab.label)}>
        <Tab
          tab={tab}
          selected={selected}
          stop
          labels={{ close: (t) => `Close ${t}`, dot: (l) => (l === 'error' ? 'failing' : 'needs a look') }}
          onSelect={() => setSelected(!selected)}
          onClose={first.closable ? () => setClosed(true) : undefined}
        />
      </div>
    </div>
  );
}

function States() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', gap: '12px 32px', alignItems: 'center', padding: '24px' }}>
      {STATES.map((s) => (
        <Fragment key={s.name}>
          <span style={{ color: 'var(--uk-muted)', fontSize: '12px' }}>{s.name}</span>
          <Live tab={s.tab} selected={s.selected} />
        </Fragment>
      ))}
    </div>
  );
}

const meta = { title: 'Navigation/Tab', component: States, parameters: { controls: { disable: true } } } satisfies Meta<typeof States>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every state; each live (a click, the ×; Delete when focused). */
export const AllStates: Story = {};
