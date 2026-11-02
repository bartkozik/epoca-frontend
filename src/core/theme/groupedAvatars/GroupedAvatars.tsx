import Icon, { icons } from '@/core/theme/icon';
import { DisplayableUser } from '@/core/theme/types';
import { useOnClickOutside } from '@/core/utils/hooks';
import { KeyboardEvent, MouseEvent, RefObject, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { getUserDisplayLabel } from './getUserDisplayLabel';
import styles from './GroupedAvatars.module.scss';

interface GroupedAvatarsProps<T extends DisplayableUser> {
  className?: string;
  fallbackFocusRef?: RefObject<HTMLButtonElement>;
  items: T[];
  onItemDelete?: (item: T) => void;
}

const GroupedAvatars = <T extends DisplayableUser>({
  className,
  fallbackFocusRef,
  items,
  onItemDelete,
}: GroupedAvatarsProps<T>): JSX.Element => {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const closeAndRestoreToggleFocus = (): void => {
    setIsDropdownOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const handleRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !isDropdownOpen) return;

    event.preventDefault();
    event.stopPropagation();
    closeAndRestoreToggleFocus();
  };

  const handleItemDelete = (event: MouseEvent<HTMLButtonElement>, item: T): void => {
    event.stopPropagation();
    const removesLastGroupedItem = items.length === 1;

    onItemDelete?.(item);

    if (removesLastGroupedItem) requestAnimationFrame(() => fallbackFocusRef?.current?.focus());
  };

  useOnClickOutside({
    ref: dropdownRef,
    handler: () => setIsDropdownOpen(false),
  });

  return (
    <div ref={dropdownRef} className={clsx(styles.root, className)} onKeyDown={handleRootKeyDown}>
      <button
        ref={toggleRef}
        aria-controls={panelId}
        aria-expanded={isDropdownOpen}
        aria-label={t('projects.project_user_search.action.show_grouped_users', { count: items.length })}
        className={styles.avatar}
        onClick={() => setIsDropdownOpen((isOpen) => !isOpen)}
        type="button"
      >
        <span className={styles.initials}>+{items.length}</span>
      </button>
      {isDropdownOpen && (
        <div id={panelId} className={styles.dropdownContent}>
          <ul className={styles.dropdownMenuList}>
            {items.map((item) => {
              const label = getUserDisplayLabel(item, t('projects.project_user_search.text.unnamed_user'));

              return (
                <li key={item.id} className={styles.dropdownMenuListItem}>
                  <span className={styles.userLabel}>{label}</span>
                  {item.isLoggedInUser ? (
                    <span
                      aria-label={t('projects.project_user_search.status.logged_in_owner_protected')}
                      className={styles.protectedOwner}
                      role="img"
                    >
                      <span aria-hidden="true">
                        <Icon icon={icons.secure} width={16} height={16} />
                      </span>
                    </span>
                  ) : (
                    <button
                      aria-label={t('projects.project_user_search.action.remove_user', { name: label })}
                      className={styles.removeButton}
                      onClick={(event) => handleItemDelete(event, item)}
                      type="button"
                    >
                      <Icon icon={icons.x} width={10} height={10} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GroupedAvatars;
