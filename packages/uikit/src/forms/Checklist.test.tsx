import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Checklist, type ChecklistGroup } from './Checklist';

/* Things turned on and off, grouped: a group at once (its check: all, some, none), each alone, one locked; filtered; how many on; back to the defaults. */

afterEach(cleanup);

const GROUPS: ChecklistGroup[] = [
  {
    id: 'general',
    title: 'General',
    note: 'kubectl',
    items: [
      { id: 'name', label: 'Name', on: true, locked: true },
      { id: 'ready', label: 'Ready', on: true },
    ],
  },
  {
    id: 'wide',
    title: 'Wide',
    items: [
      { id: 'ip', label: 'IP', on: true, hint: '.status.podIP' },
      { id: 'node', label: 'Node', on: false, hint: '.spec.nodeName' },
    ],
  },
];

function mount(onReset?: () => void) {
  const told: [string[], boolean][] = [];
  const view = render(<Checklist groups={GROUPS} onChange={(ids, on) => told.push([ids, on])} onReset={onReset} />);
  const heads = () => [...view.container.querySelectorAll<HTMLButtonElement>('.uk-checklist-head')];
  const items = () => [...view.container.querySelectorAll<HTMLButtonElement>('.uk-checklist-item')];
  return { ...view, told, heads, items };
}

describe('Checklist', () => {
  it('says each group as all of it on, some, none (its count beside it), each item on or off, one locked', () => {
    const { heads, items } = mount();
    expect(heads().map((h) => [h.textContent, h.getAttribute('aria-pressed')])).toEqual([
      ['General · kubectl2/2', 'true'],
      ['Wide1/2', 'mixed'],
    ]);
    expect(items().map((i) => [i.textContent, i.getAttribute('aria-pressed'), i.getAttribute('aria-disabled')])).toEqual([
      ['Name', 'true', 'true'],
      ['Ready', 'true', null],
      ['IP', 'true', null],
      ['Node', 'false', null],
    ]);
  });

  it('turns a group on at once (some of it on: all), off at once (all on: all but the locked); an item alone', () => {
    const { heads, items, told } = mount();
    fireEvent.click(heads()[1]);
    fireEvent.click(heads()[0]);
    fireEvent.click(items()[3]);
    expect(told).toEqual([
      [['ip', 'node'], true],
      [['ready'], false],
      [['node'], true],
    ]);
  });

  it('turns only what the filter shows of a group at once; a locked item, reached, does nothing', () => {
    const { container, heads, items, told } = mount();
    fireEvent.input(container.querySelector('input') as HTMLInputElement, { target: { value: 'node' } });
    // Only Wide's Node shown: the group at once is Node alone (IP not shown, left as it is).
    fireEvent.click(heads()[0]);
    expect(told).toEqual([[['node'], true]]);
    fireEvent.input(container.querySelector('input') as HTMLInputElement, { target: { value: '' } });
    fireEvent.click(items()[0]);
    expect(told.length).toBe(1);
  });

  it('says an item’s hint in its tip (a locked one’s, so)', () => {
    const { items } = mount();
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(items()[2]);
    expect(document.querySelector('.uk-tip')?.textContent).toBe('.status.podIP');
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(items()[0]);
    expect(document.querySelector('.uk-tip')?.textContent).toBe('Always shown');
  });

  it('filters by a label or a hint; nothing matching, said so; how many on of all; back to the defaults', () => {
    const resets: number[] = [];
    const { container, items, getByText } = mount(() => resets.push(1));
    const filter = container.querySelector('input') as HTMLInputElement;
    fireEvent.input(filter, { target: { value: 'nodeName' } });
    expect(items().map((i) => i.textContent)).toEqual(['Node']);
    fireEvent.input(filter, { target: { value: 'zzz' } });
    expect(container.querySelector('.uk-checklist-body')?.textContent).toBe('Nothing matches');
    expect(container.querySelector('.uk-checklist-foot span')?.textContent).toBe('3 of 4 shown');
    fireEvent.click(getByText('Reset to defaults'));
    expect(resets).toEqual([1]);
  });
});
