import { z } from 'zod';

const ProblemSchema = z
  .object({
    response: z
      .object({
        status: z.number(),
        data: z.unknown(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const ProblemBodySchema = z.object({
  type: z.string().optional().catch(undefined),
  extension: z
    .object({ field: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

export function overrideProblem(error: unknown): {
  status: number | undefined;
  kind: string | undefined;
  field: string | undefined;
} {
  const parsed = ProblemSchema.safeParse(error);
  const response = parsed.success ? parsed.data.response : undefined;
  const body = ProblemBodySchema.safeParse(response?.data);
  const type = body.success ? body.data.type : undefined;
  return {
    status: response?.status,
    kind: type?.startsWith('result:work-unit-override:') ? type.slice('result:work-unit-override:'.length) : undefined,
    field: body.success ? body.data.extension?.field : undefined,
  };
}

export function isTerminalOverrideProblem(error: unknown): boolean {
  const { kind, status } = overrideProblem(error);
  return status === 403 || kind === 'work-unit-not-found' || (status === 404 && kind !== 'project-not-found');
}
