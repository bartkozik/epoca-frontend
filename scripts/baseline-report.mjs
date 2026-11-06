import { z } from 'zod';

const baselineReportSchema = z.object({
  numTotalTestSuites: z.number().int().positive(),
  numTotalTests: z.number().int().positive(),
  snapshot: z.object({ total: z.number().int().nonnegative() }),
});

/** @param {string} json */
export const parseBaselineReport = (json) => baselineReportSchema.parse(JSON.parse(json));
