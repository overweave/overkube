import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogBody, CatalogBox, CatalogHeading, CatalogPane, CatalogRow, CatalogSearch, CatalogSection, CatalogTop } from './Catalog';

/* A catalog as a user has it: its filter typed into; its sections (the chosen one current, an empty one quieter, each its count); its rows (links, their pins turned); the arrows from the filter down the rows and round. */

afterEach(cleanup);

function Picker({ typed, pinned }: { typed: string[]; pinned: boolean[] }) {
  return (
    <CatalogBox>
      <CatalogTop>
        <CatalogSearch query="" onQuery={(q) => typed.push(q)} placeholder="Search kinds" />
      </CatalogTop>
      <CatalogBody
        label="Sections"
        side={
          <>
            <CatalogSection icon="cube" count={2} chosen>
              Workloads
            </CatalogSection>
            <CatalogSection count={0}>Empty</CatalogSection>
          </>
        }
      >
        <CatalogPane>
          <CatalogHeading>apps</CatalogHeading>
          <CatalogRow link={{ href: '#/a' }} icon="cube" extra="3" pin={{ on: false, label: 'Pin Pods', onToggle: (on) => pinned.push(on) }}>
            Pods
          </CatalogRow>
          <CatalogRow link={{ href: '#/b' }} muted>
            Jobs
          </CatalogRow>
        </CatalogPane>
      </CatalogBody>
    </CatalogBox>
  );
}

describe('Catalog', () => {
  it('has its filter (named by its placeholder, typed into), its sections (the chosen one current, an empty one quieter, their counts), its rows', () => {
    const typed: string[] = [];
    const { container, getByLabelText } = render(<Picker typed={typed} pinned={[]} />);
    fireEvent.input(getByLabelText('Search kinds'), { target: { value: 'po' } });
    expect(typed).toEqual(['po']);
    expect([...container.querySelectorAll('.uk-catalog-section')].map((s) => [s.textContent, s.getAttribute('aria-current'), s.hasAttribute('data-empty')])).toEqual([
      ['Workloads2', 'true', false],
      ['Empty0', 'false', true],
    ]);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Sections');
    expect([...container.querySelectorAll('.uk-catalog-row')].map((r) => [r.querySelector('a')?.getAttribute('href'), r.textContent, r.hasAttribute('data-muted')])).toEqual([
      ['#/a', 'Pods3', false],
      ['#/b', 'Jobs', true],
    ]);
  });

  it('turns a row’s pin (pressed or not, named)', () => {
    const pinned: boolean[] = [];
    const { getByLabelText } = render(<Picker typed={[]} pinned={pinned} />);
    const pin = getByLabelText('Pin Pods');
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(pinned).toEqual([true]);
  });

  it('goes down from the filter to the first row, then row to row, round at the ends', () => {
    const { getByLabelText, getByText } = render(<Picker typed={[]} pinned={[]} />);
    const [pods, jobs] = [getByText('Pods').closest('a'), getByText('Jobs').closest('a')] as HTMLElement[];
    fireEvent.keyDown(getByLabelText('Search kinds'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(pods);
    fireEvent.keyDown(pods as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(jobs);
    fireEvent.keyDown(jobs as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(pods);
    fireEvent.keyDown(pods as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(jobs);
  });
});
