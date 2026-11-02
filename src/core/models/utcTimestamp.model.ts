import { z } from 'zod';

export const UtcTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/)
  .datetime({ offset: false });

export type UtcTimestamp = z.infer<typeof UtcTimestampSchema>;
