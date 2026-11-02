import Icon, { icons } from '@/core/theme/icon';
import InfoIcon from '@/core/theme/infoIcon';
import Label from '@/core/theme/label';
import Spinner from '@/core/theme/spinner';
import { useId } from 'react';
import type { KeyboardEvent } from 'react';
import clsx from 'clsx';
import styles from './Toggle.module.scss';

interface StateLabels {
  on: string;
  off: string;
}

interface ToggleProps {
  isChecked: boolean;
  className?: string;
  label?: string;
  loading?: boolean;
  onClick: () => void;
  stateLabels?: StateLabels;
  disabled?: boolean;
  labelTooltip?: string;
  disabledTooltipText?: string;
  withLabelAsStatus?: boolean;
}

const Toggle = ({
  className,
  disabled,
  isChecked,
  onClick,
  label,
  loading,
  stateLabels = { on: 'On', off: 'Off' },
  labelTooltip,
  disabledTooltipText,
  withLabelAsStatus = false,
}: ToggleProps): JSX.Element => {
  const toggleId = useId();
  const loadingStyle = loading ? styles.loading : null;
  const checkStyle = !loading && isChecked ? styles.on : styles.off;
  const circleStyles = isChecked ? styles.circle : styles.circleOff;
  const displayedIcon = isChecked ? (
    <Icon className={styles.checkIcon} icon={icons.checkmark} width={13} height={9} />
  ) : (
    <Icon className={styles.crossIcon} icon={icons.x} width={12} height={12} />
  );

  const handleClick = (): void => {
    if (!disabled) onClick();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    handleClick();
  };

  const labelDisplayed = label && (
    <Label
      className={clsx(styles.label, { [styles.labelAsStatus]: withLabelAsStatus })}
      label={label}
      name={toggleId}
      infoText={labelTooltip}
    />
  );

  return (
    <div className={clsx(styles.root, className)}>
      {!withLabelAsStatus && labelDisplayed}
      <div className={styles.toggleContainer}>
        <div
          aria-checked={isChecked}
          aria-disabled={disabled || undefined}
          aria-label={label ?? (isChecked ? stateLabels.on : stateLabels.off)}
          className={clsx(styles.toggle, loadingStyle, checkStyle, { [styles.disabled]: disabled })}
          id={toggleId}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="switch"
          tabIndex={disabled ? -1 : 0}
        >
          <Spinner loading={loading} className={styles.spinner} small />
          {!loading && (
            <>
              {displayedIcon}
              <div className={circleStyles}></div>
            </>
          )}
        </div>
        <span
          className={clsx(
            styles.stateLabels,
            { [styles.labelWhileLoading]: loading },
            { [styles.disabledLabel]: disabled },
          )}
        >
          {!withLabelAsStatus ? (isChecked ? stateLabels.on : stateLabels.off) : labelDisplayed}
          {disabled && disabledTooltipText && <InfoIcon tooltipText={disabledTooltipText} />}
        </span>
      </div>
    </div>
  );
};

export default Toggle;
