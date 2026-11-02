// src/core/models/session.ts
export type RoleWireValue = string; // exactly what the JWT carries — deliberately NOT the OrganizationUserRole enum

export interface OrganizationRoleGrant {
  organizationId: string;
  roles: RoleWireValue[];
}

export interface SessionIdentity {
  type: string; // wire value, deliberately NOT the frontend's IdentityType enum -- CT-544 found
  // that enum has already drifted from the backend's real identity-type values
  // (the frontend is missing Saml/CryptoVerification/TimeBasedOneTimePassword and
  // has one, AuthenticationApp, the backend never sends), proving "strictly
  // validate this wire enum and reject/drop on mismatch" fails in this codebase
  id: string; // never null on the backend (UserIdentityShortDto.id is non-Optional)
  value: string | null; // null for identity types whose IdentityType.revealValue is false
  // (CryptoVerification, AdminImpersonate, TimeBasedOneTimePassword) --
  // NOT for Saml, whose revealValue is true
  deviceId: string | null;
  main: boolean;
}

export interface SessionUser {
  id: string;
  exp: number;
  identities: SessionIdentity[];
  isSuperAdmin: boolean;
  authedBy: { type: string; id: string | null }[];
  organizationGrants: OrganizationRoleGrant[]; // renamed from the wire `roles` deliberately: the
  // pre-CT-544 session types' in-memory vs. serialized
  // `roles` fields had one name meaning two incompatible
  // shapes; giving this its own name ends that ambiguity
  // for good.
}

export interface Session {
  token: string;
  user: SessionUser;
}

export interface LoggedInUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
}
