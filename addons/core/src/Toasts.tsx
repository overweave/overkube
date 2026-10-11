import { usePage } from '@overkube/sdk/preact';
import { Button, Notice } from '@overkube/uikit';

/** What the user is told, each closable; its time stopped while the pointer or focus is on it. Read out by the shell's live regions. */
export function Toasts() {
  const page = usePage();
  return (
    <>
      {page.notifications.value.map((n) => (
        <div
          key={n.id}
          data-level={n.level}
          onPointerEnter={() => page.hold(n.id, true)}
          onPointerLeave={() => page.hold(n.id, false)}
          onFocusIn={() => page.hold(n.id, true)}
          onFocusOut={() => page.hold(n.id, false)}
        >
          <Notice
            level={n.level === 'ok' ? 'ok' : n.level === 'warn' ? 'warn' : n.level === 'error' ? 'error' : undefined}
            title={n.title}
            action={<Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={() => page.dismiss(n.id)} />}
          >
            {n.text}
          </Notice>
        </div>
      ))}
    </>
  );
}
