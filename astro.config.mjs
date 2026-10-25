import { defineConfig } from 'astro/config';

export default defineConfig({
  // Public URL of the site; used for the sitemap, canonical links and Open Graph images.
  // Override with the SITE_URL environment variable (e.g. in Vercel) once the domain is known.
  site: process.env.SITE_URL ?? 'https://ja-recipes.vercel.app',
  output: 'static',
  i18n: {
    defaultLocale: 'nl',
    locales: ['nl', 'en'],
    routing: {
      prefixDefaultLocale: true,
      // The root redirect is handled by src/pages/index.astro (and vercel.json).
      redirectToDefaultLocale: false,
    },
  },
});
