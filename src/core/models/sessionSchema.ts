import { z } from 'zod';
import { tolerantArray } from './tolerantArray.model';

const roleWireValueSchema = z.string().min(1);

const organizationRoleGrantSchema = z
  .object({
    organizationId: z.string().min(1),
    roles: tolerantArray(roleWireValueSchema),
  })
  .passthrough();

const sessionIdentitySchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
    value: z.string().nullable().catch(null),
    deviceId: z.string().nullable().catch(null),
    main: z.boolean().catch(false),
  })
  .passthrough();

const authedByEntrySchema = z
  .object({
    type: z.string().min(1),
    id: z.string().nullable().catch(null),
  })
  .passthrough();

const sessionUserSchema = z
  .object({
    id: z.string().min(1),
    exp: z.number().finite(),
    isSuperAdmin: z.boolean().catch(false),
    identities: tolerantArray(sessionIdentitySchema),
    authedBy: tolerantArray(authedByEntrySchema),
    roles: tolerantArray(organizationRoleGrantSchema),
    organizationGrants: tolerantArray(organizationRoleGrantSchema).optional(),
  })
  .passthrough()
  .transform(({ roles, organizationGrants, ...rest }) => ({
    ...rest,
    // Malformed organizationGrants deny access; never fall back to potentially stale roles.
    organizationGrants: organizationGrants ?? roles,
  }));

export const sessionSchema = z
  .object({
    token: z.string().min(1),
    user: sessionUserSchema,
  })
  .passthrough();
