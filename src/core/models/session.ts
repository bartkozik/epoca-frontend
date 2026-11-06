export type RoleWireValue = string;

export interface OrganizationRoleGrant {
  organizationId: string;
  roles: RoleWireValue[];
}

export interface SessionIdentity {
  type: string;
  id: string;
  value: string | null;
  deviceId: string | null;
  main: boolean;
}

export interface SessionUser {
  id: string;
  exp: number;
  identities: SessionIdentity[];
  isSuperAdmin: boolean;
  authedBy: { type: string; id: string | null }[];
  organizationGrants: OrganizationRoleGrant[];
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
