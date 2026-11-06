import { z } from 'zod';

export const ProblemDetailSchema = z.object({ type: z.string() }).strip();

export const RetryAfterSecondsSchema = z.union([
  z.number().int().nonnegative().safe(),
  z
    .string()
    .regex(/^(0|[1-9]\d{0,14})$/)
    .transform(Number),
]);
export const RetryAfterDecimalSchema = z.string().regex(/^\d+$/).transform(Number);
