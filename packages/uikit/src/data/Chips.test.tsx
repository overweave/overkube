import { cleanup, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chip, Chips } from './Chips';

/*
 * Chips as a user has them (user-event): what each says, how many at
 * first and the rest, a click copying one (the copying itself is
 * lib/clipboard's, taken here as done or not).
 */

const copied = vi.hoisted(() => ({ texts: [] as string[], done: true }));
vi.mock('../lib/clipboard', () => ({
  copyText: (text: string) => {
    copied.texts.push(text);
    return Promise.resolve(copied.done);
  },
}));

beforeEach(() => {
  copied.texts = [];
  copied.done = true;
});
afterEach(cleanup);

const LABELS = { 'app.kubernetes.io/name': 'web', tier: 'frontend', 'node-role.kubernetes.io/control-plane': '' };
const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${String(i).padStart(2, '0')}`, `v${i}`]));

function mount(props: Parameters<typeof Chips>[0]) {
  const view = render(<Chips {...props} />);
  const chips = () => [...view.container.querySelectorAll<HTMLElement>('.uk-chip:not(.uk-chip-more)')];
  return { ...view, chips, user: userEvent.setup(), keys: () => chips().map((c) => [...c.querySelectorAll('.uk-chip-key')].map((k) => k.textContent).join('')) };
}

describe('Chips: what they say', () => {
  it('say a dash with none', () => {
    expect(mount({}).container.textContent).toBe('—');
    cleanup();
    expect(mount({ items: {} }).container.textContent).toBe('—');
  });

  it('come by key', () => {
    expect(mount({ items: LABELS }).keys()).toEqual(['app.kubernetes.io/name', 'node-role.kubernetes.io/control-plane', 'tier']);
  });

  it('say a key, its prefix apart (quieter), and its value', () => {
    const [named, , plain] = mount({ items: LABELS }).chips();
    expect(named.querySelector('.uk-chip-prefix')?.textContent).toBe('app.kubernetes.io/');
    expect(named.querySelector('.uk-chip-name')?.textContent).toBe('name');
    expect(named.querySelector('.uk-chip-value')?.textContent).toBe('web');
    expect(plain.querySelector('.uk-chip-prefix')).toBeNull();
    expect(plain.querySelector('.uk-chip-name')?.textContent).toBe('tier');
  });

  it('say no value where it is empty', () => {
    const role = mount({ items: LABELS }).chips()[1];
    expect(role.querySelector('.uk-chip-value')).toBeNull();
  });

  it('give each in full under the pointer, and name it by what a click does', () => {
    const chip = mount({ items: LABELS }).getByRole('button', { name: 'Copy tier=frontend' });
    expect(chip.getAttribute('title')).toBe('tier=frontend');
    cleanup();
    expect(
      mount({ items: { a: 'b' }, labels: { more: (n) => `${n} more`, less: 'fewer', copy: (t) => `copy ${t}`, copied: 'ok' } }).getByRole('button', { name: 'copy a=b' }),
    ).toBeTruthy();
  });
});

describe('Chips: so many at first', () => {
  it('show eight, the rest behind +N; all of them, then back', async () => {
    const { chips, user, getByRole, queryByRole } = mount({ items: many(20) });
    expect(chips()).toHaveLength(8);
    await user.click(getByRole('button', { name: '+12' }));
    expect(chips()).toHaveLength(20);
    expect(queryByRole('button', { name: '+12' })).toBeNull();
    await user.click(getByRole('button', { name: 'Show less' }));
    expect(chips()).toHaveLength(8);
  });

  it('show as many as they are told', () => {
    expect(mount({ items: many(5), max: 3 }).chips()).toHaveLength(3);
  });

  it('show all, with nothing to show more or less, as many as at most', () => {
    const { chips, container } = mount({ items: many(8) });
    expect(chips()).toHaveLength(8);
    expect(container.querySelector('.uk-chip-more')).toBeNull();
  });

  it('name their buttons as they are given', async () => {
    const { user, getByRole } = mount({ items: many(4), max: 2, labels: { more: (n) => `${n} more`, less: 'fewer', copy: (t) => t, copied: 'ok' } });
    await user.click(getByRole('button', { name: '2 more' }));
    expect(getByRole('button', { name: 'fewer' })).toBeTruthy();
  });
});

describe('Chips: copying', () => {
  it('copies key=value on a click, and marks it copied a moment', async () => {
    const { chips, user } = mount({ items: LABELS });
    await user.click(chips()[2]);
    expect(copied.texts).toEqual(['tier=frontend']);
    await waitFor(() => expect(chips()[2].hasAttribute('data-copied')).toBe(true));
    await waitFor(() => expect(chips()[2].hasAttribute('data-copied')).toBe(false), { timeout: 2000 });
  });

  it('says it once copied, in one place for all of them (alone, a chip says it itself)', async () => {
    const { chips, user, container } = mount({ items: LABELS });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    await user.click(chips()[2]);
    await waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toBe('✓ Copied'));
    cleanup();
    const alone = render(<Chip name="a" value="b" />);
    expect(alone.container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('copies a key with no value as key=', async () => {
    const { chips, user } = mount({ items: LABELS });
    await user.click(chips()[1]);
    expect(copied.texts).toEqual(['node-role.kubernetes.io/control-plane=']);
  });

  it('marks only the last one copied', async () => {
    const { chips, user } = mount({ items: LABELS });
    await user.click(chips()[0]);
    await user.click(chips()[2]);
    await waitFor(() => expect(chips().map((c) => c.hasAttribute('data-copied'))).toEqual([false, false, true]));
  });

  it('marks nothing when it could not copy', async () => {
    copied.done = false;
    const { chips, user } = mount({ items: LABELS });
    await user.click(chips()[0]);
    await new Promise((r) => setTimeout(r, 20));
    expect(chips()[0].hasAttribute('data-copied')).toBe(false);
  });
});
