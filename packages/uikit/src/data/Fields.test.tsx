import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { columnsOf, Field, Fields } from './Fields';

/*
 * Fields laid out by what they hold: as many columns as fit, each its
 * widest field's width — none cut while there is room; one wider than half
 * of them a row of its own. A field's value on one line: Show all where it
 * is cut, opened on as many lines as it takes.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('columnsOf', () => {
  it('takes as many columns as fit, each its widest field’s width', () => {
    expect(columnsOf([80, 50, 120], 1000)).toEqual([80, 50, 120]);
    // Two a row: each column the wider of its two.
    expect(columnsOf([80, 50, 120, 60], 230)).toEqual([120, 60]);
    // Not one shorter than it is: a narrower grid, more rows.
    expect(columnsOf([80, 50, 120], 100)).toEqual([100]);
  });
});

/** Each field as wide as its data-w, the grid this wide (no layout here: said). */
function sized(width: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('uk-fields') ? width : Number(this.dataset.line ?? 0);
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: Number(this.querySelector<HTMLElement>('[data-w]')?.dataset.w ?? 0) } as DOMRect;
  });
}

describe('Fields', () => {
  it('sets its columns by its fields’ widths; one wider than half of it, a row of its own', () => {
    sized(600);
    const view = render(
      <Fields>
        <Field label="Ready">
          <span data-w="60">1/1</span>
        </Field>
        <Field label="Node">
          <span data-w="250">ip-10-0-142-17</span>
        </Field>
        <Field label="Command">
          <span data-w="400">sh -c …</span>
        </Field>
      </Fields>,
    );
    const dl = view.container.querySelector('.uk-fields') as HTMLElement;
    expect(dl.style.gridTemplateColumns).toBe('minmax(60px, 1fr) minmax(250px, 1fr)');
    expect([...dl.querySelectorAll('.uk-field')].map((f) => f.hasAttribute('data-wide'))).toEqual([false, false, true]);
  });

  it('measures its fields as laid out, not as drawn under a transform (a dialog opening, scaled)', () => {
    sized(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-fields') ? 600 : 0;
    });
    // Drawn at 90%: the grid 540 wide, each field 90% of its width.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('uk-fields')) return { width: 540 } as DOMRect;
      return { width: 0.9 * Number(this.querySelector<HTMLElement>('[data-w]')?.dataset.w ?? 0) } as DOMRect;
    });
    const view = render(
      <Fields>
        <Field label="Last state">
          <span data-w="186">Unknown · exit code 255 · 12h</span>
        </Field>
        <Field label="Command">
          <span data-w="144">sh -c sleep infinity</span>
        </Field>
      </Fields>,
    );
    expect((view.container.querySelector('.uk-fields') as HTMLElement).style.gridTemplateColumns).toBe('minmax(186px, 1fr) minmax(144px, 1fr)');
  });

  it('cuts a value wider than its line — Show all at its end; opened, Show less; one that fits, as it is', () => {
    sized(600);
    // Each field's line: the grid's whole width; each value: as wide as its data-w.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-fields') || this.classList.contains('uk-field-line') ? 600 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return Number(this.querySelector<HTMLElement>('[data-w]')?.dataset.w ?? 0);
    });
    const view = render(
      <Fields labels={{ more: 'Alles', less: 'Weniger' }}>
        <Field label="Status">
          <span data-w="80">Running</span>
        </Field>
        <Field label="Command">
          <span data-w="900">sh -c echo migrating; sleep 5; …</span>
        </Field>
      </Fields>,
    );
    const more = () => [...view.container.querySelectorAll<HTMLButtonElement>('.uk-field-more')];
    expect(more().map((b) => [b.closest('.uk-field')?.querySelector('dt')?.textContent, b.textContent])).toEqual([['Command', 'Alles']]);
    fireEvent.click(more()[0] as HTMLButtonElement);
    expect(more().map((b) => [b.textContent, b.getAttribute('aria-expanded')])).toEqual([['Weniger', 'true']]);
    expect(view.container.querySelector('.uk-field[data-open] dt')?.textContent).toBe('Command');
  });
});
