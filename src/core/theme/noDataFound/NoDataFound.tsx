import Button from '@/core/theme/button';
import React, { MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './NoDataFound.module.scss';

interface NoDataFoundProps {
  buttonLabel?: string;
  className?: string;
  image: string;
  label?: string;
  onButtonClick?: MouseEventHandler<HTMLButtonElement>;
  withoutButton?: boolean;
}

function NoDataFound({
  buttonLabel,
  className,
  image,
  label,
  onButtonClick,
  withoutButton,
}: NoDataFoundProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={clsx(styles.root, className)}>
      <img alt={label || t('common.no_project_added')} className={styles.image} src={image} />
      <span className={styles.label}>{label || t('common.no_project_added')}</span>
      {!withoutButton && (
        <Button
          className={styles.addProjectButton}
          label={buttonLabel || `${t('common.add_new_project').toLowerCase()}`}
          onClick={onButtonClick}
          size="large"
          variant="contained"
        />
      )}
    </div>
  );
}

export default NoDataFound;
