export function createFullName<T extends { firstName: string; lastName: string }>({ firstName, lastName }: T): string {
  return `${firstName} ${lastName}`;
}
