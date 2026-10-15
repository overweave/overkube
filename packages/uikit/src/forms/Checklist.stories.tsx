import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Checklist, type ChecklistGroup } from './Checklist';

export default { title: 'Forms/Checklist', component: Checklist } satisfies Meta<typeof Checklist>;

/** A pod table's columns, as the core's settings group them: kubectl's, -o wide, each addon's. */
const GROUPS: ChecklistGroup[] = [
  {
    id: 'general',
    title: 'General',
    items: ['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age'].map((label) => ({ id: label, label, on: true, locked: label === 'Name' })),
  },
  { id: 'wide', title: 'Wide', items: ['IP', 'Node', 'Nominated Node', 'Readiness Gates'].map((label) => ({ id: label, label, on: false })) },
  { id: 'metrics', title: 'metrics', note: 'addon', items: ['CPU', 'Memory', '%CPU/R', '%MEM/L'].map((label) => ({ id: label, label, on: false })) },
];
const DEFAULTS = new Set(GROUPS[0].items.map((i) => i.id));

/** Live, in a popover's frame: a group at once, each alone, filtered, back to the defaults. */
function Live() {
  const [on, setOn] = useState(new Set([...DEFAULTS, 'IP', 'Node']));
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, on: on.has(i.id) })) }));
  return (
    <div class="uk-popover uk-checklist-pop">
      <Checklist
        groups={groups}
        onChange={(ids, value) => setOn((now) => new Set(value ? [...now, ...ids] : [...now].filter((id) => !ids.includes(id))))}
        onReset={() => setOn(new Set(DEFAULTS))}
      />
    </div>
  );
}
export const Columns: StoryObj = { render: () => <Live /> };
