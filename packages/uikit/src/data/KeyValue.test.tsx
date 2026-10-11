import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { css } from '../styles';
import { KeyValue } from './KeyValue';

/* Names and their values: in order, a dash for one missing (and only then), each name over its value when narrow. */

afterEach(cleanup);

const pairs = (c: Element) => [...c.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);

describe('KeyValue', () => {
  it('says each name and its value, in order, as a description list', () => {
    const { container } = render(
      <KeyValue
        rows={[
          ['Name', 'web'],
          ['Namespace', 'media'],
        ]}
      />,
    );
    expect(container.firstElementChild?.tagName).toBe('DL');
    expect(pairs(container)).toEqual([
      ['Name', 'web'],
      ['Namespace', 'media'],
    ]);
  });

  it('says a dash for a value missing — undefined or null', () => {
    const { container } = render(
      <KeyValue
        rows={[
          ['Owners', undefined],
          ['Node', null],
        ]}
      />,
    );
    expect(pairs(container)).toEqual([
      ['Owners', '—'],
      ['Node', '—'],
    ]);
  });

  it('says 0, false-like and empty values as they are (they are values, not missing)', () => {
    const { container } = render(
      <KeyValue
        rows={[
          ['Restarts', 0],
          ['Note', ''],
        ]}
      />,
    );
    expect(pairs(container)).toEqual([
      ['Restarts', '0'],
      ['Note', ''],
    ]);
  });

  it('draws a value that is not text (chips, a link)', () => {
    const { container } = render(<KeyValue rows={[['Labels', <b key="b">app=web</b>]]} />);
    expect(container.querySelector('dd b')?.textContent).toBe('app=web');
  });

  it('draws two rows of one name, both', () => {
    const { container } = render(
      <KeyValue
        rows={[
          ['Port', '80'],
          ['Port', '443'],
        ]}
      />,
    );
    expect(pairs(container)).toEqual([
      ['Port', '80'],
      ['Port', '443'],
    ]);
  });

  it('is laid out by its own width: each name over its value when narrow', () => {
    expect(css).toContain('container: uk-kv / inline-size');
    expect(css).toContain('@container uk-kv (max-width: 380px)');
  });
});
