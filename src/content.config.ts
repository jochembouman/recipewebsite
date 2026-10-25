import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { courses, diets, occasions, proteins, servingUnits } from './lib/taxonomy';

/** Accepts 200, 1.5, "1,5", "1/2" or "1 1/2" and turns it into a number. */
function parseAmount(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim().replace(',', '.');
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(text);
  return Number.isNaN(number) ? value : number;
}

const amount = z.preprocess(
  parseAmount,
  z
    .number({ error: 'amount moet een getal zijn, bijv. 200, 1.5 of "1/2". Laat weg voor "naar smaak".' })
    .positive({ error: 'amount moet groter dan 0 zijn.' }),
);

const ingredient = z.strictObject({
  amount: amount.optional(),
  unit: z.string().optional(),
  name: z.string({ error: 'Elk ingrediënt heeft een name nodig.' }).min(1),
  note: z.string().optional(),
});

const ingredientGroup = z.strictObject({
  group: z.string().optional(),
  items: z.array(ingredient).min(1, { error: 'Een ingrediëntengroep heeft minstens één item nodig.' }),
});

const enumList = <T extends readonly [string, ...string[]]>(values: T, field: string) =>
  z
    .array(z.enum(values, { error: `Onbekende waarde in ${field}. Kies uit: ${values.join(', ')}.` }))
    .default([]);

const knownRegions = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const country = z
  .string()
  .transform((code) => code.trim().toUpperCase())
  .refine((code) => /^[A-Z]{2}$/.test(code) && knownRegions.of(code) !== undefined, {
    error: 'country gebruikt ISO-landcodes van twee letters, bijv. NL, IT, JP.',
  });

const rating = z
  .number({ error: 'Een rating is een getal van 1 tot 5.' })
  .min(1, { error: 'Een rating is minimaal 1.' })
  .max(5, { error: 'Een rating is maximaal 5.' })
  .multipleOf(0.5, { error: 'Ratings gaan in stappen van 0.5 (bijv. 3.5).' });

const servings = z.strictObject({
  amount: z.number().int().positive({ error: 'servings.amount is een heel getal groter dan 0.' }),
  unit: z.enum(servingUnits, { error: `servings.unit moet een van deze zijn: ${servingUnits.join(', ')}.` }),
});

const recipes = defineCollection({
  loader: glob({
    base: './src/content/recepten',
    pattern: '*/{nl,en}.md',
    // "pasta-pesto/nl.md" -> "pasta-pesto/nl"
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: ({ image }) =>
    z
      .strictObject({
        title: z.string().min(1),
        // Drafts only show up in `npm run dev`, never in a production build.
        draft: z.boolean().default(false),
        description: z.string().optional(),
        course: z.enum(courses, { error: `course moet een van deze zijn: ${courses.join(', ')}.` }),
        date: z.coerce.date({ error: 'date moet een datum zijn, bijv. 2026-10-25.' }),
        servings: servings.optional(),
        prepTime: z.number().int().nonnegative().optional(),
        cookTime: z.number().int().nonnegative().optional(),
        ingredients: z.array(ingredientGroup).default([]),
        equipment: z.array(z.string()).default([]),
        note: z.string().optional(),
        image: image().optional(),
        imageAlt: z.string().min(1, { error: 'imageAlt beschrijft de foto voor wie hem niet kan zien.' }).optional(),
        source: z
          .strictObject({
            label: z.string().min(1),
            url: z.url({ error: 'source.url moet een volledige link zijn (https://...).' }).optional(),
          })
          .optional(),
        tags: z
          .strictObject({
            diet: enumList(diets, 'tags.diet'),
            protein: enumList(proteins, 'tags.protein'),
            occasion: enumList(occasions, 'tags.occasion'),
            country: z.array(country).default([]),
          })
          .prefault({}),
        ratings: z
          .strictObject({
            easeOfCooking: rating.optional(),
            tokoFactor: rating.optional(),
            jochem: rating.optional(),
            anna: rating.optional(),
          })
          .prefault({}),
      })
      // A draft may still be incomplete; a published recipe may not.
      .superRefine((data, ctx) => {
        if (data.draft) return;
        const required: Array<[keyof typeof data, string]> = [
          ['servings', 'servings is verplicht, bijv. { amount: 4, unit: persons }.'],
          ['image', 'image is verplicht, bijv. ./foto.jpg.'],
          ['imageAlt', 'imageAlt beschrijft de foto voor wie hem niet kan zien.'],
        ];
        for (const [field, message] of required) {
          if (data[field] === undefined) ctx.addIssue({ code: 'custom', path: [field], message });
        }
        if (data.ingredients.length === 0) {
          ctx.addIssue({ code: 'custom', path: ['ingredients'], message: 'Voeg minstens één ingrediënt toe.' });
        }
      }),
});

export const collections = { recipes };
