import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Code } from './Code';

/* Text as it is, in a monospace block. */

afterEach(cleanup);

describe('Code', () => {
  it('draws text as it is: its lines, its spaces, its markup as text', () => {
    const text = 'kind: Pod\nmetadata:\n  name: web\n  annotations:\n    note: "<b>not bold</b>"\n';
    const pre = render(<Code>{text}</Code>).container.querySelector('pre') as HTMLElement;
    expect(pre.className).toBe('uk-code');
    expect(pre.textContent).toBe(text);
    expect(pre.querySelector('b')).toBeNull();
  });
});
