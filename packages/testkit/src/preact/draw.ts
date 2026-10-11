import { kindMatcher } from '@overkube/sdk';
import { KubeProvider } from '@overkube/sdk/preact';
import { type Mounted, type MountOptions, mount as mountTree, type RenderedSlot, renderSlot as renderOne } from '@overweave/testkit/preact';
import type { SlotRef } from '@overweave/ui';
import { type ComponentChildren, h } from 'preact';
import type { KubeWorld } from '../world.ts';

/** The world's cluster around the tree, the app's own providers (if given) around that. */
function options(world: KubeWorld, given: MountOptions = {}): MountOptions {
  const Outer = given.wrapper;
  const wrapper = ({ children }: { children?: ComponentChildren }) => {
    const inner = h(KubeProvider, { cluster: world.cluster }, children);
    return Outer ? h(Outer, null, inner) : inner;
  };
  return { matcher: kindMatcher, ...given, wrapper };
}

/** Any tree drawn over the world: mount(w, <PodsOverview />). */
export function mount(world: KubeWorld, node: ComponentChildren, given?: MountOptions): Mounted {
  return mountTree(world, node, options(world, given));
}

/** A slot of the world drawn on its own: renderSlot(w, slots.object.sections, { kind: Pod, object: pod }). */
export function renderSlot<P>(world: KubeWorld, slot: SlotRef<P> | string, props?: P, given?: MountOptions): RenderedSlot<P> {
  return (renderOne as (w: KubeWorld, s: SlotRef<P> | string, p?: P, o?: MountOptions) => RenderedSlot<P>)(world, slot, props, options(world, given));
}
