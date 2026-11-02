import Icon, { icons } from '@/core/theme/icon';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useToast } from '../ToastProvider';
import { ToastType } from '../types';
import styles from './Toast.module.scss';

interface ToastProps {
  children: React.ReactNode;
  id: string;
  timeout?: number;
  type?: ToastType;
}

const ICON_MAP = {
  error: icons.sad,
  success: icons.tick,
  warning: icons.warning,
  info: icons.info,
};

const Toast = ({ children, id, timeout = 3000, type = 'success' }: ToastProps): JSX.Element => {
  const { t } = useTranslation();

  const { removeToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), timeout);
    return () => clearTimeout(timer);
  }, [id, removeToast, timeout]);

  return (
    <div className={clsx(styles.root, styles[type])}>
      <div className={clsx(styles.icon, styles[`icon-${type}`])}>
        <Icon icon={ICON_MAP[type]} width={19} height={19} />
      </div>
      <div className={styles.textContainer}>
        <span className={clsx(styles.label, styles.text)}>{t(`${type}`)}</span>
        <div className={clsx(styles.childrenContainer, styles.text)}>{children}</div>
      </div>
      <Icon icon={icons.cross} width={12} height={12} className={styles.closeIcon} onClick={() => removeToast(id)} />
    </div>
  );
};

export default Toast;
