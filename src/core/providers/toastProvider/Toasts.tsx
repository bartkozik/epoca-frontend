import { ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import Toast from './toast';
import { useToast } from './ToastProvider';
import styles from './Toasts.module.scss';

const Toasts = (): ReactPortal => {
  const { t } = useTranslation();
  const { toasts, addToast } = useToast();

  const copyToClipboard = (errorId: string): void => {
    void navigator.clipboard.writeText(errorId).then(() => {
      addToast({ content: t('common.error.id_copied_to_clipboard') });
    });
  };

  return createPortal(
    <div className={styles.root}>
      {toasts.map(({ id, content, correlationId, type, timeout }) => (
        <Toast key={id} id={id} timeout={timeout} type={type}>
          {content}
          {type === 'error' && correlationId && (
            <p className={styles.errorInfo}>
              <Trans
                i18nKey="common.error.report_error"
                components={{
                  1: <span onClick={() => copyToClipboard(correlationId)}></span>,
                }}
                values={{ correlationId }}
              />
            </p>
          )}
        </Toast>
      ))}
    </div>,
    document.body,
  );
};

export default Toasts;
