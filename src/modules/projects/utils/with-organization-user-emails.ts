export function withOrganizationUserEmails<T extends { id: string; email?: string }>(
  users: T[],
  organizationUsers: { id: string; email: string }[],
): (T & { email?: string })[] {
  const emails = new Map(organizationUsers.map(({ id, email }) => [id, email]));
  return users.map((user) => ({ ...user, email: user.email || emails.get(user.id) }));
}
