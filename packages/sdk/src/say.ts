import { canonicalLocale, type Label, type Phrase, type PluralForms } from './text.ts';

/*
 * Saying labels in a language, pure: of the Messages there are (each named
 * <locale>:<addon>, its keys its addon's), a key's phrase in the language —
 * else in its shorter tags (zh-Hant-TW: zh-Hant, zh), else English, else the
 * English given with the key; between definitions of one language, the
 * phrase said by the stronger layer. Its form chosen by the plural rules of
 * the language it was found in; {name}s filled in.
 */

export type Params = Readonly<Record<string, string | number>>;

export interface Say {
  /** A label: a string as it is, a key's as its language says. */
  (label: Label, params?: Params): string;
  /** The language said in (a canonical tag). */
  readonly locale: string;
}

/** A Messages definition, as the registry reads it. */
export interface MessagesOf {
  readonly name: string;
  readonly spec: { readonly messages: Readonly<Record<string, Phrase>> };
  provenanceOf(path: readonly string[]): { readonly priority: number } | undefined;
}

/** A Messages definition's name read: its language and its addon; undefined: not <locale>:<addon>. */
export function messagesName(name: string): { locale: string; addon: string } | undefined {
  const m = name.match(/^([^:]+):([a-z][a-z0-9-]*)$/);
  const locale = m && canonicalLocale(m[1]);
  return m && locale ? { locale, addon: m[2] } : undefined;
}

/** A language and its shorter tags, then English: zh-Hant-TW, zh-Hant, zh, en. */
export function localeChain(locale: string): string[] {
  const parts = locale.split('-');
  const chain = parts.map((_, i) => parts.slice(0, parts.length - i).join('-'));
  return [...new Set([...chain, 'en'])];
}

const rules = new Map<string, Intl.PluralRules>();
function pluralOf(locale: string): Intl.PluralRules {
  let r = rules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    rules.set(locale, r);
  }
  return r;
}

function fill(phrase: string, params?: Params): string {
  return params ? phrase.replace(/\{(\w+)\}/g, (all, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : all)) : phrase;
}

function pick(phrase: Phrase, locale: string, params?: Params): string {
  if (typeof phrase === 'string') return phrase;
  const count = Number(params?.count);
  const category = Number.isFinite(count) ? (pluralOf(locale).select(count) as keyof PluralForms) : 'other';
  return phrase[category] ?? phrase.other;
}

/** How to say labels in a language (a canonical tag; one that is none: English), of these Messages. */
export function sayer(asked: string, all: readonly MessagesOf[]): Say {
  const locale = canonicalLocale(asked) ?? 'en';
  const chain = localeChain(locale);
  // Each key's phrase: the most specific language first; in one language, the stronger layer's (then the name).
  const found = new Map<string, { phrase: Phrase; locale: string; rank: number; priority: number }>();
  for (const m of all) {
    const named = messagesName(m.name);
    const rank = named ? chain.indexOf(named.locale) : -1;
    if (!named || rank < 0) continue;
    for (const [key, phrase] of Object.entries(m.spec.messages)) {
      // Its addon's keys only: a pack says another addon's in that addon's own name (pl:images).
      if (!key.startsWith(`${named.addon}.`)) continue;
      const priority = m.provenanceOf(['messages', key])?.priority ?? 0;
      const was = found.get(key);
      if (!was || rank < was.rank || (rank === was.rank && priority > was.priority)) found.set(key, { phrase, locale: named.locale, rank, priority });
    }
  }
  const say = ((label: Label, params?: Params) => {
    if (typeof label === 'string') return fill(label, params);
    const got = found.get(label.key);
    return fill(got ? pick(got.phrase, got.locale, params) : pick(label.en, 'en', params), params);
  }) as Say;
  (say as { locale: string }).locale = locale;
  return say;
}
