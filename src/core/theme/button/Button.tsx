import Spinner from '@/core/theme/spinner';
import { HTMLAttributeAnchorTarget, MouseEventHandler, ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import styles from './Button.module.scss';

export type ButtonType = 'button' | 'submit' | 'reset' | undefined;

type ButtonColor = 'primary' | 'white' | 'fontHeading';
type ButtonSize = 'small' | 'medium' | 'large' | 'xLarge' | 'smallRound' | 'extraSmall';
export type ButtonVariant = 'contained' | 'outlined' | 'text' | 'draft' | 'round' | 'transparent' | 'raw';

export interface ButtonProps {
  'aria-describedby'?: string;
  'aria-label'?: string;
  ariaPressed?: boolean;
  ariaBusy?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  className?: string;
  color?: ButtonColor;
  disabled?: boolean;
  dataTestId?: string;
  endIcon?: ReactNode;
  endIconClassName?: string;
  fontWeight?: 'regular' | 'medium';
  forwardedRef?: Ref<HTMLButtonElement>;
  hidden?: boolean;
  href?: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  title?: string;
  label?: string;
  loading?: boolean;
  maxWidth?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: ButtonSize;
  startIcon?: ReactNode;
  startIconClassName?: string;
  tabIndex?: number;
  type?: ButtonType;
  variant?: ButtonVariant;
}

function Button({
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  ariaPressed,
  ariaBusy,
  ariaExpanded,
  ariaControls,
  className = '',
  color = 'primary',
  disabled = false,
  dataTestId,
  endIcon,
  endIconClassName,
  fontWeight = 'regular',
  forwardedRef,
  href,
  target,
  rel,
  title,
  hidden = false,
  label,
  loading = false,
  maxWidth = false,
  onClick,
  size = 'medium',
  startIcon,
  startIconClassName,
  type = 'button',
  variant = 'contained',
  tabIndex,
}: ButtonProps): JSX.Element {
  const maxWidthClass = maxWidth ? styles.maxWidth : '';
  const classes = clsx(
    className,
    maxWidthClass,
    styles.root,
    { hidden },
    styles[`color-${color}`],
    styles[`fontWeight-${fontWeight}`],
    styles[`size-${size}`],
    styles[variant] || styles.text,
  );

  const buttonProps = {
    'aria-describedby': ariaDescribedBy,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    'aria-busy': ariaBusy,
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    className: classes,
    disabled,
    onClick,
    type,
  };

  const linkProps = {
    'aria-label': ariaLabel,
    target,
    rel,
    title,
    className: classes,
    to: href ?? '',
  };

  const content = (): JSX.Element | null => {
    if (loading) return null;

    return (
      <>
        {startIcon && <span className={clsx(styles.icon, styles.startIcon, startIconClassName)}>{startIcon}</span>}
        {label && <span>{label}</span>}
        {endIcon && <span className={clsx(styles.icon, styles.endIcon, endIconClassName)}>{endIcon}</span>}
      </>
    );
  };

  const button = (
    <button {...buttonProps} data-testid={dataTestId} ref={forwardedRef} tabIndex={tabIndex}>
      <Spinner small white={variant !== 'outlined'} className={styles.loader} loading={loading} />
      {content()}
    </button>
  );

  return href ? <Link {...linkProps}>{content()}</Link> : button;
}

export default Button;
