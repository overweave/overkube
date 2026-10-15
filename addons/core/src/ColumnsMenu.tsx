import { type KindProps, TableView } from '@overkube/sdk';
import { useSay, useUser } from '@overkube/sdk/preact';
import { Button, Checklist, type ChecklistGroup, Popover, usePresence } from '@overkube/uikit';
import type { Registry } from '@overweave/core';
import { useDefinition, useOverweave } from '@overweave/ui/preact';
import { useRef, useState } from 'preact/hooks';
import { type Offered, useColumns } from './columns.tsx';
import { useFailures } from './failures.ts';
import { T } from './texts.ts';

/*
 * A kind's columns' settings (the core's, in kind.header.actions): a button
 * over its table opening every column there is for the kind, grouped by
 * where it comes from — kubectl's (the core's, a CRD's), kubectl's -o wide,
 * more than kubectl says (the core's), each addon's — each turned on or off,
 * a group at once; the name always shown. What is turned on or off is the
 * user's (its TableView's hidden, patched: kept) — turned back to what it is
 * without them, theirs no more — back to the defaults at its foot.
 */

/** Whether a column of a kind's table is hidden as it would be without the user: as another's TableView says (the one that wins), else as the column is (wide, more: hidden). */
// biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
export function hiddenUnder(registry: Registry<any>, kind: string, o: Offered): boolean {
  let said: { priority: number; patch: boolean; value: unknown } | undefined;
  for (const c of registry.inspect('TableView', kind).contributions) {
    if (c.contributor === 'user') continue;
    const leaf = c.leaves.find((l) => l.path[0] === 'hidden' && l.path[1] === o.definition.name);
    if (!leaf || typeof leaf.value !== 'boolean') continue;
    const patch = c.operation === 'patch';
    if (!said || c.priority > said.priority || (c.priority === said.priority && patch && !said.patch)) said = { priority: c.priority, patch, value: leaf.value };
  }
  return said ? (said.value as boolean) : o.wide || o.more;
}

/** The columns there are, as the settings group them: the core's by kubectl's default and -o wide, then each addon's. */
export function groupsOf(offered: readonly Offered[], say: ReturnType<typeof useSay>): ChecklistGroup[] {
  const t = T.kind.columns;
  const item = (o: Offered) => ({
    id: o.definition.name,
    label: say(o.definition.spec.header),
    on: o.shown,
    // The name stays — where it is shown by default (an event's is only when asked: to turn on and off as any other).
    locked: o.definition.name === 'core.name' && !o.wide,
    hint: o.definition.spec.sort ?? o.definition.spec.values?.join(' '),
  });
  const core = offered.filter((o) => o.by === 'core');
  const addons = [...new Set(offered.filter((o) => o.by !== 'core').map((o) => o.by))];
  return [
    { id: 'general', title: say(t.general), items: core.filter((o) => !o.wide && !o.more).map(item) },
    { id: 'wide', title: say(t.wide), items: core.filter((o) => o.wide && !o.more).map(item) },
    { id: 'more', title: say(t.more), items: core.filter((o) => o.more).map(item) },
    ...addons.map((by) => ({ id: by, title: by, note: say(t.addon), items: offered.filter((o) => o.by === by).map(item) })),
  ].filter((g) => g.items.length);
}

/** The button over a kind's table opening its columns' settings. */
export function ColumnsButton({ kind }: KindProps) {
  const say = useSay();
  const user = useUser();
  const t = T.kind.columns;
  const view = useDefinition(TableView, kind.id)?.spec ?? {};
  const { offered } = useColumns(kind, view, useFailures());
  const { registry } = useOverweave();
  // Turned as it would be without the user: their say of it taken back; else said.
  const turn = (ids: string[], on: boolean) =>
    user.patch('TableView', kind.id, {
      hidden: Object.fromEntries(
        ids.map((id) => {
          const o = offered.find((x) => x.definition.name === id) as Offered;
          return [id, hiddenUnder(registry, kind.id, o) === !on ? undefined : !on];
        }),
      ),
    });
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  return (
    <>
      <Button buttonRef={anchor} variant="ghost" size="sm" icon="columns" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {say(t.button)}
      </Button>
      {presence.mounted && (
        <Popover anchor={anchor} align="end" label={say(t.button)} state={presence.state} onClose={() => setOpen(false)} class="uk-checklist-pop">
          <Checklist
            groups={groupsOf(offered, say)}
            onChange={turn}
            onReset={() => user.reset('TableView', kind.id, 'hidden')}
            labels={{
              filter: say(t.filter),
              shown: (on, all) => say(t.shown, { on, all }),
              reset: say(t.reset),
              locked: say(t.locked),
              none: say(t.none),
            }}
          />
        </Popover>
      )}
    </>
  );
}
