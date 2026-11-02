import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import { useOnClickOutside } from '@/core/utils/hooks';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './MoreInfoDropdown.module.scss';

interface MoreInfoDropdownItem {
  label: string;
  value: string | undefined | JSX.Element;
}

interface MoreInfoDropdownProps {
  items: MoreInfoDropdownItem[];
  children?: React.ReactNode;
  className?: string;
}

const MoreInfoDropdown = ({ className, items, children }: MoreInfoDropdownProps): JSX.Element => {
  const { t } = useTranslation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const toggleMoreList = (): void => {
    setIsMoreOpen(!isMoreOpen);
  };

  useOnClickOutside({
    ref: dropdownRef,
    handler: () => setIsMoreOpen(false),
  });

  return (
    <div className={clsx(styles.root, className)} ref={dropdownRef}>
      <Button label={t('common.more')} variant="text" size="medium" onClick={toggleMoreList} />
      <Icon icon={icons.arrow} width={12} height={8} className={clsx(styles.icon, { [styles.arrow]: isMoreOpen })} />
      {isMoreOpen && (
        <div className={styles.moreListContent}>
          <div aria-label={t('common.more')} className={styles.moreListItems} role="group">
            {children}
            <ul>
              {items.map(({ label, value }) => (
                <li key={label}>
                  <span>{label}: </span>
                  {value}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoreInfoDropdown;
