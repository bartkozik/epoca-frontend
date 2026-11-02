import { CanonicalUuidSchema } from '@/core/models/canonicalUuid.model';
import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { z } from 'zod';
import { InvitationRevisionSchema } from './invitationRevision.model';

export const InvitationDtoSchema = z
  .object({
    id: CanonicalUuidSchema,
    // V1 history may contain a phone identity. Validate email only on new requests.
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    roles: z.array(z.string()),
    protocolVersion: z.number().int(),
    revision: InvitationRevisionSchema,
    status: z.string(),
    expiresAt: UtcTimestampSchema.nullable(),
    delivery: z
      .object({
        status: z.string(),
        lastAttemptAt: UtcTimestampSchema.nullable(),
        retryAfterSeconds: z.number().int().nonnegative(),
      })
      .strip(),
    createdAt: UtcTimestampSchema,
    modifiedAt: UtcTimestampSchema,
  })
  .strip();
export type InvitationDto = z.infer<typeof InvitationDtoSchema>;
