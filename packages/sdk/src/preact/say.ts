import { useDefinition, useDefinitions } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import { Language, Messages } from '../kinds.ts';
import { type MessagesOf, type Say, sayer } from '../say.ts';

/*
 * Labels said in the page's language: the Language's (system: the
 * browser's, followed as it changes), with the Messages there are —
 * a new language or a new translation said at once.
 */

const browser = () => (typeof navigator === 'undefined' ? 'en' : (navigator.language ?? 'en'));

/** The browser's language, followed (one listener for the page). */
const browserLocale = signal(browser());
if (typeof window !== 'undefined') window.addEventListener('languagechange', () => (browserLocale.value = browser()));

/** How to say labels in the page's language. */
export function useSay(): Say {
  const asked = useDefinition(Language, 'default')?.spec.locale;
  const locale = !asked || asked === 'system' ? browserLocale.value : asked;
  const all = useDefinitions(Messages);
  return useMemo(() => sayer(locale, all as unknown as readonly MessagesOf[]), [locale, all]);
}
