import { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './Hamburger.module.scss';

interface HamburgerProps {
  isOpen: boolean;
  toggle: () => void;
  buttonRef: Ref<HTMLButtonElement> | null;
}

function Hamburger({ isOpen, toggle, buttonRef }: HamburgerProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <button
      aria-label={t('common.menu')}
      className={clsx(styles.root, { [styles.hamburgerActive]: isOpen })}
      onClick={toggle}
      ref={buttonRef}
    >
      <div className={styles.hamburgerBox}>
        <div className={styles.hamburgerInner}></div>
      </div>
    </button>
  );
}

export default Hamburger;
