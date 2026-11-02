import Button from '@/core/theme/button';
import GroupedAvatars from '@/core/theme/groupedAvatars';
import Label from '@/core/theme/label';
import { DisplayableUser } from '@/core/theme/types';
import UserInitialsAvatar from '@/core/theme/userInitialsAvatar';
import { RefObject } from 'react';
import clsx from 'clsx';
import styles from './Avatars.module.scss';

interface AvatarsProps<T extends DisplayableUser> {
  addButtonRef?: RefObject<HTMLButtonElement>;
  buttonDisabled?: boolean;
  className?: string;
  items: T[];
  infoText?: string;
  label?: string;
  maxDisplayedItemsLength?: number;
  onAddItem?: () => void;
  onItemDelete?: (item: T) => void;
}

const Avatars = <T extends DisplayableUser>({
  addButtonRef,
  buttonDisabled,
  className,
  items = [],
  infoText = '',
  label,
  maxDisplayedItemsLength = 4,
  onAddItem,
  onItemDelete,
}: AvatarsProps<T>): JSX.Element => {
  const displayedItems = items.length > maxDisplayedItemsLength ? items.slice(0, maxDisplayedItemsLength) : items;
  const groupedItems = items.length > maxDisplayedItemsLength ? items.slice(maxDisplayedItemsLength) : [];

  return (
    <div className={clsx(styles.root, className)}>
      {label && <Label className={styles.label} label={label} name={label} infoText={infoText} />}
      <div className={styles.avatarsBox}>
        {displayedItems.map((item) => (
          <UserInitialsAvatar
            key={item.id}
            withDelete={!item.isLoggedInUser}
            className={clsx(styles.avatar, { [styles.avatarDefault]: item.isLoggedInUser })}
            item={item}
            onDeleteClick={item.isLoggedInUser ? undefined : onItemDelete}
          />
        ))}
        {groupedItems.length > 0 && (
          <GroupedAvatars
            className={styles.groupedAvatars}
            fallbackFocusRef={addButtonRef}
            items={groupedItems}
            onItemDelete={onItemDelete}
          />
        )}
        <Button
          className={styles.addMemberButton}
          disabled={buttonDisabled}
          label="+"
          onClick={onAddItem}
          size="smallRound"
          variant="contained"
          forwardedRef={addButtonRef}
        />
      </div>
    </div>
  );
};

export default Avatars;
