import { css } from '../styles';

/*
 * The kit's styles on a document (or a shadow root), once: as a sheet made
 * in code (adoptedStyleSheets) — not inline markup, which a page's CSP
 * (style-src 'self') refuses; where there are none (a test's DOM), as a
 * style element — which a page under such a CSP refuses: a browser with
 * no constructed sheets (Safari before 16.4) draws it unstyled.
 */

const adopted = new WeakSet<Document | ShadowRoot>();

/** Where an element's styles are taken from: the shadow root it is drawn in, or its document. */
export function styleRootOf(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();
  return root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in root ? (root as ShadowRoot) : element.ownerDocument;
}

export function adoptStyles(root: Document | ShadowRoot = document): void {
  if (adopted.has(root)) return;
  adopted.add(root);
  // A document's or a shadow root's (told apart by its node type: another window's fails instanceof).
  const doc: Document = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : (root as ShadowRoot).ownerDocument;
  const Sheet = doc.defaultView?.CSSStyleSheet;
  if (Sheet && 'adoptedStyleSheets' in root && 'replaceSync' in Sheet.prototype) {
    const sheet = new Sheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return;
  }
  const style = Object.assign(doc.createElement('style'), { textContent: css });
  (root === doc ? doc.head : root).appendChild(style);
}
