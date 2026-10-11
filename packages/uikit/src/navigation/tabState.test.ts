import { describe, expect, it } from 'vitest';
import { closeTab, moveTab, nextTab, openTab, pinTab, type TabLists } from './tabState';

/* The strip's rules, apart from drawing it: lists in, new lists out. */

const TABS: TabLists = { pinned: ['main', 'pods'], open: ['nodes', 'jobs'] };

describe('tabState', () => {
  it('pins a tab last of the pinned, whether it was open or in neither', () => {
    expect(pinTab(TABS, 'nodes', true)).toEqual({ pinned: ['main', 'pods', 'nodes'], open: ['jobs'] });
    expect(pinTab(TABS, 'secrets', true)).toEqual({ pinned: ['main', 'pods', 'secrets'], open: ['nodes', 'jobs'] });
  });

  it('unpins a tab: gone, unless it is the one shown — then first of the open', () => {
    expect(pinTab(TABS, 'pods', false, 'main')).toEqual({ pinned: ['main'], open: ['nodes', 'jobs'] });
    expect(pinTab(TABS, 'pods', false, 'pods')).toEqual({ pinned: ['main'], open: ['pods', 'nodes', 'jobs'] });
    expect(pinTab(TABS, 'pods', false)).toEqual({ pinned: ['main'], open: ['nodes', 'jobs'] });
  });

  it('moves a tab within its section, or into the other (pinning, unpinning it)', () => {
    expect(moveTab(TABS, 'pods', 'pinned', 0)).toEqual({ pinned: ['pods', 'main'], open: ['nodes', 'jobs'] });
    expect(moveTab(TABS, 'jobs', 'pinned', 1)).toEqual({ pinned: ['main', 'jobs', 'pods'], open: ['nodes'] });
    expect(moveTab(TABS, 'pods', 'open', 2)).toEqual({ pinned: ['main'], open: ['nodes', 'jobs', 'pods'] });
  });

  it('opens one in neither last of the open, and leaves a tab already there', () => {
    expect(openTab(TABS, 'secrets')).toEqual({ pinned: ['main', 'pods'], open: ['nodes', 'jobs', 'secrets'] });
    expect(openTab(TABS, 'pods')).toBe(TABS);
    expect(openTab(TABS, 'jobs')).toBe(TABS);
  });

  it('closes an open one; a pinned one stays', () => {
    expect(closeTab(TABS, 'nodes')).toEqual({ pinned: ['main', 'pods'], open: ['jobs'] });
    expect(closeTab(TABS, 'pods')).toEqual(TABS);
  });

  it('shows next, a tab closed, its right neighbour across the sections, else its left', () => {
    expect(nextTab(TABS, 'pods')).toBe('nodes');
    expect(nextTab(TABS, 'jobs')).toBe('nodes');
    expect(nextTab({ pinned: [], open: ['only'] }, 'only')).toBeUndefined();
    expect(nextTab(TABS, 'gone')).toBeUndefined();
  });

  it('changes none of what it is given', () => {
    const given = { pinned: [...TABS.pinned], open: [...TABS.open] };
    pinTab(given, 'nodes', true);
    moveTab(given, 'pods', 'open', 0);
    closeTab(given, 'jobs');
    expect(given).toEqual(TABS);
  });
});
