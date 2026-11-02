import Icon, { icons } from '@/core/theme/icon';
import Label from '@/core/theme/label';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './Checkbox.module.scss';

interface CheckboxProps {
  ariaLabel?: string;
  className?: string;
  label?: string;
  infoText?: string;
  selected: boolean;
  variant?: 'round' | 'square';
  isHovered?: boolean;
  onClick?: () => void;
  withStateText?: boolean;
}

const Checkbox = ({
  ariaLabel,
  className,
  label,
  infoText,
  selected,
  onClick,
  variant = 'round',
  isHovered,
  withStateText,
}: CheckboxProps): JSX.Element => {
  const { t } = useTranslation();
  const inputId = useId();

  const iconVariant = variant === 'round' ? styles.iconRound : styles.iconSquare;
  const inputVariant = variant === 'round' ? styles.roundInput : styles.squareInput;

  return (
    <div
      className={clsx(styles.root, className, {
        [styles.hoveredCheckbox]: isHovered && variant === 'round',
        [styles.hoveredSquareCheckbox]: isHovered && variant === 'square',
      })}
    >
      {label && (
        <Label
          className={clsx(styles.labelCustom, { [styles.labelCustomWithImportant]: infoText })}
          label={label}
          infoText={infoText}
          isLabelBold
          name={inputId}
        />
      )}
      <label
        className={clsx(styles.checkboxContainer, { [styles.checkboxContainerWithLabel]: label })}
        htmlFor={inputId}
      >
        <input
          aria-label={ariaLabel ?? label}
          checked={selected}
          className={clsx(styles.checkbox, inputVariant)}
          id={inputId}
          onChange={onClick}
          readOnly={!onClick}
          tabIndex={onClick ? undefined : -1}
          type="checkbox"
        />
        <span className={clsx(styles.checkIcon, styles[variant])}>
          <Icon className={clsx(styles.icon, iconVariant)} icon={icons.checkmark} width={7} height={5} />
        </span>

        {withStateText && (
          <span className={styles.stateText}>{selected ? t('common.enabled') : t('common.disabled')}</span>
        )}
      </label>
    </div>
  );
};

export default Checkbox;
