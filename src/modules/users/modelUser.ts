import { createFullName, getUserMailFromIdentity } from '@/core/utils/helpers';
import { RawUser, User } from '@/modules/users/types';

export const toUser = (raw: RawUser, loggedInUserId: string | undefined): User => {
  const fullName = createFullName(raw);

  return {
    ...raw,
    archived: !!raw.archivedAt,
    displayedName: fullName,
    fullName,
    isLoggedInUser: raw.id === loggedInUserId,
    projects: [],
    email: getUserMailFromIdentity(raw.identities),
    name: fullName,
  };
};
