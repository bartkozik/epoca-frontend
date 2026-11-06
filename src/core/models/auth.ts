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
