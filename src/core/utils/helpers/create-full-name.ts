// Structurally typed instead of `T extends OrganizationUser | RawOrganizationUser |
// RawProjectUser | RawUser` — this only ever reads `.firstName`/`.lastName`, so it stays
// core-pure without needing any module's full user shape.
export function createFullName<T extends { firstName: string; lastName: string }>({ firstName, lastName }: T): string {
  return `${firstName} ${lastName}`;
}
