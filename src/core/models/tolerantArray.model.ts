import { z } from 'zod';

export const tolerantArray = <T>(
  entrySchema: z.ZodType<T, z.ZodTypeDef, unknown>,
): z.ZodType<T[], z.ZodTypeDef, unknown> =>
  z
    .array(z.unknown())
    .catch([])
    .transform((entries) =>
      entries.flatMap((entry) => {
        const parsed = entrySchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      }),
    );
