import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import type { Level } from '../lib/level';
import { type TabItem, Tabs, type TabsProps } from './Tabs';
import { closeTab, moveTab, nextTab, openTab, pinTab } from './tabState';

/*
 * The strip as a page has it, two sections: pinned — the pages' own
 * (pinned for good, no tool) and those the user pinned (each with its
 * unpin), in any order — and open (each with its ×). Every callback wired:
 * select, close (×, Delete, a middle click), unpin (its pin: it goes, or
 * stays open if it is the one shown), drag within a section or across it (into the pinned: pinned; into the open: unpinned —
 * a page's own stays in the pinned), Alt and the arrows, a + adding an
 * open tab.
 */

interface State {
  /** The pages' own: pinned for good. */
  own: string[];
  /** The pinned, the pages' own among them, in order. */
  pinned: string[];
  open: string[];
}

const LABELS: Record<string, string> = {
  overview: 'Overview',
  extensions: 'Extensions',
  pods: 'Pods',
  deployments: 'Deployments',
  services: 'Services',
  nodes: 'Nodes',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  ingresses: 'Ingresses',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  pvcs: 'PersistentVolumeClaims',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  namespaces: 'Namespaces',
};
const DOTS: Record<string, Level> = { pods: 'error', deployments: 'warn', nodes: 'ok' };

function Strip({ initial, active: first }: { initial: State; active: string }) {
  const [s, setS] = useState(initial);
  const [active, setActive] = useState(first);
  const all = [...s.pinned, ...s.open];
  const item = (key: string, how: 'own' | 'pinned' | 'open'): TabItem => ({
    key,
    label: LABELS[key] ?? key,
    title: LABELS[key] ?? key,
    dot: DOTS[key],
    transient: how === 'open',
    closable: how === 'open',
    pinned: how === 'own' ? undefined : how === 'pinned',
    stays: how === 'own',
  });
  // The strip's rules (tabState), as the page keeps them.
  const lists = { pinned: s.pinned, open: s.open };
  const close = (key: string) => {
    if (key === active) setActive(nextTab(lists, key) ?? '');
    setS({ ...s, ...closeTab(lists, key) });
  };
  const pin = (key: string, on: boolean) => setS({ ...s, ...pinTab(lists, key, on, active) });
  const move: TabsProps['onMove'] = (key, section, index) => setS({ ...s, ...moveTab(lists, key, section, index) });
  const add = () => {
    const next = Object.keys(LABELS).find((k) => !all.includes(k));
    if (!next) return;
    setS({ ...s, ...openTab(lists, next) });
    setActive(next);
  };
  return (
    <div style={{ padding: '16px' }}>
      <Tabs
        label="Pages and kinds"
        active={active}
        sections={[
          { id: 'pinned', tabs: s.pinned.map((k) => item(k, s.own.includes(k) ? 'own' : 'pinned')), draggable: true },
          { id: 'open', tabs: s.open.map((k) => item(k, 'open')), draggable: true },
        ]}
        end={
          <button type="button" class="uk-tab uk-tab-add" aria-label="Open a kind" onClick={add}>
            <Icon name="plus" />
          </button>
        }
        onSelect={setActive}
        onClose={close}
        onPin={pin}
        onMove={move}
      />
      <p style={{ color: 'var(--uk-muted)', fontSize: '12px', marginTop: '16px' }}>
        Active: <b>{LABELS[active] ?? '—'}</b> · pinned: {s.pinned.map((k) => LABELS[k]).join(', ')} · open: {s.open.map((k) => LABELS[k]).join(', ') || '—'}
      </p>
    </div>
  );
}

const meta = {
  title: 'Navigation/Tabs',
  component: Strip,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Strip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Select; close (×, Delete, a middle click); unpin (its pin); drag within and across (pinning, unpinning); add with +. */
export const Playing: Story = {
  args: {
    initial: { own: ['overview', 'extensions'], pinned: ['overview', 'extensions', 'pods', 'deployments', 'services'], open: ['nodes', 'configmaps'] },
    active: 'pods',
  },
};

/** More tabs than fit. */
export const Many: Story = {
  args: {
    initial: {
      own: ['overview', 'extensions'],
      pinned: ['overview', 'extensions', 'pods', 'deployments', 'services', 'statefulsets', 'daemonsets'],
      open: ['nodes', 'configmaps', 'secrets', 'ingresses', 'jobs', 'cronjobs', 'pvcs'],
    },
    active: 'cronjobs',
  },
};

/** Nothing pinned nor open: the pages' own and the +. */
export const Bare: Story = { args: { initial: { own: ['overview'], pinned: ['overview'], open: [] }, active: 'overview' } };
