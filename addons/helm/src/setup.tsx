import type { Ctx } from '@overkube/sdk';
import { FIELDS } from './kinds.ts';
import { addMark } from './mark.tsx';
import { addOverview } from './overview.tsx';
import { addPage } from './page.tsx';

/** Its definitions (its own chunk: loaded once it is turned on). */
export default function setup({ contributor: c }: Ctx) {
  for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
  c.add('Messages', 'en:helm', { messages: {} }, { fallback: true });
  addPage(c);
  addOverview(c);
  addMark(c);
}
