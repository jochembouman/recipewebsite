import { getCollection, type CollectionEntry } from 'astro:content';
import type { RecipeCardData } from '../components/RecipeCard.astro';
import { defaultLang, isLang, languages, locales, localizedPath, type Lang, type Translate } from '../i18n/utils';
import { tagGroups, type Course, type TagGroup } from './taxonomy';

export type RecipeEntry = CollectionEntry<'recipes'>;

export interface Recipe {
  slug: string;
  /** Language the page is shown in. */
  lang: Lang;
  /** Language of the content; differs from `lang` when a translation is missing. */
  contentLang: Lang;
  isFallback: boolean;
  entry: RecipeEntry;
}

function parseId(id: string): { slug: string; lang: Lang } {
  const [slug = '', lang] = id.split('/');
  if (!isLang(lang)) throw new Error(`Recipe "${id}" must be named nl.md or en.md`);
  return { slug, lang };
}

/** Drafts are visible in `npm run dev` only. Every page, list, search index and the sitemap goes through here. */
const isVisible = (entry: RecipeEntry) => import.meta.env.DEV || !entry.data.draft;

async function entriesBySlug(): Promise<Map<string, Partial<Record<Lang, RecipeEntry>>>> {
  const bySlug = new Map<string, Partial<Record<Lang, RecipeEntry>>>();
  for (const entry of await getCollection('recipes', isVisible)) {
    const { slug, lang } = parseId(entry.id);
    bySlug.set(slug, { ...bySlug.get(slug), [lang]: entry });
  }
  return bySlug;
}

/** The requested language if available, otherwise the default language, otherwise whatever exists. */
function pick(slug: string, versions: Partial<Record<Lang, RecipeEntry>>, lang: Lang): Recipe {
  const contentLang = [lang, defaultLang, ...languages].find((candidate) => versions[candidate]) as Lang;
  return { slug, lang, contentLang, isFallback: contentLang !== lang, entry: versions[contentLang]! };
}

/** All recipes for one language, newest first. */
export async function getRecipes(lang: Lang): Promise<Recipe[]> {
  const bySlug = await entriesBySlug();
  return [...bySlug]
    .map(([slug, versions]) => pick(slug, versions, lang))
    .sort((a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime());
}

export async function getRecipesByCourse(lang: Lang, course: Course | 'all'): Promise<Recipe[]> {
  const recipes = await getRecipes(lang);
  return course === 'all' ? recipes : recipes.filter((recipe) => recipe.entry.data.course === course);
}

export interface TagLabel {
  group: TagGroup;
  key: string;
  label: string;
}

/** Translated labels for all tags of a recipe, in a fixed group order. */
export function tagLabels(recipe: Recipe, t: Translate, locale: string): TagLabel[] {
  const { tags } = recipe.entry.data;
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
  return tagGroups.flatMap((group) =>
    tags[group].map((key) => ({
      group,
      key,
      label: group === 'country' ? (regionNames.of(key) ?? key) : t(`tags.${group}.${key}`),
    })),
  );
}

export function recipePath(recipe: Recipe): string {
  return localizedPath(recipe.lang, `recipes/${recipe.slug}`);
}

/** Everything a RecipeCard needs. */
export function toCardData(recipe: Recipe, t: Translate): RecipeCardData {
  const { data } = recipe.entry;
  return {
    href: recipePath(recipe),
    title: data.title,
    image: data.image,
    imageAlt: data.imageAlt,
    tags: tagLabels(recipe, t, locales[recipe.lang]).filter((tag) => tag.group !== 'occasion'),
    badge:
      [data.draft && t('recipe.draft'), recipe.isFallback && t(`recipe.inLanguage.${recipe.contentLang}`)]
        .filter(Boolean)
        .join(' · ') || undefined,
  };
}

/** "1 u 15 min", "45 min" */
export function formatMinutes(minutes: number, t: Translate): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t('time.minutes', { minutes: rest });
  if (rest === 0) return t('time.hours', { hours });
  return t('time.hoursMinutes', { hours, minutes: rest });
}
