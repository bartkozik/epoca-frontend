import UserInitialsAvatar from '@/core/theme/userInitialsAvatar';
import clsx from 'clsx';
import styles from './Avatar.module.scss';

interface AvatarProps<T> {
  className?: string;
  isNavbar?: boolean;
  user: T | undefined;
  isHiddenOnMobile?: boolean;
}

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
