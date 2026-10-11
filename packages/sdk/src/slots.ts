import type { ApiError, CollectionState } from '@overkube/client';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { type SlotRef, slot } from '@overweave/ui';

/*
 * The places of the page others put things in (Fills), each with what it is
 * drawn about — fill() types a fill's render by it. The frame's own (its
 * header, the navigation's top and side, the overlay) are drawn by the
 * shell, the rest by what fills those (a kind's table's bar, an object's
 * view, the picker's rows); a Page's regions are slots of their own.
 */

/** A kind's table, as its bar is drawn with it. */
export interface ListState {
  /** Objects shown (after the table's filter) and there are. */
  shown: number;
  total: number;
  state: CollectionState;
  error: Pick<ApiError, 'status' | 'code' | 'message'> | null;
}

/** About a kind. */
export interface KindProps {
  kind: KindInfo;
}

/** Where an object is: its kind, namespace, name (the object itself is the view's to find). */
export interface ObjectRef {
  kind: KindInfo;
  namespace?: string;
  name: string;
}

/** About one object of a kind. */
export interface ObjectProps {
  kind: KindInfo;
  object: KubeObject;
}

export const slots = {
  header: {
    /** Above the header: a notice for the whole page. */
    above: slot<Record<string, never>>('header.above'),
    start: slot<Record<string, never>>('header.start'),
    end: slot<Record<string, never>>('header.end'),
  },
  nav: {
    /** Across the page, under its header: the navigation as tabs. */
    top: slot<Record<string, never>>('nav.top'),
    /** Down its side: the navigation as a menu. */
    side: slot<Record<string, never>>('nav.side'),
  },
  /** Over the page: what is opened over it (a palette, a panel); placed by what fills it. */
  overlay: slot<Record<string, never>>('overlay'),
  /** The context menu open (usePage().menu): drawn over everything, by what fills it. */
  menu: slot<Record<string, never>>('menu'),
  /** What the user is told: drawn over everything, a dialog too (the shell keeps it on top). */
  notifications: slot<Record<string, never>>('notifications'),
  kind: {
    /** A kind's page (its table): one fill drawn, the first that takes the kind — the core's the last. */
    page: slot<KindProps>('kind.page'),
    /** Over a kind's table: its title, its count, what the table can do. */
    bar: slot<KindProps & { list: ListState }>('kind.bar'),
  },
  object: {
    /** An object opened (by its place): one fill drawn, the first that takes its kind — the core's the last. */
    view: slot<ObjectRef>('object.view'),
    /** An object's heading: its health, kind, namespace and name. */
    header: slot<ObjectProps>('object.header'),
    /** The sections of an object's view. */
    sections: slot<ObjectProps>('object.sections'),
  },
  picker: {
    /** Beside a kind in the picker: how many it has. */
    row: slot<KindProps & { count?: number }>('picker.row'),
  },
  /** A page's region: page:<page>:<region> (neither name empty, nor with a ":"). */
  page: (page: string, region: string): SlotRef<Record<string, never>> => {
    for (const part of [page, region]) if (!/^[^:]+$/.test(part)) throw new Error(`a page's or a region's name "${part}": not empty, no ":"`);
    return slot(`page:${page}:${region}`);
  },
} as const;

/** A slot's name read back: a page's region, or one of the frame's. */
export function parseSlot(name: string): { page: string; region: string } | { name: string } {
  const m = name.match(/^page:([^:]+):([^:]+)$/);
  return m ? { page: m[1], region: m[2] } : { name };
}
