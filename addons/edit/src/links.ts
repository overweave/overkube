/*
 * The dialog asked for, as the page's path says it: &edit=<what>/<kind's
 * ref>/<namespace>/<name> (<what>/<ref>/<name>: one of the whole cluster)
 * — its own object (not what is opened: closing that leaves it as it is);
 * &edit=apply, YAML of any objects applied. Linked to, reloaded, gone back
 * from (Back closes it) as any page.
 */

export type What = 'yaml' | 'delete' | 'drain';
const WHATS: readonly What[] = ['yaml', 'delete', 'drain'];

/** One object's dialog. */
export interface Edited {
  what: What;
  ref: string;
  namespace?: string;
  name: string;
}

/** What a path asks: an object's dialog, or YAML applied (kubectl apply). */
export type Asked = Edited | { what: 'apply' };

function split(path: string): [string, string[]] {
  const at = path.indexOf('?');
  return at < 0
    ? [path, []]
    : [
        path.slice(0, at),
        path
          .slice(at + 1)
          .split('&')
          .filter(Boolean),
      ];
}

/** A path with this dialog asked for (none: none); the rest as it is. */
export function editIn(path: string, asked: Asked | undefined): string {
  const [where, query] = split(path);
  const rest = query.filter((p) => !p.startsWith('edit='));
  const value = !asked
    ? undefined
    : asked.what === 'apply'
      ? 'apply'
      : [asked.what, asked.ref, ...(asked.namespace ? [asked.namespace] : []), asked.name].map(encodeURIComponent).join('/');
  const all = [...rest, ...(value ? [`edit=${value}`] : [])];
  return all.length ? `${where}?${all.join('&')}` : where;
}

/** The dialog a path asks for; none (or one not to be read): none. */
export function editedIn(path: string): Asked | undefined {
  const raw = split(path)[1].find((p) => p.startsWith('edit='));
  if (!raw) return undefined;
  const value = raw.slice('edit='.length);
  if (value === 'apply') return { what: 'apply' };
  try {
    const [what, ref, ...rest] = value.split('/').map(decodeURIComponent);
    if (!WHATS.includes(what as What) || !ref || !rest.every(Boolean)) return undefined;
    if (rest.length === 1) return { what: what as What, ref, name: rest[0] as string };
    if (rest.length === 2) return { what: what as What, ref, namespace: rest[0], name: rest[1] as string };
  } catch {
    // Not one to be read: none.
  }
  return undefined;
}
