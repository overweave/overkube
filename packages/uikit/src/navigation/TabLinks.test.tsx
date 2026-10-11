import { cleanup, fireEvent, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { type TabLink, TabLinks, type TabLinksProps } from './TabLinks';

/* Tabs that are links, as a user has them: their tools are their own (not the link followed), Delete closes, focus goes on. */

afterEach(cleanup);

const PINNED: TabLink[] = [{ key: 'pods', label: 'Pods', href: '#/pods', pinned: true }];
const OPEN: TabLink[] = [
  { key: 'nodes', label: 'Nodes', href: '#/nodes', closable: true, transient: true },
  { key: 'jobs', label: 'Jobs', href: '#/jobs', closable: true, transient: true },
];

function mount(props: Partial<TabLinksProps> = {}) {
  const told: string[] = [];
  const view = render(
    <TabLinks
      label="Kinds"
      sections={[
        { id: 'pinned', tabs: PINNED, draggable: true },
        { id: 'open', tabs: OPEN, draggable: true },
      ]}
      current="nodes"
      onOpen={(link) => told.push(`open ${link.key}`)}
      onClose={(k) => told.push(`close ${k}`)}
      onPin={(k, pin) => told.push(`${pin ? 'pin' : 'unpin'} ${k}`)}
      onMove={(k, section, index) => told.push(`move ${k} ${section} ${index}`)}
      {...props}
    />,
  );
  const link = (name: string) => view.getByRole('link', { name }) as HTMLAnchorElement;
  return { ...view, told, link, user: userEvent.setup() };
}

describe('TabLinks', () => {
  it('are links in a nav, the one the page is at marked; an open one says Delete closes it', () => {
    const { getByRole, link } = mount();
    expect(getByRole('navigation', { name: 'Kinds' })).toBeTruthy();
    expect(link('Nodes').getAttribute('aria-current')).toBe('page');
    expect(link('Nodes').getAttribute('href')).toBe('#/nodes');
    expect(link('Nodes').getAttribute('aria-keyshortcuts')).toBe('Delete Alt+ArrowLeft Alt+ArrowRight');
    expect(link('Pods').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowLeft Alt+ArrowRight');
  });

  it('closes by its ×, unpins by its pin — neither following the link', () => {
    const { link, told } = mount();
    const close = new MouseEvent('click', { bubbles: true, cancelable: true });
    (link('Jobs').querySelector('.uk-tab-close') as HTMLElement).dispatchEvent(close);
    const unpin = new MouseEvent('click', { bubbles: true, cancelable: true });
    (link('Pods').querySelector('.uk-tab-pin') as HTMLElement).dispatchEvent(unpin);
    expect([close.defaultPrevented, unpin.defaultPrevented]).toEqual([true, true]);
    expect(told).toEqual(['close jobs', 'unpin pods']);
  });

  it('closes the focused one by Delete, focus going to its neighbour (the right one, else the left)', async () => {
    const { link, user, told, rerender } = mount();
    link('Nodes').focus();
    await user.keyboard('{Delete}');
    expect(told).toEqual(['close nodes']);
    expect(document.activeElement).toBe(link('Jobs'));
    rerender(<TabLinks label="Kinds" sections={[{ id: 'open', tabs: OPEN }]} onClose={() => {}} />);
    link('Jobs').focus();
    await user.keyboard('{Delete}');
    expect(document.activeElement).toBe(link('Nodes'));
  });

  it('has no tools with nobody to tell, and is followed as a link', () => {
    const { link, told } = mount({ onClose: undefined, onPin: undefined });
    expect([link('Jobs').querySelector('.uk-tab-close'), link('Pods').querySelector('.uk-tab-pin')]).toEqual([null, null]);
    fireEvent.click(link('Jobs'));
    expect(told).toEqual(['open jobs']);
  });

  it('keeps the browser’s own drag of a link from taking the pointer away', () => {
    const { link } = mount();
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    link('Pods').dispatchEvent(start);
    expect(start.defaultPrevented).toBe(true);
  });
});
