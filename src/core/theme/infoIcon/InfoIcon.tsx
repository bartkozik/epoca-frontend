import Tooltip from '@/core/theme/tooltip';
import clsx from 'clsx';
import styles from './InfoIcon.module.scss';

interface InfoIconProps {
  tooltipText: string;
  iconClassName?: string;
  isClickable?: boolean;
}

const InfoIcon = ({ isClickable = false, tooltipText = '', iconClassName }: InfoIconProps): JSX.Element => (
  <Tooltip className={styles.root} content={tooltipText}>
    <span className={clsx(styles.icon, iconClassName, { [styles.isClickable]: isClickable })}>i</span>
  </Tooltip>
);

export default InfoIcon;
