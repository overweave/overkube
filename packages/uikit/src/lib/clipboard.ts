/*
 * Copying text: the Clipboard API where the page may use it (a secure page:
 * https, localhost); else — a dashboard over plain http on its address — a text
 * area selected and copied the old way. Whether it was copied, once known.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (globalThis.isSecureContext && globalThis.navigator?.clipboard) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (no focus, no permission): the old way.
  }
  const doc = globalThis.document;
  if (!doc?.body) return false;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  const before = doc.activeElement as HTMLElement | null;
  doc.body.append(area);
  // Focused and selected: what the old way copies.
  area.focus();
  area.select();
  let done = false;
  try {
    done = doc.execCommand?.('copy') ?? false;
  } catch {
    done = false;
  }
  area.remove();
  before?.focus?.();
  return done;
}
