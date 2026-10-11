import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

/* A dialog over the page: focus in it and back; Escape and a click beside it close it (fading first). */

afterEach(cleanup);

function Opener({ inner = false }: { inner?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open it
      </button>
      {open && (
        <Modal title="Pod web" onClose={() => setOpen(false)}>
          <input aria-label="first" />
          <button type="button">last</button>
          {inner && <span>inside</span>}
        </Modal>
      )}
    </>
  );
}

describe('Modal', () => {
  it('takes focus into its first field, keeps Tab inside, and gives focus back once gone', async () => {
    const { getByText, getByLabelText, getByRole, queryByRole } = render(<Opener />);
    const opener = getByText('open it');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(getByLabelText('first'));
    expect(getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy();
    // Tab from the last goes round to the first (the Close button), Shift+Tab from the first to the last.
    getByText('last').focus();
    fireEvent.keyDown(getByText('last'), { key: 'Tab' });
    expect(document.activeElement).toBe(getByLabelText('Close'));
    fireEvent.keyDown(getByLabelText('Close'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('last'));
    fireEvent.keyDown(getByText('last'), { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('closes by its button, and by a click beside it — begun beside it, not a press inside let go outside', async () => {
    const { getByText, getByRole, queryByRole, getByLabelText } = render(<Opener inner />);
    const user = userEvent.setup();
    await user.click(getByText('open it'));
    const dialog = getByRole('dialog');
    // A press inside, let go beside it: no click beside it.
    fireEvent.pointerDown(getByText('inside'));
    fireEvent.click(dialog);
    await new Promise((r) => setTimeout(r, 250));
    expect(queryByRole('dialog')).not.toBeNull();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    await waitFor(() => expect(queryByRole('dialog')).toBeNull());
    await user.click(getByText('open it'));
    await user.click(getByLabelText('Close'));
    await waitFor(() => expect(queryByRole('dialog')).toBeNull());
  });
});
