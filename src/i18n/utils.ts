import { getRelativeLocaleUrl } from 'astro:i18n';
import en from './en.json';
import nl from './nl.json';

export const languages = ['nl', 'en'] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = 'nl';

/** BCP 47 locale per language, used for number formatting and Open Graph. */
export const locales: Record<Lang, string> = { nl: 'nl-NL', en: 'en-GB' };

type Dictionary = { [key: string]: string | string[] | Dictionary };
const dictionaries: Record<Lang, Dictionary> = { nl, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (languages as readonly string[]).includes(value);
}

function lookup(dictionary: Dictionary, key: string): string | string[] | undefined {
  let node: string | string[] | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' || Array.isArray(node) ? node : undefined;
}

function interpolate(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * Returns a translate function for one language. Missing keys fall back to
 * the default language, then to the key itself, so gaps are visible but never break the build.
 */
export function useTranslations(lang: Lang) {
  function resolve(key: string) {
    const value = lookup(dictionaries[lang], key) ?? lookup(dictionaries[defaultLang], key);
    if (value === undefined) console.warn(`[i18n] Missing translation: "${key}" (${lang})`);
    return value;
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    const value = resolve(key);
    return typeof value === 'string' ? interpolate(value, vars) : key;
  }

  /** For keys that hold a list of strings, e.g. paragraphs. */
  t.list = (key: string): string[] => {
    const value = resolve(key);
    return Array.isArray(value) ? value : [];
  };

  /** Picks a "...One" variant for a count of 1, e.g. "course.count" / "course.countOne". */
  t.count = (key: string, count: number): string => t(count === 1 ? `${key}One` : key, { count });

  return t;
}

export type Translate = ReturnType<typeof useTranslations>;

/** URL of a page in the given language, e.g. localizedPath('en', 'menu/main') -> "/en/menu/main/". */
export function localizedPath(lang: Lang, path = ''): string {
  return getRelativeLocaleUrl(lang, path);
}

/** Splits "/en/menu/main/" into the language and the language-independent rest ("menu/main/"). */
export function splitLocalePath(pathname: string): { lang: Lang | undefined; rest: string } {
  const [, first = '', ...rest] = pathname.split('/');
  return isLang(first) ? { lang: first, rest: rest.join('/') } : { lang: undefined, rest: pathname.replace(/^\//, '') };
}

/** The same page in every language, used for the language switcher and hreflang links. */
export function alternatesFor(pathname: string): Record<Lang, string> {
  const { rest } = splitLocalePath(pathname);
  return Object.fromEntries(languages.map((lang) => [lang, localizedPath(lang, rest)])) as Record<Lang, string>;
}

export function languageFromParams(value: string | undefined): Lang {
  if (!isLang(value)) throw new Error(`Unknown language "${value}"`);
  return value;
}

export function staticLanguagePaths() {
  return languages.map((lang) => ({ params: { lang } }));
}
