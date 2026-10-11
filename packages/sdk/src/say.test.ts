import { describe, expect, it } from 'vitest';
import { localeChain, type MessagesOf, messagesName, sayer } from './say.ts';
import { canonicalLocale, isLabel, isPhrase, t } from './text.ts';

/*
 * Saying labels, pure: a string as it is; a key in the language, its
 * shorter tags, English, else the English given; forms by the rules of the
 * language the phrase was found in; between definitions of one language,
 * the stronger layer's; an addon's keys only; {name}s filled in, own ones.
 */

const defs = (...list: [string, Record<string, unknown>, number?][]): MessagesOf[] =>
  list.map(([name, messages, priority = 200]) => ({ name, spec: { messages } as never, provenanceOf: () => ({ priority }) }));

const images = t('images.count', { one: '{count} image', other: '{count} images' });

describe('labels', () => {
  it('are a string, or a key (its addon’s id, then parts) with its English', () => {
    expect(() => t('Tag', 'Tag')).toThrow(/label key/);
    expect(() => t('images.tag', { one: 'x' } as never)).toThrow(/English/);
    expect([isLabel('Tag'), isLabel(t('images.tag', 'Tag')), isLabel({ key: 'Tag', en: 'Tag' })]).toEqual([true, true, false]);
    expect([isPhrase({ other: 'x', few: 'y' }), isPhrase({ other: 'x', oen: 'y' }), isPhrase({ one: 'x' })]).toEqual([true, false, false]);
  });

  it('have languages as Intl names them, and their shorter tags', () => {
    expect([canonicalLocale('pt-br'), canonicalLocale('en_US'), canonicalLocale('en-US-u-nu-latn')]).toEqual(['pt-BR', undefined, 'en-US-u-nu-latn']);
    expect(localeChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
    expect([messagesName('pt-br:core'), messagesName('core'), messagesName('xx_YY:core')]).toEqual([{ locale: 'pt-BR', addon: 'core' }, undefined, undefined]);
  });
});

describe('sayer', () => {
  it('says a string as it is, a key in the language — else a shorter tag, English, the English given', () => {
    const say = sayer('pt-br', defs(['pt:images', { 'images.tag': 'Etiqueta' }], ['en:images', { 'images.size': 'Bytes' }]));
    expect([say.locale, say('As is'), say(t('images.tag', 'Tag')), say(t('images.size', 'Size')), say(t('images.other', 'Other'))]).toEqual([
      'pt-BR',
      'As is',
      'Etiqueta',
      'Bytes',
      'Other',
    ]);
  });

  it('chooses a form by the rules of the language the phrase was found in', () => {
    const pl = defs(['pl:images', { 'images.count': { one: '{count} obraz', few: '{count} obrazy', many: '{count} obrazów', other: '{count} obrazu' } }]);
    expect([1, 2, 5].map((count) => sayer('pl', pl)(images, { count }))).toEqual(['1 obraz', '2 obrazy', '5 obrazów']);
    // No French phrase: the English, by English rules (0 images, not "0 image").
    expect(sayer('fr', [])(images, { count: 0 })).toBe('0 images');
    expect([sayer('en', [])(images, {}), sayer('en', [])(images, { count: 'x' })]).toEqual(['{count} images', 'x images']);
  });

  it('takes the stronger layer’s phrase between definitions of one language, not the first by name', () => {
    const say = sayer('pl', defs(['pl:images', { 'images.tag': 'Pack' }, 200], ['pl:images', { 'images.tag': 'User' }, 1000]));
    expect(say(t('images.tag', 'Tag'))).toBe('User');
  });

  it('takes only an addon’s own keys from its definitions; a language that is none is English', () => {
    expect(sayer('pl', defs(['pl:images', { 'core.close': 'Zamknij' }]))(t('core.close', 'Close'))).toBe('Close');
    expect(sayer('en_US', []).locale).toBe('en');
  });

  it('fills in its own params only, once', () => {
    const say = sayer('en', []);
    expect(say('{name} {constructor} {missing}', { name: '{x} $& <b>' })).toBe('{x} $& <b> {constructor} {missing}');
  });
});
