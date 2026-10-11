import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type TabSection, Tabs, type TabsProps } from './Tabs';
import { pinTab, type TabLists } from './tabState';

/*
 * The strip as a user has it (user-event): one tab stop, the arrows, the
 * bar, closing, the sections and their divider; dragging (and Alt and the
 * arrows) within a section and across it. happy-dom lays nothing out: each
 * item of the row dragged in (a tab, a divider) is taken to be 100px wide,
 * 10px from the next, in its order.
 */

const SIZE = 100;
const GAP = 10;

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const items = this.hasAttribute('data-sort-id') ? [...(this.parentElement?.querySelectorAll(':scope > [data-sort-id]') ?? [])] : [];
    const left = items.length ? items.indexOf(this) * (SIZE + GAP) : 0;
    const width = items.length ? SIZE : 5000;
    return { left, top: 0, width, height: 40, x: left, y: 0, right: left + width, bottom: 40, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Pinned: a page's own (it stays) and two the user pinned; open: two. */
const SECTIONS: TabSection[] = [
  {
    id: 'pinned',
    draggable: true,
    tabs: [
      { key: 'overview', label: 'Overview', stays: true },
      { key: 'pods', label: 'Pods', pinned: true, dot: 'error' },
      { key: 'deploys', label: 'Deploys', pinned: true },
    ],
  },
  {
    id: 'open',
    draggable: true,
    tabs: [
      { key: 'nodes', label: 'Nodes', transient: true, closable: true, pinned: false },
      { key: 'jobs', label: 'Jobs', transient: true, closable: true, pinned: false },
    ],
  },
];

function mount(props: Partial<TabsProps> = {}) {
  const told: string[] = [];
  const view = render(
    <Tabs
      label="Pages"
      sections={SECTIONS}
      active="pods"
      onSelect={(k) => told.push(`select ${k}`)}
      onClose={(k) => told.push(`close ${k}`)}
      onPin={(k, pin) => told.push(`${pin ? 'pin' : 'unpin'} ${k}`)}
      onMove={(k, section, index) => told.push(`move ${k} ${section} ${index}`)}
      end={<button type="button">add</button>}
      {...props}
    />,
  );
  const tab = (name: string) => view.getByRole('tab', { name }) as HTMLElement;
  const user = userEvent.setup();
  return {
    ...view,
    told,
    tab,
    user,
    tabs: () => view.getAllByRole('tab') as HTMLElement[],
    divider: () => view.container.querySelector('.uk-tab-sep') as HTMLElement | null,
    bar: () => view.container.querySelector('.uk-tab-bar') as HTMLElement | null,
    /** Drags a tab from its middle by so far, and lets go. */
    drag: async (name: string, by: number) => {
      const el = tab(name);
      const from = el.getBoundingClientRect().left + SIZE / 2;
      await user.pointer({ keys: '[MouseLeft>]', target: el, coords: { clientX: from, clientY: 20 } });
      await user.pointer({ coords: { clientX: from + by, clientY: 20 } });
      await user.pointer({ keys: '[/MouseLeft]' });
    },
  };
}

describe('Tabs: the strip', () => {
  it('is a tab list with one tab stop, the active tab; what follows it is outside it', () => {
    const { getByRole, tabs } = mount();
    expect(getByRole('tablist').getAttribute('aria-label')).toBe('Pages');
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(getByRole('tablist').contains(getByRole('button', { name: 'add' }))).toBe(false);
  });

  it('makes the first tab the stop when the active one is not among them', () => {
    const { tabs } = mount({ active: 'gone' });
    expect(tabs()[0].getAttribute('tabindex')).toBe('0');
    expect(tabs().every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('has a bar under the active tab, none with none active', () => {
    expect(mount().bar()).not.toBeNull();
    cleanup();
    expect(mount({ active: undefined }).bar()).toBeNull();
  });

  it('divides the sections, the divider quiet while one side has no tabs', () => {
    const { divider } = mount();
    expect(divider()?.hasAttribute('data-quiet')).toBe(false);
    expect(divider()?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const empty = mount({ sections: [SECTIONS[0], { ...SECTIONS[1], tabs: [] }] });
    expect(empty.divider()?.hasAttribute('data-quiet')).toBe(true);
  });

  it('has no divider where nothing is dragged and a side has no tabs', () => {
    expect(mount({ onMove: undefined, sections: [SECTIONS[0], { ...SECTIONS[1], tabs: [] }] }).divider()).toBeNull();
  });

  it('gives the tabs its words for their tools', () => {
    const { container } = mount({ labels: { close: (t) => `shut ${t}`, pin: (t) => `keep ${t}`, unpin: (t) => `drop ${t}` } });
    expect(container.querySelector('[data-tab="nodes"] .uk-tab-close')?.getAttribute('title')).toBe('shut nodes');
    expect(container.querySelector('[data-tab="pods"] .uk-tab-pin')?.getAttribute('title')).toBe('drop pods');
  });
});

describe('Tabs: the keyboard', () => {
  it('moves along with the arrows (round), Home and End; Enter selects', async () => {
    const { tab, tabs, user, told } = mount();
    tab('Pods').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Deploys'));
    await user.keyboard('{End}{ArrowRight}');
    expect(document.activeElement).toBe(tabs()[0]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tab('Jobs'));
    await user.keyboard('{Home}{Enter}');
    expect(told).toEqual(['select overview']);
  });

  it('gives focus, a tab closed by the keyboard, to its right neighbour, else its left', async () => {
    const { tab, user, told } = mount();
    tab('Nodes').focus();
    await user.keyboard('{Delete}');
    expect(told).toEqual(['close nodes']);
    expect(document.activeElement).toBe(tab('Jobs'));
    tab('Jobs').focus();
    await user.keyboard('{Delete}');
    expect(document.activeElement).toBe(tab('Nodes'));
  });

  it('keeps focus on a tab pinned or unpinned by P, moved to the other section', async () => {
    // A page keeping its lists, by the strip's rules.
    function Page() {
      const [lists, setLists] = useState<TabLists>({ pinned: ['pods'], open: ['nodes'] });
      const tab = (key: string, pinned: boolean) => ({ key, label: key, pinned, closable: !pinned, transient: !pinned });
      return (
        <Tabs
          label="Pages"
          active="pods"
          sections={[
            { id: 'pinned', draggable: true, tabs: lists.pinned.map((k) => tab(k, true)) },
            { id: 'open', draggable: true, tabs: lists.open.map((k) => tab(k, false)) },
          ]}
          onSelect={() => {}}
          onPin={(key, on) => setLists((l) => pinTab(l, key, on, 'pods'))}
          onMove={() => {}}
        />
      );
    }
    const view = render(<Page />);
    const user = userEvent.setup();
    const tab = (name: string) => view.getByRole('tab', { name }) as HTMLElement;
    tab('nodes').focus();
    await user.keyboard('p');
    await waitFor(() => expect(tab('nodes').querySelector('.uk-tab-pin')).not.toBeNull());
    expect(document.activeElement).toBe(tab('nodes'));
    await user.keyboard('p');
    await waitFor(() => expect(view.queryByRole('tab', { name: 'nodes' })).toBeNull());
  });

  it('gives focus to the neighbour of a tab closed by its × too (the press focused the tab), not to the page', async () => {
    const { tab, user, container, told } = mount();
    tab('Pods').focus();
    await user.click(container.querySelector('[data-tab="nodes"] .uk-tab-close') as HTMLElement);
    expect(told).toEqual(['close nodes']);
    expect(document.activeElement).toBe(tab('Jobs'));
  });
});

describe('Tabs: dragging', () => {
  it('moves a tab within its section', async () => {
    const { drag, told } = mount();
    // Pods (middle 160) to 290: past Deploys' middle (270), not the divider's (380).
    await drag('Pods', 130);
    await waitFor(() => expect(told).toEqual(['move pods pinned 2']));
  });

  it('pins a tab dragged into the pinned', async () => {
    const { drag, told } = mount();
    // Nodes (middle 490) to 240: past the divider and Deploys, not Pods.
    await drag('Nodes', -250);
    await waitFor(() => expect(told).toEqual(['move nodes pinned 2']));
  });

  it('unpins a tab dragged into the open', async () => {
    const { drag, told } = mount();
    // Deploys (middle 270) to 430: past the divider's middle (380), not Nodes' (490).
    await drag('Deploys', 160);
    await waitFor(() => expect(told).toEqual(['move deploys open 0']));
  });

  it('keeps one that stays in its section, however far it is dragged', async () => {
    const { drag, told } = mount();
    await drag('Overview', 900);
    await waitFor(() => expect(told).toEqual(['move overview pinned 2']));
  });

  it('selects nothing by the click a drag ends with', async () => {
    const { drag, told } = mount();
    await drag('Jobs', -120);
    await waitFor(() => expect(told).toEqual(['move jobs open 0']));
  });

  it('cannot take hold of the divider', () => {
    const { divider, tab } = mount();
    expect(divider()?.hasAttribute('data-sort-id')).toBe(true);
    expect(divider()?.hasAttribute('data-sort-handle')).toBe(false);
    expect(tab('Pods').getAttribute('data-sort-handle')).toBe('pods');
  });

  it('drags nothing with nobody to tell, nor in a section that is not draggable', async () => {
    const quiet = mount({ onMove: undefined });
    expect(quiet.tab('Pods').hasAttribute('data-sort-handle')).toBe(false);
    cleanup();
    const fixed = mount({ sections: [{ ...SECTIONS[0], draggable: false }, SECTIONS[1]] });
    expect(fixed.tab('Pods').hasAttribute('data-sort-handle')).toBe(false);
    expect(fixed.tab('Nodes').hasAttribute('data-sort-handle')).toBe(true);
    // The first draggable section has no divider before it.
    expect(fixed.divider()?.hasAttribute('data-sort-id')).toBe(false);
  });

  it('shows the bar at once under the tab dropped, not sliding there', async () => {
    const { drag, bar, told } = mount();
    await drag('Pods', 130);
    await waitFor(() => expect(told).toHaveLength(1));
    await waitFor(() => expect(bar()?.hasAttribute('data-instant')).toBe(true));
    await waitFor(() => expect(bar()?.hasAttribute('data-instant')).toBe(false));
  });
});

describe('Tabs: Alt and the arrows', () => {
  it('move the focused tab a place, past the divider too (unpinning it)', async () => {
    const { tab, user, told } = mount();
    tab('Deploys').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(told).toEqual(['move deploys open 0']));
    // Not a move of focus.
    expect(document.activeElement).toBe(tab('Deploys'));
  });

  it('move one that stays only within its section', async () => {
    const { tab, user, told } = mount({ sections: [{ ...SECTIONS[0], tabs: [SECTIONS[0].tabs[1], SECTIONS[0].tabs[2], SECTIONS[0].tabs[0]] }, SECTIONS[1]] });
    tab('Overview').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await new Promise((r) => setTimeout(r, 250));
    expect(told).toEqual([]);
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await waitFor(() => expect(told).toEqual(['move overview pinned 1']));
  });
});

describe('Tabs: a section dragged into while empty', () => {
  it('takes a tab dropped past its divider', async () => {
    const { drag, told } = mount({ sections: [SECTIONS[0], { ...SECTIONS[1], tabs: [] }] });
    await drag('Deploys', 160);
    await waitFor(() => expect(told).toEqual(['move deploys open 0']));
  });
});

it('fires nothing on a press that does not move', () => {
  const { tab, told } = mount();
  fireEvent.pointerDown(tab('Pods'), { button: 0, clientX: 160 });
  fireEvent.pointerUp(window);
  expect(told).toEqual([]);
});
