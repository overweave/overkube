import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { TabButton } from '../navigation/TabButton';
import { TabLinks } from '../navigation/TabLinks';
import { closeTab, moveTab, nextTab, openTab, type TabLists } from '../navigation/tabState';
import { SideRail } from './SideRail';

/*
 * A page's side as the dashboard will have it: its tabs down it (pinned,
 * open — dragged up and down, across the divider; an open one's ×, Delete),
 * a + at their end, a toggle at its head. Collapsed: their marks only; the
 * pointer resting on it (or Tab into it), it peeks over the page; pinned, the
 * page moves aside.
 */

const PAGES: Record<string, { label: string; icon?: string }> = {
  pods: { label: 'Pods', icon: 'cube' },
  deployments: { label: 'Deployments', icon: 'layers' },
  services: { label: 'Services', icon: 'network' },
  nodes: { label: 'Nodes', icon: 'server' },
  configmaps: { label: 'ConfigMaps', icon: 'file' },
  secrets: { label: 'Secrets', icon: 'key' },
  ingresses: { label: 'Ingresses', icon: 'globe' },
  jobs: { label: 'Jobs' },
  certificates: { label: 'Certificates', icon: 'cert' },
};

function Side({ initial, current: first, pinned: pinnedFirst }: { initial: TabLists; current: string; pinned: boolean }) {
  const [lists, setLists] = useState(initial);
  const [current, setCurrent] = useState(first);
  const [pinned, setPinned] = useState(pinnedFirst);
  const link = (open: boolean) => (key: string) => ({
    key,
    label: PAGES[key]?.label ?? key,
    icon: PAGES[key]?.icon,
    href: `#${key}`,
    title: PAGES[key]?.label,
    transient: open,
    closable: open,
  });
  const close = (key: string) => {
    if (key === current) setCurrent(nextTab(lists, key) ?? '');
    setLists(closeTab(lists, key));
  };
  const add = () => {
    const next = Object.keys(PAGES).find((k) => !lists.pinned?.includes(k) && !lists.open.includes(k));
    if (!next) return;
    setLists(openTab(lists, next));
    setCurrent(next);
  };
  return (
    <div style={{ display: 'flex', height: '480px', border: '1px solid var(--uk-border)' }}>
      <SideRail label="Navigation" pinned={pinned} onPin={setPinned}>
        <TabLinks
          label="Kinds"
          orientation="vertical"
          current={current}
          sections={[
            { id: 'pinned', tabs: (lists.pinned ?? []).map(link(false)), draggable: true },
            { id: 'open', tabs: lists.open.map(link(true)), draggable: true },
          ]}
          onOpen={(l, e) => {
            e.preventDefault();
            setCurrent(l.key);
          }}
          onClose={close}
          onMove={(key, section, index) => setLists(moveTab(lists, key, section, index))}
          end={<TabButton icon="plus" label="All kinds" onClick={add} />}
        />
      </SideRail>
      <main style={{ flex: 1, padding: '16px', color: 'var(--uk-muted)', fontSize: '13px' }}>
        <b style={{ color: 'var(--uk-text)' }}>{PAGES[current]?.label ?? '—'}</b> · {pinned ? 'pinned: the page beside it' : 'collapsed: rest the pointer on it, or Tab into it'}
      </main>
    </div>
  );
}

const meta = {
  title: 'Layout/SideRail',
  component: Side,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Side>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed: marks only; peeks over the page as the pointer rests on it, or as Tab comes into it. */
export const Collapsed: Story = {
  args: { initial: { pinned: ['pods', 'deployments', 'services', 'nodes'], open: ['jobs', 'certificates'] }, current: 'pods', pinned: false },
};

/** Pinned: wide, the page beside it. */
export const Pinned: Story = {
  args: { initial: { pinned: ['pods', 'deployments', 'services', 'nodes'], open: ['jobs', 'certificates'] }, current: 'jobs', pinned: true },
};
