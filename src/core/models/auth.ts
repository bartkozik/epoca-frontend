// CT-540: hoisted out of modules/auth/types.ts. modules/auth/types.ts re-exports these so every
// existing import site keeps working unchanged. Auth/AuthUser (the old session shape) were
// removed here as part of the CT-544 session/permission redesign -- see
// core/models/session.ts/sessionSchema.ts for their replacement (Session/SessionUser).
export interface QueuedAccessTokenRequest {
  reject: (reason: Error) => void;
  resolve: (accessToken: string) => void;
}

export enum IdentityType {
  AdminImpersonate = 'AdminImpersonate',
  AuthenticationApp = 'AuthenticationApp',
  MailAddress = 'MailAddress',
  Phone = 'Phone',
}

export interface Identity {
  deviceId: string | null;
  id: string;
  main: boolean;
  type: IdentityType;
  value: string;
}
