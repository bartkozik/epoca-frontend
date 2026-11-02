import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './FormErrorMessage.module.scss';

export interface FormErrorMessageProps {
  className?: string;
  iconPosition?: 'left' | 'right';
  label?: string;
  message?: string;
  name?: string;
  type?: 'required' | 'custom';
}

function FormErrorMessage({
  className = '',
  iconPosition = 'left',
  label,
  message,
  type = 'custom',
}: FormErrorMessageProps): JSX.Element {
  const { t } = useTranslation();

  let errorMessage = t('common.error.invalid_value');

  if (!message) {
    if (type === 'required' && label) {
      errorMessage = t('common.error.field_required', { field: label });
    }
  } else {
    errorMessage = message;
  }

  return (
    <div className={clsx(styles.box, className)}>
      {iconPosition === 'left' && <div className={styles.icon}>i</div>}
      <p className={styles.message}>{errorMessage}</p>
      {iconPosition === 'right' && <div className={styles.icon}>i</div>}
    </div>
  );
}

export default FormErrorMessage;
