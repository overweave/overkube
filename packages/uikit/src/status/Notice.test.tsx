import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Notice } from './Notice';

/* A message in place of something: what it says, how it is said (alert or status), its icon or spinner, its title, what to do. */

afterEach(cleanup);

const notice = (c: Element) => c.querySelector('.uk-notice') as HTMLElement;

describe('Notice', () => {
  it('says its words, as a status, grey with no level', () => {
    const { container, getByRole } = render(<Notice>Loading Pods…</Notice>);
    expect(getByRole('status').textContent).toBe('Loading Pods…');
    expect(notice(container).hasAttribute('data-level')).toBe(false);
    expect(container.querySelector('.uk-notice-icon')).toBeNull();
  });

  it('says a warning or an error as an alert (at once); a fine one as a status', () => {
    expect(render(<Notice level="warn">x</Notice>).getByRole('alert')).toBeTruthy();
    cleanup();
    expect(render(<Notice level="error">x</Notice>).getByRole('alert')).toBeTruthy();
    cleanup();
    const ok = render(<Notice level="ok">x</Notice>);
    expect(ok.getByRole('status')).toBeTruthy();
    expect(notice(ok.container).getAttribute('data-level')).toBe('ok');
  });

  it('draws its icon by its first line, hidden from a reader', () => {
    const { container } = render(
      <Notice level="warn" icon="warning">
        3 pods need a look.
      </Notice>,
    );
    const icon = container.querySelector('.uk-notice-icon') as HTMLElement;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('.uk-icon')).not.toBeNull();
    expect(notice(container).firstElementChild).toBe(icon);
  });

  it('draws a spinner where its icon is while loading, and says it is busy', () => {
    const { container } = render(
      <Notice loading icon="puzzle">
        Loading…
      </Notice>,
    );
    expect(container.querySelector('.uk-notice-icon .uk-spinner')).not.toBeNull();
    expect(container.querySelector('.uk-notice-icon .uk-icon')).toBeNull();
    expect(notice(container).getAttribute('aria-busy')).toBe('true');
  });

  it('says a title over its words', () => {
    const { container } = render(
      <Notice level="error" title="The session is over">
        Log in again.
      </Notice>,
    );
    expect(container.querySelector('.uk-notice-title')?.textContent).toBe('The session is over');
    expect(container.querySelector('.uk-notice-text')?.textContent).toBe('Log in again.');
    expect(container.querySelector('.uk-notice-body')?.firstElementChild?.className).toBe('uk-notice-title');
  });

  it('says a title alone, with no words', () => {
    const { container } = render(<Notice title="Nothing here" />);
    expect(container.querySelector('.uk-notice-title')?.textContent).toBe('Nothing here');
    expect(container.querySelector('.uk-notice-text')).toBeNull();
  });

  it('puts what to do about it at its end, working', async () => {
    let retried = 0;
    const { getByRole, container } = render(
      <Notice
        level="error"
        action={
          <button type="button" onClick={() => retried++}>
            Retry
          </button>
        }
      >
        Pods cannot be listed.
      </Notice>,
    );
    expect(notice(container).lastElementChild?.className).toBe('uk-notice-action');
    await userEvent.setup().click(getByRole('button', { name: 'Retry' }));
    expect(retried).toBe(1);
  });
});
