import Label from '@/core/theme/label';
import LinkCreator from '@/core/theme/linkCreator';
import { URL_REGEX } from '@/core/utils/regex';
import { forwardRef, KeyboardEvent, LegacyRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import FormErrorMessage from '../FormErrorMessage';
import { InputProps } from '../types';
import styles from './Input.module.scss';

function Input(
  {
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    'aria-activedescendant': ariaActiveDescendant,
    'aria-haspopup': ariaHasPopup,
    'aria-disabled': ariaDisabled,
    role,
    autoComplete,
    autoCompleteOff,
    autofocusOn,
    className = '',
    color,
    dataTestId,
    error,
    endAdornment,
    helperText,
    icon,
    inputFieldClassName,
    infoText,
    inputWrapperRef,
    label,
    link,
    name,
    onBlur,
    onChange,
    onClick,
    onKeyDown,
    placeholder,
    readOnly = false,
    secondaryLabel,
    size = 'normal',
    transparent = false,
    type,
    value,
    isLabelBold,
    shouldDisplayLinkCreator = false,
  }: InputProps,
  ref: LegacyRef<HTMLInputElement>,
): JSX.Element {
  const commonClassName = clsx(
    styles.input,
    styles[`input-${size}`],
    inputFieldClassName,
    { [styles.inputTransparent]: transparent },
    { [styles.inputColor]: color },
    { [styles.inputReadOnly]: readOnly },
  );

  const [isLinkCreatorDisplayed, setIsLinkCreatorDisplayed] = useState(false);

  const valueContainsURL = (): boolean => {
    if (!value) return false;

    return URL_REGEX.test(value);
  };

  useEffect(() => {
    setIsLinkCreatorDisplayed(readOnly && valueContainsURL() && shouldDisplayLinkCreator);
  }, [isLinkCreatorDisplayed, valueContainsURL, shouldDisplayLinkCreator]);

  const inputContent = isLinkCreatorDisplayed ? (
    <div className={commonClassName}>{<LinkCreator text={value} />}</div>
  ) : (
    <input
      data-testid={dataTestId}
      autoFocus={autofocusOn}
      ref={ref}
      aria-invalid={error ? 'true' : 'false'}
      role={role}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-activedescendant={ariaActiveDescendant}
      aria-haspopup={ariaHasPopup}
      aria-disabled={ariaDisabled}
      autoComplete={autoComplete ?? (autoCompleteOff ? 'off' : 'on')}
      className={commonClassName}
      id={name}
      name={name}
      onBlur={(e) => onBlur?.(e)}
      onChange={(e) => onChange?.(e)}
      onClick={(e) => onClick?.(e)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => onKeyDown?.(e)}
      placeholder={placeholder}
      readOnly={readOnly}
      type={type}
      value={value}
    />
  );

  return (
    <div className={clsx(styles.root, { [styles.error]: error }, className)} ref={inputWrapperRef}>
      {label && (
        <Label
          label={label}
          name={name}
          infoText={infoText}
          secondaryLabel={secondaryLabel}
          isLabelBold={isLabelBold}
        />
      )}
      <div className={styles.inputRelativeContainer}>
        {inputContent}
        {helperText && <span className={styles.helperText}>{helperText}</span>}
        {color && <div className={styles.colorDot} style={{ backgroundColor: color }} />}
        <div className={clsx(styles.iconContainer, { [styles.iconContainerError]: error })}>{icon}</div>
        {endAdornment}
        {link && (
          <div className={styles.linkWrapper}>
            <Link className={styles.link} to={link.path}>
              {link.text}
            </Link>
          </div>
        )}
        {error && <FormErrorMessage label={label} message={error.message} type={error.type} />}
      </div>
    </div>
  );
}

export default forwardRef(Input);
