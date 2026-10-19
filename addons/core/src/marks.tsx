import { type KubeContributor, kindRef, NameMark, type NameMarkSpec, type ResourceProps, section, slots, takes } from '@overkube/sdk';
import { fill, useList, useSay } from '@overkube/sdk/preact';
import { Section } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { useDefinitions } from '@overweave/ui/preact';
import { T } from './texts.ts';

/*
 * An object's marks in its view (its kind's NameMarks, as its table has
 * them): after its title, each drawn as beside its name; what each says of
 * it in full (its detail), under Managed By — one list, their names
 * aligned. Their values asked once, of it alone (one query: its namespace,
 * its name — a mark joined of its workload watches its workloads of that
 * namespace only).
 */

/** Its marks with a value, in order. */
function useMarks({ kind, object }: ResourceProps): { mark: Definition<NameMarkSpec>; value: string }[] {
  const marks = inOrder(useDefinitions(NameMark).filter((m) => takes(m.spec.target, kind)));
  const namespace = object.metadata?.namespace;
  const got = useList(
    marks.length
      ? {
          kind: kindRef(kind),
          ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
          where: { field: 'core.name', op: 'eq', value: object.metadata?.name ?? '' },
          page: { limit: 1 },
          select: [...new Set(marks.map((m) => m.spec.field))],
        }
      : undefined,
  );
  const values = got.items[0]?.values ?? {};
  return marks.flatMap((mark) => {
    const value = values[mark.spec.field];
    return typeof value === 'string' && value ? [{ mark, value }] : [];
  });
}

function ViewMarks(props: ResourceProps) {
  const namespace = props.object.metadata?.namespace;
  return (
    <>
      {useMarks(props).map(({ mark, value }) => {
        const Mark = mark.spec.render;
        return <Mark key={mark.name} value={value} kind={props.kind} namespace={namespace} />;
      })}
    </>
  );
}

function ManagedBy(props: ResourceProps) {
  const say = useSay();
  const namespace = props.object.metadata?.namespace;
  const told = useMarks(props).filter(({ mark }) => mark.spec.detail);
  if (!told.length) return null;
  return (
    <Section title={say(T.resource.view.managedBy)} part="managed-by">
      <dl class="uk-kv">
        {told.map(({ mark, value }) => {
          const Detail = mark.spec.detail as NonNullable<NameMarkSpec['detail']>;
          return <Detail key={mark.name} value={value} kind={props.kind} namespace={namespace} />;
        })}
      </dl>
    </Section>
  );
}

export function addMarks(c: KubeContributor): void {
  c.add('Fill', 'core.resource.view.marks', fill(slots.resource.view.marks, { order: 100, render: ViewMarks }));
  c.add('Fill', 'core.resource.view.managed-by', section({ order: 10, render: ManagedBy }));
}
