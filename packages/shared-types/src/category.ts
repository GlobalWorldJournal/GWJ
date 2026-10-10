import { z } from 'zod';

export const CATEGORIES = [
  'World',
  'Business',
  'Markets',
  'Tech',
  'Politics',
  'Opinion',
  'Arts',
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CategoryDocSchema = z.object({
  slug: z.string(),
  name: CategorySchema,
  order: z.number().int().min(0),
});
export type CategoryDoc = z.infer<typeof CategoryDocSchema>;

export function categorySlug(name: Category): string {
  return name.toLowerCase();
}
