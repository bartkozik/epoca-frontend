export const userQueryKey = (userId: string): readonly [string, string] => ['user', userId] as const;

export const usersQueryKey = (): readonly [string] => ['users'] as const;
