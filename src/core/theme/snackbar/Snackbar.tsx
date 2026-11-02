import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './Snackbar.module.scss';

interface SnackbarProps {
  children: ReactNode;
  isVisible: boolean;
  className?: string;
  withToggleButton?: boolean;
  toggleButtonLabel?: string;
  disableToggleButton?: boolean;
}

function Snackbar({
  children,
  isVisible,
  className,
  withToggleButton = false,
  toggleButtonLabel,
  disableToggleButton = false,
}: SnackbarProps): JSX.Element {
  const { t } = useTranslation();
  const [isSnackbarVisible, setSnackbarVisible] = useState(withToggleButton ? false : isVisible);

  useEffect(() => {
    if (!withToggleButton) setSnackbarVisible(isVisible);
  }, [isVisible, withToggleButton]);

  useEffect(() => {
    if (disableToggleButton) setSnackbarVisible(false);
  }, [disableToggleButton]);

  const toggleSnackbar = (): void => {
    setSnackbarVisible((prevState) => !prevState);
  };

  const toggleButton = (
    <Button
      className={styles.toggleButton}
      startIcon={<Icon icon={icons.time} width={20} height={20} />}
      variant="contained"
      onClick={toggleSnackbar}
      label={toggleButtonLabel || t('common.show_snackbar')}
      disabled={disableToggleButton}
      startIconClassName={styles.buttonIcon}
      size="small"
    />
  );

  const snackbarContent = (
    <AnimatePresence>
      {isSnackbarVisible && (
        <motion.div
          className={clsx(styles.root, className, { [styles.hidden]: !isSnackbarVisible })}
          initial={{ y: '100%' }}
          animate={{ y: '0%' }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {withToggleButton && (
            <Icon className={styles.closeButton} icon={icons.x} width={14} height={14} onClick={toggleSnackbar} />
          )}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {withToggleButton && !isSnackbarVisible && toggleButton}
      {snackbarContent}
    </>
  );
}

export default Snackbar;
