import { DisplayableUser } from '@/core/theme/types';

export const getUserDisplayLabel = (user: DisplayableUser, fallback: string): string => {
  const label = [user.fullName, user.displayedName, user.email].find((value) => value?.trim());
  return label?.trim() || fallback;
};
