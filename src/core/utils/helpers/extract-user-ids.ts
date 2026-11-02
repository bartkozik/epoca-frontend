// Structurally typed instead of `User[]` — this only ever reads `.id`, so it stays core-pure
// without needing the module's full user shape.
export function extractUserIds(users: { id: string }[] | undefined): string[] {
  if (!users) return [];
  return users.map(({ id }) => id);
}
