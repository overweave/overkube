import type { Loose, Requirement } from '@overkube/query';

/*
 * A label selector's requirements as CEL, held as kubectl holds them (and
 * as @overkube/query's holdsTo tests them): a label's value read as "" where
 * it has none (labels[?k].orValue(""): a where's), had-ness said where a
 * value of "" could be taken for none. And a loose search's text (a
 * selector, or words each in a name) as CEL — what a search found is what
 * its filter keeps.
 */

/** A label's value as CEL, "" where it has none (a where's: labels[?k].orValue("")). */
export const labelValue = (key: string): string => `labels[?${JSON.stringify(key)}].orValue("")`;
const value = labelValue;
const had = (key: string) => `${JSON.stringify(key)} in labels`;

/** A requirement as CEL. */
export function requirementCel({ key, op, values }: Requirement): string {
  const among = `${value(key)} in ${JSON.stringify(values)}`;
  // A value of "" is a label had with none, not one not had.
  const empty = values.includes('');
  switch (op) {
    case 'eq':
      return empty ? `${had(key)} && ${value(key)} == ""` : `${value(key)} == ${JSON.stringify(values[0])}`;
    case 'ne':
      return empty ? `!(${had(key)} && ${value(key)} == "")` : `${value(key)} != ${JSON.stringify(values[0])}`;
    case 'in':
      return empty ? `${had(key)} && ${among}` : among;
    case 'notin':
      return empty ? `!(${had(key)} && ${among})` : `!(${among})`;
    case 'exists':
      return had(key);
    case 'absent':
      return `!(${had(key)})`;
  }
}

/** A selector as CEL: all of its requirements. */
export const selectorCel = (requirements: readonly Requirement[]): string => requirements.map(requirementCel).join(' && ');

/** A loose search's text as CEL: its selector's, or each word in a name (ASCII's case aside). */
export const looseCel = (loose: Loose): string =>
  'selector' in loose ? selectorCel(loose.selector) : loose.words.map((w) => `name.lowerAscii().contains(${JSON.stringify(w)})`).join(' && ');
