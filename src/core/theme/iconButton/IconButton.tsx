import React, { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './IconButton.module.scss';

export interface IconButtonProps {
  ariaLabel?: string;
  className?: string;
  color?: 'primary' | 'primaryLightest' | 'white' | 'black' | 'gray';
  disabled?: boolean;
  hidden?: boolean;
  icon: ReactNode;
  iconStyles?: string;
  label?: string;
  maxWidth?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  size?: 'small' | 'medium' | 'large';
  title?: string;
  variant: 'contained' | 'outlined' | 'raw';
}

function IconButton({
  ariaLabel,
  className = '',
  iconStyles = '',
  color = 'primary',
  disabled = false,
  hidden = false,
  icon,
  label,
  maxWidth = false,
  onClick,
  size = 'medium',
  title,
  variant,
}: IconButtonProps): JSX.Element {
  const variantClass =
    variant === 'contained' ? styles.contained : variant === 'outlined' ? styles.outlined : styles.raw;

  const sizeClass = size === 'small' ? styles.sizeSmall : size === 'medium' ? styles.sizeMedium : styles.sizeLarge;

  const getColorClass = (): string => {
    switch (color) {
      case 'primary':
        return styles.colorPrimary;
      case 'primaryLightest':
        return styles.colorPrimaryLightest;
      case 'white':
        return styles.colorWhite;
      case 'black':
        return styles.colorBlack;
      case 'gray':
        return styles.colorGray;
      default:
        return '';
    }
  };

  return (
    <button
      className={clsx(styles.root, { [styles.maxWidth]: maxWidth }, { disabled }, className, { hidden })}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      <div className={clsx(styles.icon, iconStyles, variantClass, sizeClass, getColorClass())}>{icon}</div>
      {label && <span className={clsx(styles.label, { [styles.labelLarge]: size === 'large' })}>{label}</span>}
    </button>
  );
}

export default IconButton;
