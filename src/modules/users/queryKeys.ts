export const userQueryKey = (userId: string): readonly [string, string] => ['user', userId] as const;

// Flat, entity-prefixed key (this repo's tanstack query convention) -- unparameterized since
// /users has no per-organization or per-filter scoping, unlike clients' clientsQueryKey.
export const usersQueryKey = (): readonly [string] => ['users'] as const;
