import Button from '@/core/theme/button';
import Spinner from '@/core/theme/spinner';
import clsx from 'clsx';
import styles from './ButtonGroup.module.scss';

type ButtonGroupType = {
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

interface ButtonGroupProps {
  buttons: ButtonGroupType[];
  activeButton: string | undefined;
  className?: string;
}

const ButtonGroup = ({ className, buttons, activeButton }: ButtonGroupProps): JSX.Element | null => {
  if (!activeButton) return null;

  return (
    <div className={clsx(styles.root, className)}>
      {buttons.map(({ value, label, onClick, disabled, loading }, index) => {
        const isActive = activeButton === value;
        const isFirst = index === 0;
        const isLast = index === buttons.length - 1;
        const isMiddle = !isFirst && !isLast;

        return (
          <Button
            key={value}
            className={clsx(styles.button, {
              [styles.firstInactive]: isFirst && !isActive,
              [styles.lastInactive]: isLast && !isActive,
              [styles.inactiveRight]: !isActive && !isLast,
              [styles.inactiveLeft]: !isActive && !isFirst,
              [styles.middleButton]: isMiddle && !isActive,
            })}
            label={label}
            ariaPressed={isActive}
            ariaBusy={loading || undefined}
            endIcon={loading ? <Spinner loading small white={isActive} className={styles.spinner} /> : undefined}
            endIconClassName={styles.loadingIcon}
            variant={isActive ? 'contained' : 'raw'}
            onClick={onClick}
            disabled={disabled || loading}
            maxWidth
          />
        );
      })}
    </div>
  );
};

export default ButtonGroup;
