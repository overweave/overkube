import { MenuItem, menuOf } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import { ContextMenu, usePresence } from '@overkube/uikit';
import { useDefinitions } from '@overweave/ui/preact';
import { useRef } from 'preact/hooks';

/*
 * The context menu open (usePage().menu), drawn: its items for its subject,
 * in their groups (menuOf: the dangerous last), said in the page's
 * language; one chosen run — what it throws told as its owner's.
 */
export function Menu() {
  const page = usePage();
  const say = useSay();
  const items = useDefinitions(MenuItem);
  const open = page.menu.value;
  // The last one opened, drawn while it fades out.
  const last = useRef(open);
  if (open) last.current = open;
  const presence = usePresence(!!open);
  const menu = last.current;
  if (!presence.mounted || !menu) return null;
  const groups = menuOf(items, menu.on, menu.subject, (d, e) => page.report(d, 'when', e)).map((g) => ({
    key: g.group,
    items: g.items.map((d) => ({
      key: d.name,
      label: say(d.spec.title),
      icon: d.spec.icon,
      keys: d.spec.keys,
      danger: d.spec.danger,
      onSelect: () => {
        try {
          Promise.resolve(d.spec.run(menu.subject, { path: page.path.peek(), navigate: page.navigate, notify: page.notify, say })).catch((e) => page.report(d, 'run', e));
        } catch (e) {
          page.report(d, 'run', e);
        }
      },
    })),
  }));
  return (
    <ContextMenu
      key={menu.id}
      at={menu.at}
      keyboard={menu.keyboard}
      label={menu.title}
      title={menu.title}
      groups={groups}
      state={open?.id === menu.id ? 'open' : 'closing'}
      onClose={() => page.menu.peek()?.id === menu.id && page.closeMenu()}
    />
  );
}
