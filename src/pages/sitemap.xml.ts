import type { APIRoute } from 'astro';
import { defaultLang, languages, localizedPath } from '../i18n/utils';
import { getRecipes } from '../lib/recipes';
import { courses } from '../lib/taxonomy';

/** Builds sitemap.xml with every page in both languages, linked to its translations. */
export const GET: APIRoute = async ({ site }) => {
  const absolute = (path: string) => new URL(path, site).href;
  const recipes = await getRecipes(defaultLang);

  const paths = [
    '',
    'about',
    ...[...courses, 'all'].map((course) => `menu/${course}`),
    ...recipes.map((recipe) => `recipes/${recipe.slug}`),
  ];
  const lastModified = new Map(recipes.map((recipe) => [`recipes/${recipe.slug}`, recipe.entry.data.date]));

  const urls = paths.flatMap((path) =>
    languages.map((lang) => {
      const alternates = languages
        .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${absolute(localizedPath(alt, path))}"/>`)
        .join('\n');
      const date = lastModified.get(path);
      const lastmod = date ? `\n    <lastmod>${date.toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url>\n    <loc>${absolute(localizedPath(lang, path))}</loc>${lastmod}\n${alternates}\n  </url>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
