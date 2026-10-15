import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tab, type TabItem, type TabProps } from './Tab';

/** Its tip's words: the pointer over it a while. */
function tipOf(el: Element | null | undefined) {
  vi.useFakeTimers();
  fireEvent.pointerEnter(el as Element, { pointerType: 'mouse' });
  act(() => void vi.advanceTimersByTime(400));
  vi.useRealTimers();
  const said = document.querySelector('.uk-tip')?.textContent;
  fireEvent.keyDown(document, { key: 'Escape' });
  return said;
}

/*
 * One tab as a user has it (user-event): what it says (role, name, ARIA
 * states), what it shows (its ×, its dot), what it does by the
 * pointer and the keyboard.
 */

afterEach(cleanup);

const PAGE: TabItem = { key: 'page/overview', label: 'Overview', title: 'Overview' };
const PINNED: TabItem = { key: 'kind/v1/Pod', label: 'Pods', title: 'Pods (v1/Pod)' };
const OPEN: TabItem = { key: 'kind/v1/Node', label: 'Nodes', title: 'Nodes (v1/Node)', transient: true, closable: true };

function mount(tab: TabItem, props: Partial<TabProps> = {}) {
  const told: string[] = [];
  const view = render(
    <div role="tablist">
      <Tab tab={tab} onSelect={(k) => told.push(`select ${k}`)} onClose={(k) => told.push(`close ${k}`)} {...props} />
    </div>,
  );
  const el = view.getByRole('tab');
  return {
    ...view,
    told,
    el,
    user: userEvent.setup(),
    close: () => el.querySelector('.uk-tab-close') as HTMLElement | null,
  };
}

describe('Tab: what it says', () => {
  it('is a tab named by its label, selected or not, a stop or not', () => {
    const { el } = mount(PAGE);
    expect(el.textContent).toBe('Overview');
    expect(el.getAttribute('aria-selected')).toBe('false');
    expect(el.getAttribute('tabindex')).toBe('-1');
    cleanup();
    const on = mount(PAGE, { selected: true }).el;
    expect(on.getAttribute('aria-selected')).toBe('true');
    expect(on.getAttribute('tabindex')).toBe('0');
  });

  it('marks itself by its key, and says it is not kept when open', () => {
    const { el } = mount(OPEN);
    expect(el.getAttribute('data-tab')).toBe('kind/v1/Node');
    expect(el.hasAttribute('data-transient')).toBe(true);
    expect(tipOf(el)).toBe('Nodes (v1/Node)');
  });

  it('says the panel it controls, selected only', () => {
    expect(mount(PAGE, { selected: true, panel: 'main' }).el.getAttribute('aria-controls')).toBe('main');
    cleanup();
    expect(mount(PAGE, { panel: 'main' }).el.hasAttribute('aria-controls')).toBe(false);
  });

  it('says its keys: its own, and those it is given', () => {
    expect(mount(OPEN).el.getAttribute('aria-keyshortcuts')).toBe('Delete');
    cleanup();
    expect(mount(PINNED, { 'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight' }).el.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowLeft Alt+ArrowRight');
    cleanup();
    expect(mount(PAGE).el.hasAttribute('aria-keyshortcuts')).toBe(false);
  });
});

describe('Tab: its dot', () => {
  it('shows a dot for warn and error, none for ok', () => {
    expect(
      mount({ ...PINNED, dot: 'error' })
        .el.querySelector('.uk-dot')
        ?.getAttribute('data-level'),
    ).toBe('error');
    cleanup();
    expect(mount({ ...PINNED, dot: 'ok' }).el.querySelector('.uk-dot')).toBeNull();
  });

  it('says the dot where it is given words for it, else hides it from a reader', () => {
    const quiet = mount({ ...PINNED, dot: 'warn' }).el.querySelector('.uk-dot');
    expect(quiet?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const { getByRole } = mount({ ...PINNED, dot: 'warn' }, { labels: { close: (t) => t, dot: (l) => `level ${l}` } });
    expect(getByRole('img', { name: 'level warn' })).toBeTruthy();
  });
});

describe('Tab: its ×', () => {
  it('a page’s own, a pinned one have none', () => {
    const { close, el } = mount(PAGE);
    expect(close()).toBeNull();
    expect(el.hasAttribute('data-tool')).toBe(false);
    cleanup();
    expect(mount(PINNED).close()).toBeNull();
    expect(el.hasAttribute('data-tool')).toBe(false);
  });

  it('an open one has its ×, in room kept for it, which closes it (not selecting it)', async () => {
    const { close, el, user, told } = mount(OPEN);
    expect(el.getAttribute('data-tool')).toBe('close');
    expect(tipOf(close()?.closest('.uk-tip-at'))).toBe('Close Nodes (v1/Node)');
    await user.click(close() as HTMLElement);
    expect(told).toEqual(['close kind/v1/Node']);
  });

  it('has no × with nobody to tell', () => {
    expect(mount(OPEN, { onClose: undefined }).close()).toBeNull();
  });

  it('names its tools by its key when it has no title', () => {
    expect(
      tipOf(
        mount({ ...OPEN, title: undefined })
          .close()
          ?.closest('.uk-tip-at'),
      ),
    ).toBe('Close kind/v1/Node');
  });
});

describe('Tab: what it does', () => {
  it('is selected by a click, Enter or Space', async () => {
    const { el, user, told } = mount(PAGE, { stop: true });
    await user.click(el);
    el.focus();
    await user.keyboard('{Enter} ');
    expect(told).toEqual(['select page/overview', 'select page/overview', 'select page/overview']);
  });

  it('closes, open, by Delete, Backspace or a middle click', () => {
    const { el, told } = mount(OPEN);
    fireEvent.keyDown(el, { key: 'Delete' });
    fireEvent.keyDown(el, { key: 'Backspace' });
    fireEvent(el, new MouseEvent('auxclick', { button: 1, bubbles: true }));
    fireEvent(el, new MouseEvent('auxclick', { button: 2, bubbles: true }));
    expect(told).toEqual(['close kind/v1/Node', 'close kind/v1/Node', 'close kind/v1/Node']);
  });

  it('does not close, pinned or a page’s own', () => {
    const { el, told } = mount(PINNED);
    fireEvent.keyDown(el, { key: 'Delete' });
    fireEvent(el, new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(told).toEqual([]);
  });

  it('lets a key it is given go first: one it takes is not its own', () => {
    const seen: string[] = [];
    const { el, told } = mount(OPEN, {
      onKeyDown: (e) => {
        seen.push(e.key);
        if (e.key === 'Delete') e.preventDefault();
      },
    });
    fireEvent.keyDown(el, { key: 'Delete' });
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(seen).toEqual(['Delete', 'Enter']);
    expect(told).toEqual(['select kind/v1/Node']);
  });
});
