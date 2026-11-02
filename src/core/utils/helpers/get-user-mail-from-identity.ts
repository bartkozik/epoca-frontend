// Structurally typed instead of `T extends Identity | SessionIdentity` — this only ever reads
// `.type`/`.value`, so it stays core-pure without needing either shape's full type. Widened from
// `type: IdentityType` to `type: string` because SessionIdentity's `type` is a raw wire value
// (the frontend's IdentityType enum has already drifted from the backend's, per the CT-544
// session/permission redesign's backend contract findings) — comparing against the literal
// 'MailAddress' string works identically either way. `value` is now `string | null` since
// SessionIdentity's value is genuinely nullable for some identity types.
export const getUserMailFromIdentity = <T extends { type: string; value: string | null }>(identities: T[]): string => {
  return identities.find(({ type }) => type === 'MailAddress')?.value ?? 'Unknown';
};
