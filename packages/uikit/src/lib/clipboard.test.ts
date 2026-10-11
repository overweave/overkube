import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

/*
 * Copying: the Clipboard API on a secure page; else (a dashboard over plain
 * http), a text area selected and copied the old way. happy-dom has
 * neither the API on its own nor execCommand: each given here.
 */

let writeText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;
let selected: string[];

beforeEach(() => {
  selected = [];
  writeText = vi.fn(() => Promise.resolve());
  execCommand = vi.fn(() => {
    selected.push((document.activeElement as HTMLTextAreaElement | null)?.value ?? '');
    return true;
  });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('copies by the Clipboard API on a secure page', async () => {
    expect(await copyText('tier=frontend')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('tier=frontend');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies the old way on a page that is not secure (a dashboard over http)', async () => {
    vi.stubGlobal('isSecureContext', false);
    expect(await copyText('tier=frontend')).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(selected).toEqual(['tier=frontend']);
  });

  it('copies the old way when the API refuses (no focus, no permission)', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('denied')));
    expect(await copyText('x')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('leaves nothing behind, and focus where it was', async () => {
    vi.stubGlobal('isSecureContext', false);
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    await copyText('x');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('says it did not copy when the old way did not either', async () => {
    vi.stubGlobal('isSecureContext', false);
    execCommand.mockReturnValue(false);
    expect(await copyText('x')).toBe(false);
    execCommand.mockImplementation(() => {
      throw new Error('no');
    });
    expect(await copyText('x')).toBe(false);
  });
});
