import { tolerantArray } from '@/core/models/tolerantArray.model';
import { z } from 'zod';

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

export const UserCreateResultSchema = z
  .object({
    user: RawUserSchema,
    recoveryCodes: tolerantArray(z.string()),
  })
  .strip();
export type UserCreateResult = z.infer<typeof UserCreateResultSchema>;
