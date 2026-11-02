import { paths } from '@/app/routing/paths';
import Button from '@/core/theme/button';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './ErrorFallback.module.scss';

interface ErrorFallbackProps {
  resetError: () => void;
  variant?: 'generic' | 'chunk';
}

function ErrorFallback({ resetError, variant = 'generic' }: ErrorFallbackProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const reload = (): void => {
    setIsLoading(true);
    resetError();
    window.location.reload();
  };

  const backToMainPage = (): void => {
    navigate(paths.index);
    resetError();
  };

  useEffect(() => {
    let loadingTimer: null | ReturnType<typeof setTimeout> = null;

    isLoading &&
      (() => {
        loadingTimer = setTimeout(() => {
          setIsLoading(false);
        }, 500);
      })();

    return () => {
      if (loadingTimer) clearTimeout(loadingTimer);
    };
  });

  const title = variant === 'chunk' ? t('error_boundary.chunk_load.title') : t('error_boundary.generic.title');
  const reloadLabel =
    variant === 'chunk' ? t('error_boundary.chunk_load.reload_button') : t('error_boundary.generic.reload_button');

  return (
    <section className={styles.root}>
      <h2>{title}</h2>
      <Button label={reloadLabel} onClick={reload} loading={isLoading} variant="contained" />
      {variant === 'generic' && (
        <Button
          label={t('error_boundary.generic.back_to_main_page')}
          onClick={backToMainPage}
          className={styles.backButton}
          variant="text"
        />
      )}
    </section>
  );
}

export default ErrorFallback;
