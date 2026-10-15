import type { KindInfo } from '@overkube/kube-types';
import { TipField } from '@overkube/uikit';
import type { FillSpec, Placement, SlotRef } from '@overweave/ui';
import type { PreactComponent } from '@overweave/ui/preact';
import { type ComponentChildren, h } from 'preact';
import type { Target } from '../kinds.ts';
import { forKinds } from '../target.ts';
import type { Label } from '../text.ts';
import { useSay } from './say.ts';

/*
 * A field of a tip (one of its fields' slot's: slots.tip.<about>.fields) —
 * its name and its value, a row as every tip's: one fill each, another's
 * among the core's (by order, before, after), none taking another's place.
 * For these kinds' (none: every kind's), when it holds; its value nothing
 * (undefined, null, ''): a dash.
 */
export function tipField<P extends { kind: KindInfo }>(
  fields: SlotRef<P>,
  spec: Placement & { kinds?: readonly KindInfo[]; label: Label; when?: (props: P) => boolean; value: (props: P) => ComponentChildren },
): FillSpec<P, PreactComponent, Target> {
  const { kinds, label, value, ...rest } = spec;
  function Field(props: P) {
    return h(TipField, { label: useSay()(label), children: value(props) });
  }
  return { ...rest, slot: fields.name, ...(kinds ? { target: forKinds(...kinds) } : {}), render: Field as PreactComponent };
}
