// Fixed keys used in recipe frontmatter. Labels live in src/i18n/*.json.
// Adding a value here also requires a label in every translation file.

export const courses = ['starter', 'main', 'dessert', 'side-salad', 'preserves-dips', 'breakfast-lunch'] as const;
export type Course = (typeof courses)[number];

export const diets = ['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free'] as const;

export const proteins = [
  'chicken',
  'beef',
  'pork',
  'lamb',
  'duck',
  'fish',
  'seafood',
  'tofu',
  'tempeh',
  'seitan',
  'egg',
  'legumes',
  'cheese',
  'nuts',
] as const;

export const occasions = [
  'weeknight',
  'weekend',
  'party',
  'holiday',
  'picnic',
  'meal-prep',
  'comfort',
] as const;

/** What `servings.amount` counts: 4 persons, 30 pieces, 10 bowls … */
export const servingUnits = ['persons', 'portions', 'pieces', 'bowls', 'jars', 'loaves', 'scoops', 'skewers'] as const;
export type ServingUnit = (typeof servingUnits)[number];

export const tagGroups = ['diet', 'protein', 'occasion', 'country'] as const;
export type TagGroup = (typeof tagGroups)[number];

export const ratingKeys = ['easeOfCooking', 'tokoFactor', 'jochem', 'anna'] as const;
export type RatingKey = (typeof ratingKeys)[number];
