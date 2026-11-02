import { z } from 'zod';
import { tolerantArray } from './tolerantArray.model';

// Keep the rest of a main list usable when one row is malformed; retain the server's total
// count for pagination even if validation omits a row from the visible results.
export const PaginatedResultSchema = <T>(
  itemSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): z.ZodType<{ count: number; results: T[] }, z.ZodTypeDef, unknown> =>
  z.object({
    count: z.number().int().nonnegative(),
    results: tolerantArray(itemSchema),
  });
