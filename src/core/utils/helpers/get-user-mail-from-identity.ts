export const getUserMailFromIdentity = <T extends { type: string; value: string | null }>(identities: T[]): string => {
  return identities.find(({ type }) => type === 'MailAddress')?.value ?? 'Unknown';
};
