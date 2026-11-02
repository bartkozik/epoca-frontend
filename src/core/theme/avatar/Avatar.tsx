import UserInitialsAvatar from '@/core/theme/userInitialsAvatar';
import clsx from 'clsx';
import styles from './Avatar.module.scss';

interface AvatarProps<T> {
  className?: string;
  isNavbar?: boolean;
  user: T | undefined;
  isHiddenOnMobile?: boolean;
}

// Structurally typed instead of `T extends SessionUser | User | OrganizationUser` — this only ever
// reads `.email`/`.fullName`/`.avatar`/`.color`/`.id`, so it stays core-pure without needing any
// module's full user shape. All fields are optional: a caller whose user shape genuinely lacks one
// (e.g. a project member who only ever carries a name on the wire) can pass its user as-is instead
// of faking one.
const Avatar = <T extends { avatar?: string; color?: string; email?: string; fullName?: string; id?: string }>({
  className,
  isNavbar,
  user,
  isHiddenOnMobile,
}: AvatarProps<T>): JSX.Element | null => {
  if (!user) return null;

  const displayUserName = (): string => {
    return user.fullName ?? user.email ?? '';
  };

  return (
    <div className={clsx(styles.root, className)}>
      <UserInitialsAvatar
        className={clsx(styles.avatar, { [styles.avatarNavbar]: isNavbar })}
        item={{
          avatar: user.avatar,
          email: user.email,
          color: user.color,
          fullName: displayUserName(),
          id: user.id ?? '',
        }}
      />
      <span
        className={clsx(
          styles.userName,
          { [styles.userNameNavbar]: isNavbar },
          { [styles.mobileHidden]: isHiddenOnMobile },
        )}
      >
        {displayUserName()}
      </span>
    </div>
  );
};

export default Avatar;
