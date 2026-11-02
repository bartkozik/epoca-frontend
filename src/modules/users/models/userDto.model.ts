import { tolerantArray } from '@/core/models/tolerantArray.model';
import { z } from 'zod';

// `type` is a raw wire value, not `z.nativeEnum(IdentityType)` -- the backend's identity types have
// already drifted from the frontend enum (see sessionSchema.ts's identical field and
// getUserMailFromIdentity's comment), so an enum check would wrongly drop legitimate values.
// `value` stays required (no `.catch()`) since a non-string value is worse than dropping the entry.
export const UserIdentitySchema = z.object({
  confirmationCode: z.string().nullable().catch(null),
  confirmed: z.boolean().catch(false),
  createdAt: z.string().catch(''),
  id: z.string().catch(''),
  main: z.boolean().catch(false),
  type: z.string().min(1),
  userId: z.string().catch(''),
  value: z.string(),
});

// id is the user's identity (list keys, isLoggedInUser, selectedUser matching) -- throw rather than
// silently render a broken user. Everything else here is tolerant/non-load-bearing.
// .strip() (not .passthrough()) so an unrecognized wire field can't sneak an index signature onto
// the `User` type app-wide, matching clientDto.model.ts's convention.
export const RawUserSchema = z
  .object({
    archivedAt: z.string().catch(''),
    avatar: z.string().catch(''),
    color: z.string().catch(''),
    createdAt: z.string().catch(''),
    firstName: z.string().catch(''),
    id: z.string().min(1),
    identities: tolerantArray(UserIdentitySchema),
    isSuperAdmin: z.boolean().catch(false),
    lastName: z.string().catch(''),
    modifiedAt: z.string().catch(''),
  })
  .strip();

export const RawUsersSchema = tolerantArray(RawUserSchema);

// POST /users returns a wrapper, not a bare user -- recoveryCodes isn't consumed by any caller
// yet, so it's validated tolerantly (dropping a malformed entry) rather than made load-bearing.
export const UserCreateResultSchema = z
  .object({
    user: RawUserSchema,
    recoveryCodes: tolerantArray(z.string()),
  })
  .strip();
export type UserCreateResult = z.infer<typeof UserCreateResultSchema>;
