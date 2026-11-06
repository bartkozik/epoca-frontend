export function extractUserIds(users: { id: string }[] | undefined): string[] {
  if (!users) return [];
  return users.map(({ id }) => id);
}
