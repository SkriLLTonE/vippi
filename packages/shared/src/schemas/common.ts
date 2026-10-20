import { z } from 'zod';
import { LOCALES } from '../enums.js';

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const uuidSchema = z.uuid();
export const localeSchema = z.enum(LOCALES);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'invalid_email' }));

export const passwordSchema = z.string().min(10, { message: 'password_too_short' }).max(128);

/** YYYY-MM-DD (Asia/Tashkent calendar date) */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_date' });

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((v) => (PAGE_SIZES as readonly number[]).includes(v), { message: 'invalid_page_size' })
    .default(25),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Comma-separated list in query string → array of enum values. */
export function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)));
}

export const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
