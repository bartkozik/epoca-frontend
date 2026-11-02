// CT-540: shared structural shape for the Avatars/UserInitialsAvatar/GroupedAvatars family and
// getUserDisplayLabel — narrower than any single module's full `User`/`OrganizationUser` entity,
// so core/theme stays free of a dependency on those modules while still accepting them (every
// module's user-like entity structurally satisfies this).
export interface DisplayableUser {
  avatar?: string;
  color?: string;
  displayedName?: string;
  email?: string;
  fullName: string;
  id: string;
  isLoggedInUser?: boolean;
}
