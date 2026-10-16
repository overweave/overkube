import { cleanup, fireEvent, render } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupPicker, type PickGroup } from './GroupPicker';

/*
 * Picking in groups: none picked, all of them; from all, a click picks only
 * that one (or that group); a group some of it picked, mixed; all picked
 * again, all (none picked).
 */

afterEach(cleanup);

const GROUPS: PickGroup[] = [
  {
    key: 'a',
    label: 'web-a',
    items: [
      { key: 'a/app', label: 'app' },
      { key: 'a/envoy', label: 'envoy', tag: 'sidecar' },
    ],
  },
  { key: 'b', label: 'web-b', items: [{ key: 'b/app', label: 'app' }] },
];
const LABELS = { label: 'Containers', all: 'All containers', allShort: 'All', some: (n: number, of: number) => `${n} of ${of}`, search: 'Find' };

function mount() {
  const said: string[][] = [];
  function Picker() {
    const [picked, pick] = useState<string[]>([]);
    return (
      <GroupPicker
        groups={GROUPS}
        picked={picked}
        onPick={(keys) => {
          said.push(keys);
          pick(keys);
        }}
        labels={LABELS}
      />
    );
  }
  const view = render(<Picker />);
  fireEvent.click(view.container.querySelector('.uk-gp-trigger') as HTMLElement);
  const row = (text: string, head = false) =>
    [...document.querySelectorAll<HTMLButtonElement>(`.uk-gp-row${head ? '[data-head]' : '[data-child]'}`)].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
  const summary = () => view.container.querySelector('.uk-ms-summary')?.textContent;
  return { said, row, summary };
}

describe('picking in groups', () => {
  it('picks only that one from all of them; a group some of it picked, mixed; all of them again, all', () => {
    const { said, row, summary } = mount();
    expect(summary()).toBe('All');
    fireEvent.click(row('envoy'));
    expect([said.at(-1), summary(), row('web-a', true).getAttribute('aria-pressed')]).toEqual([['a/envoy'], 'envoy', 'mixed']);
    fireEvent.click(row('web-b', true));
    expect([said.at(-1), summary()]).toEqual([['a/envoy', 'b/app'], '2 of 3']);
    fireEvent.click(row('web-a', true));
    expect([said.at(-1), summary()]).toEqual([[], 'All']);
  });
});
