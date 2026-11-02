import { z } from 'zod';
import { tolerantArray } from './tolerantArray.model';

// tolerantArray (core/models/tolerantArray.model.ts) is used for organization grants, each
// grant's own role list, and identities alike below -- tolerance is applied uniformly at every
// level of nesting, not just the outermost one.
const roleWireValueSchema = z.string().min(1);

const organizationRoleGrantSchema = z
  .object({
    organizationId: z.string().min(1),
    roles: tolerantArray(roleWireValueSchema), // one bad role value drops only that value, not the org
  })
  .passthrough();

const sessionIdentitySchema = z
  .object({
    type: z.string().min(1), // wire value kept verbatim -- see SessionIdentity's own comment
    id: z.string().min(1),
    value: z.string().nullable().catch(null), // genuinely nullable -- see SessionIdentity's comment
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
    id: z.string().min(1), // structural core — reject the session if absent
    exp: z.number().finite(), // structural core — reject the session if absent (the backend has
    // emitted this on every observed token; verified deliberately)
    isSuperAdmin: z.boolean().catch(false), // fail closed on malformed/missing
    identities: tolerantArray(sessionIdentitySchema),
    authedBy: tolerantArray(authedByEntrySchema),
    roles: tolerantArray(organizationRoleGrantSchema), // wire format: present on a freshly-decoded
    organizationGrants: tolerantArray(organizationRoleGrantSchema).optional(),
  })
  .passthrough()
  .transform(({ roles, organizationGrants, ...rest }) => ({
    ...rest,
    // organizationGrants always wins when present, even if malformed (tolerantArray resolves a
    // malformed-but-present organizationGrants to [], not undefined, so `?? roles` never reaches
    // roles in that case either) -- deliberate, matching this schema's fail-closed-on-malformed
    // philosophy everywhere else (see isSuperAdmin/authedBy above): a corrupted organizationGrants
    // denies access, it does not fall back to a possibly-stale roles value.
    organizationGrants: organizationGrants ?? roles,
  }));

export const sessionSchema = z
  .object({
    token: z.string().min(1),
    user: sessionUserSchema,
  })
  .passthrough(); // a future top-level field must not be silently stripped, same rationale as
// every nested schema above
