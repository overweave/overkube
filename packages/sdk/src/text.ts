/*
 * What is said to the user — a label: a string, said as it is in every
 * language; or by a key, t('images.tag', 'Tag') — its key (its addon's id,
 * then its parts) and its English beside it, said until a language says
 * otherwise (Messages). A phrase with a number has a form for each plural
 * category ({ one, other }; a language with more forms says them: few,
 * many…); {name}s in it are filled in. A key that is none throws where it
 * is written (the addon's module): a mistake seen at once.
 */

/** A phrase's forms, by plural category (Intl.PluralRules): other always, the rest as a language has them. */
export type PluralForms = { readonly other: string } & Partial<Readonly<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>>>;

/** What a key says: a phrase, or its forms by a number. */
export type Phrase = string | PluralForms;

/** Something said by its key, its English beside it. */
export interface LabelRef {
  readonly key: string;
  readonly en: Phrase;
}

/** What is said: as it is (a string), or by a key (t()). */
export type Label = string | LabelRef;

/** A key: its addon's id, then its parts (images.tag, core.table.count). */
export const KEY = /^[a-z][a-z0-9-]*(\.[a-zA-Z0-9-]+)+$/;

const CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** A label by its key, its English beside it: t('images.tag', 'Tag'), t('images.count', { one: '{count} image', other: '{count} images' }). */
export function t(key: string, en: Phrase): LabelRef {
  if (!KEY.test(key)) throw new Error(`label key "${key}": its addon's id, then parts (images.tag)`);
  if (!isPhrase(en)) throw new Error(`label ${key}: its English is a string, or forms with other`);
  return Object.freeze({ key, en });
}

/** Whether a value is a phrase: a string, or forms (other, and only plural categories). */
export function isPhrase(value: unknown): value is Phrase {
  if (typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const forms = Object.entries(value);
  return typeof (value as { other?: unknown }).other === 'string' && forms.every(([k, v]) => CATEGORIES.has(k) && typeof v === 'string');
}

/** Whether a value is a label: a string, or a key (as t() makes one) and its English. */
export function isLabel(value: unknown): value is Label {
  if (typeof value === 'string') return true;
  return typeof value === 'object' && value !== null && typeof (value as LabelRef).key === 'string' && KEY.test((value as LabelRef).key) && isPhrase((value as LabelRef).en);
}

/** A language tag as Intl says it (pt-br: pt-BR); undefined: none. */
export function canonicalLocale(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}
