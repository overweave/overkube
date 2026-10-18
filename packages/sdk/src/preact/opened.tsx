import { Modal } from '@overkube/uikit';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { Appearance } from '../kinds.ts';
import { slots } from '../slots.ts';

/*
 * Something opened over the page as a resource is (an addon's own: a Helm
 * release, an image): laid out as the user chose for every one of them (a
 * side panel, a window, all the window — Appearance.layout), what is in
 * the opened header beside its title (the core's: the switch of that) and
 * its own tools before it, its tabs under it, its footer.
 */

/** The opened header's props (none): the same each render, its fills not drawn again for nothing. */
const NONE = {};

/** How what is opened is laid out, as the user chose (a side panel, unless said). */
export const useLayout = () => useDefinition(Appearance, 'default')?.spec.layout ?? 'right';

export function OpenedView({
  title,
  actions,
  tabs,
  footer,
  onClose,
  children,
}: {
  title: ComponentChildren;
  /** Its own tools, before the opened header's. */
  actions?: ComponentChildren;
  tabs?: ComponentChildren;
  footer?: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
}) {
  return (
    <Modal
      title={title}
      actions={
        <>
          {actions}
          {slotElement(slots.opened.header, NONE)}
        </>
      }
      tabs={tabs}
      footer={footer}
      placement={useLayout()}
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}
