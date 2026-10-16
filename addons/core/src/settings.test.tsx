import { defineAddon } from '@overkube/sdk';
import { cleanup, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { MODAL_OUT_MS } from '@overkube/uikit';
import { fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import core from './index.tsx';

/*
 * The settings: reached by the gear at the header's end (off the
 * navigation); each choice the user's (a patch); what the user changed,
 * listed, each taken back or all.
 */

afterEach(cleanup);

const nord = defineAddon({ id: 'nord', title: 'Nord', setup: ({ contributor }) => void contributor.add('Theme', 'nord', { title: 'Nord', dark: { accent: '#88c0d0' } }) });

const world = () => {
  const w = kubeWorld();
  w.addon(core);
  w.addon(nord);
  return w;
};
const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === name || b.getAttribute('aria-label') === name) as HTMLButtonElement;

/** A button by what it says (not its name: a dialog's × is named too). */
const said = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text) as HTMLButtonElement;

describe('the settings', () => {
  it('opens by the gear, not a tab; a theme, a mode, the navigation chosen are the user’s', () => {
    const w = world();
    const page = renderPage(w, '/');
    fireEvent.click(button(page.container, 'Settings'));
    expect(page.path).toBe('/settings');
    expect(page.links('Navigation')).not.toContain('Settings');
    fireEvent.click(button(page.container, 'Nord'));
    fireEvent.click(button(page.container, 'Light'));
    fireEvent.click(button(page.container, 'Side'));
    fireEvent.click(button(page.container, 'Large'));
    expect([w.registry.get('Appearance', 'default')?.spec, w.registry.get('NavView', 'default')?.spec]).toEqual([
      { theme: 'nord', mode: 'light', size: 'large' },
      { mode: 'side' },
    ]);
  });

  it('lists what the user changed, each taken back, or all', () => {
    const w = world();
    w.user.patch('Appearance', 'default', { theme: 'nord' });
    w.user.patch('NavView', 'default', { mode: 'side' });
    const page = renderPage(w, '/settings');
    fireEvent.click([...page.container.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Your changes')) as HTMLAnchorElement);
    const rows = () => [...page.container.querySelectorAll('.uk-board-facts dt')].map((d) => d.textContent);
    expect(rows()).toEqual(['Appearance default', 'NavView default']);
    fireEvent.click(button(page.container, 'Reset'));
    expect([rows(), w.registry.get('Appearance', 'default')?.spec.theme]).toEqual([['NavView default'], 'default']);
    fireEvent.click(button(page.container, 'Reset everything'));
    expect(page.container.textContent).toContain('Nothing changed');
  });

  it('makes one’s own theme by its knobs, worn as they turn; taken back as it was if not kept', () => {
    vi.useFakeTimers();
    const w = world();
    w.user.patch('Appearance', 'default', { theme: 'nord' });
    const page = renderPage(w, '/settings');
    const theme = () => [w.registry.get('Appearance', 'default')?.spec.theme, w.registry.get('Theme', 'custom')?.spec.dark?.bg];
    // Gone as a dialog goes (its way out first).
    const gone = () => page.act(() => vi.advanceTimersByTime(MODAL_OUT_MS));
    expect(button(page.container, 'Your own')).toBeUndefined();
    fireEvent.click(button(page.container, 'Make your own…'));
    fireEvent.input(page.container.ownerDocument.querySelector('input[aria-label="Darkness"]') as HTMLInputElement, { target: { value: '20' } });
    expect(theme()).toEqual(['custom', 'hsl(0 0% 20%)']);
    fireEvent.click(said(page.container.ownerDocument.body, 'Cancel'));
    gone();
    expect(theme()).toEqual(['nord', undefined]);
    fireEvent.click(button(page.container, 'Make your own…'));
    fireEvent.click(said(page.container.ownerDocument.body, 'Keep'));
    gone();
    expect(theme()).toEqual(['custom', 'hsl(0 0% 10%)']);
    expect(button(page.container, 'Your own')).toBeDefined();
    vi.useRealTimers();
  });

  it('lists the addons the page runs, how each is doing; one failing, started again', () => {
    const w = world();
    w.addons.statuses.value = w.addons.statuses.value.map((s) => (s.id === 'nord' ? { ...s, state: 'crashloop', error: 'boom' } : s));
    const page = renderPage(w, '/settings');
    fireEvent.click([...page.container.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Addons')) as HTMLAnchorElement);
    const heads = () => [...page.container.querySelectorAll('.uk-accordion-head')].map((h) => h.textContent);
    expect(heads()).toEqual(['Corecore · core', 'Nordnord · addon']);
    fireEvent.click(said(page.container, 'Restart'));
    expect([w.addons.statuses.value.find((s) => s.id === 'nord')?.state, said(page.container, 'Restart')]).toEqual(['running', undefined]);
  });

  it('says what overkube is, and the libraries it runs with their licenses', () => {
    const page = renderPage(world(), '/settings');
    fireEvent.click([...page.container.querySelectorAll('a')].find((a) => a.textContent === 'About') as HTMLAnchorElement);
    const text = page.container.textContent ?? '';
    expect([text.includes('MIT'), text.includes('preact'), text.includes('Libraries')]).toEqual([true, true, true]);
  });
});
