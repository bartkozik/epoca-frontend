import { z } from 'zod';

// Validate an array where ONE malformed entry is dropped silently rather than invalidating the
// whole array (and everything that contains it) -- see CLAUDE.md's Zod conventions. Originally
// module-private in sessionSchema.ts (CT-540); hoisted here at CT-558 as the second module needing
// it, per CLAUDE.md's own note that it belongs in core/models.
//
// The generic constraint is `z.ZodType<T, z.ZodTypeDef, unknown>`, not the shorter `z.ZodType<T>`
// (whose Input defaults to T too) -- an entrySchema wrapping `.catch(...)` has actual Input
// `unknown`, and with the shorter form TypeScript infers T from the *input* side, silently
// producing an `unknown`-shot-through type at every field.
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
