import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Status } from './Status';

/* A state's words: as they are, a break allowed after a colon or a comma only. */

afterEach(cleanup);

const text = (c: Element) => c.querySelector('.uk-status-text') as HTMLElement;

describe('Status', () => {
  it('may break its words after a colon or a comma, its text as it is', () => {
    const { container } = render(<Status tone="error">Init:CrashLoopBackOff</Status>);
    expect(text(container).textContent).toBe('Init:CrashLoopBackOff');
    expect(text(container).innerHTML).toBe('Init:<wbr>CrashLoopBackOff');
    const node = render(<Status tone="warn">Ready,SchedulingDisabled</Status>).container;
    expect(text(node).innerHTML).toBe('Ready,<wbr>SchedulingDisabled');
  });

  it('leaves words with nowhere to break as they are', () => {
    expect(text(render(<Status tone="ok">Running</Status>).container).innerHTML).toBe('Running');
  });
});
