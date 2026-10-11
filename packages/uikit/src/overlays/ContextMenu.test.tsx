import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, type ContextMenuProps } from './ContextMenu';

/* The menu as a user has it: its items in groups, the keyboard as a system's, a choice done and closed, focus back. */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(props: Partial<ContextMenuProps> = {}) {
  const told: string[] = [];
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const item = (key: string, extra = {}) => ({ key, label: key[0].toUpperCase() + key.slice(1), onSelect: () => told.push(key), ...extra });
  const view = render(
    <ContextMenu
      at={{ x: 10, y: 10 }}
      label="Pods"
      title="Pods"
      groups={[
        { key: 'a', items: [item('unpin', { icon: 'pin' }), item('copy', { keys: 'mod+c' }), item('refresh', { disabled: true })] },
        { key: 'b', items: [item('close', { danger: true })] },
        { key: 'none', items: [] },
      ]}
      onClose={() => told.push('closed')}
      {...props}
    />,
  );
  const menu = view.getByRole('menu', { name: 'Pods' });
  const items = () => view.getAllByRole('menuitem') as HTMLElement[];
  const named = (name: string) => view.getByRole('menuitem', { name }) as HTMLElement;
  return { ...view, told, menu, items, named, opener, user: userEvent.setup() };
}

describe('ContextMenu', () => {
  it('is a menu of its items in groups, a line between them (none for an empty group); one not to be had now says so', () => {
    const { items, container, named } = mount();
    expect(items().map((i) => i.querySelector('.uk-menu-label')?.textContent)).toEqual(['Unpin', 'Copy', 'Refresh', 'Close']);
    expect(named('Copy').querySelector('.uk-menu-keys')?.textContent).toMatch(/C$/);
    expect(container.ownerDocument.querySelectorAll('hr')).toHaveLength(1);
    expect(named('Refresh').getAttribute('aria-disabled')).toBe('true');
    expect(named('Close').hasAttribute('data-danger')).toBe(true);
  });

  it('opened by the pointer, takes focus itself; the arrows from there, round, past one not to be had', async () => {
    const { menu, user, named } = mount();
    expect(document.activeElement).toBe(menu);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(named('Unpin'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(named('Close'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(named('Unpin'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(named('Close'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(named('Copy'));
  });

  it('opened by the keyboard, its first item taken at once; a letter takes the next it starts', async () => {
    const { user, named } = mount({ keyboard: true });
    expect(document.activeElement).toBe(named('Unpin'));
    await user.keyboard('c');
    expect(document.activeElement).toBe(named('Copy'));
    await user.keyboard('c');
    expect(document.activeElement).toBe(named('Close'));
  });

  it('chooses by Enter: done, closed, focus back where it was', async () => {
    const { user, told, opener } = mount({ keyboard: true });
    await user.keyboard('{Enter}');
    await waitFor(() => expect(told).toEqual(['closed', 'unpin']));
    expect(document.activeElement).toBe(opener);
  });

  it('chooses by a click; nothing for one not to be had', async () => {
    const { user, told, named } = mount();
    await user.click(named('Refresh'));
    await new Promise((r) => setTimeout(r, 150));
    expect(told).toEqual([]);
    await user.click(named('Close'));
    await waitFor(() => expect(told).toEqual(['closed', 'close']));
  });

  it('closes by Escape (focus back), and by a press outside it', async () => {
    const first = mount();
    await first.user.keyboard('{Escape}');
    expect(first.told).toEqual(['closed']);
    expect(document.activeElement).toBe(first.opener);
    cleanup();
    const second = mount();
    await new Promise((r) => setTimeout(r));
    fireEvent.pointerDown(document.body);
    expect(second.told).toEqual(['closed']);
  });

  it('opens to the left and up where it does not fit, growing from that corner', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(150);
    const { menu } = mount({ at: { x: window.innerWidth - 50, y: window.innerHeight - 40 } });
    expect(menu.style.left).toBe(`${window.innerWidth - 250}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 190}px`);
    expect(menu.style.getPropertyValue('--uk-menu-origin')).toBe('200px 150px');
  });

  it('opened under an element that has no room below, opens up from its top (not over it)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(150);
    const bottom = window.innerHeight - 40;
    const { menu } = mount({ at: { x: 10, y: bottom, above: bottom - 30 } });
    expect(menu.style.top).toBe(`${bottom - 30 - 150}px`);
  });

  it('says an item’s keys (ARIA), and no name when it is given none', () => {
    expect(mount().named('Copy').getAttribute('aria-keyshortcuts')).toMatch(/^(Control|Meta)\+C$/);
    cleanup();
    render(<ContextMenu at={{ x: 0, y: 0 }} groups={[]} onClose={() => {}} />);
    expect(document.querySelector('.uk-menu')?.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps Space on the menu itself from the page (no scroll to close it)', () => {
    const { menu } = mount();
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    menu.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
  });

  it('closed while a choice blinks: done, focus left where it went', async () => {
    const { user, told, named, unmount } = mount();
    await user.click(named('Copy'));
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    elsewhere.focus();
    unmount();
    expect(told).toContain('copy');
    await new Promise((r) => setTimeout(r, 150));
    expect(document.activeElement).toBe(elsewhere);
  });
});
