import { z } from 'zod';
import { tolerantArray } from './tolerantArray.model';

export const PaginatedResultSchema = <T>(
  itemSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): z.ZodType<{ count: number; results: T[] }, z.ZodTypeDef, unknown> =>
  z.object({
    count: z.number().int().nonnegative(),
    results: tolerantArray(itemSchema),
  });
