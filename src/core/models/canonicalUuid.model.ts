import { z } from 'zod';

export const CanonicalUuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase(), {
    message: 'UUID must be canonical lowercase',
  });

export type CanonicalUuid = z.infer<typeof CanonicalUuidSchema>;
