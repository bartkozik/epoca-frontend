import Icon, { icons } from '@/core/theme/icon';
import Spinner from '@/core/theme/spinner';
import { DisplayableUser } from '@/core/theme/types';
import { useGravatarUrl } from '@/core/utils/hooks/useGravatarUrl';
import { useState } from 'react';
import clsx from 'clsx';
import styles from './UserInitialsAvatar.module.scss';

const INITIALS_LENGTH = 3;

interface UserInitialsAvatarProps<T extends DisplayableUser> {
  className?: string;
  item: T;
  onDeleteClick?: (item: T) => void;
  withDelete?: boolean;
}

const UserInitialsAvatarContent = <T extends DisplayableUser>({
  className,
  item,
  onDeleteClick,
  withDelete,
}: UserInitialsAvatarProps<T>): JSX.Element => {
  const { url: gravatarUrl, isLoading: isGravatarLoading } = useGravatarUrl(item.email);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSource, setLoadedSource] = useState<string>();
  const imageSrc = [item.avatar?.trim(), gravatarUrl].find((src) => src && !failedSources.includes(src));

  const initials = item.fullName
    .split(' ')
    .slice(0, INITIALS_LENGTH)
    .map((word) => word[0])
    .join('');

  const showImage = Boolean(imageSrc);
  const isImageLoaded = Boolean(imageSrc && loadedSource === imageSrc);
  const isLoading = showImage ? !isImageLoaded : isGravatarLoading;
  const itemColorStyle = { backgroundColor: !isImageLoaded && item.color ? item.color : '' };
  const canDelete = Boolean(withDelete && onDeleteClick);

  return (
    <div
      aria-busy={isLoading}
      className={clsx(styles.root, className, { [styles.withDelete]: canDelete })}
      onClick={canDelete ? () => onDeleteClick?.(item) : undefined}
      style={itemColorStyle}
    >
      {showImage && (
        <img
          key={imageSrc}
          alt={item.fullName}
          className={clsx(styles.avatarImage, { [styles.imageLoading]: !isImageLoaded })}
          loading="lazy"
          onLoad={() => setLoadedSource(imageSrc)}
          onError={() => {
            if (imageSrc) setFailedSources((sources) => [...sources, imageSrc]);
          }}
          referrerPolicy="no-referrer"
          src={imageSrc}
        />
      )}
      <Spinner className={styles.loader} loading={isLoading} small white />
      {!showImage && !isLoading && <span className={clsx(styles.initials)}>{initials}</span>}
      {canDelete && <Icon icon={icons.x} width={12} height={12} className={styles.closeButton} />}
    </div>
  );
};

// A different user or source starts a fresh image attempt; failed URLs never leak into the next user.
const UserInitialsAvatar = <T extends DisplayableUser>(props: UserInitialsAvatarProps<T>): JSX.Element => (
  <UserInitialsAvatarContent {...props} key={JSON.stringify([props.item.id, props.item.avatar, props.item.email])} />
);

export default UserInitialsAvatar;
