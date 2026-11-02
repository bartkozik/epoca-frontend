import Button, { type ButtonVariant } from '@/core/theme/button';
import Modal from '@/core/theme/modal';
import { useId } from 'react';
import styles from './IntegrationClientConfirmationModal.module.scss';

export interface IntegrationClientConfirmationAction {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onClick: () => unknown;
  variant?: ButtonVariant;
}

interface IntegrationClientConfirmationModalProps {
  actions: IntegrationClientConfirmationAction[];
  cancelLabel: string;
  isOpen: boolean;
  isSubmitting?: boolean;
  message: string;
  messageRole?: 'alert' | 'status';
  onCancel: () => void;
  title: string;
}

const IntegrationClientConfirmationModal = ({
  actions,
  cancelLabel,
  isOpen,
  isSubmitting = false,
  message,
  messageRole,
  onCancel,
  title,
}: IntegrationClientConfirmationModalProps): JSX.Element => {
  const titleId = useId();

  return (
    <Modal
      ariaLabelledBy={titleId}
      className={styles.modal}
      close={isSubmitting ? undefined : onCancel}
      disableClickOutside={isSubmitting}
      disableEscapeClickClose={isSubmitting}
      isOpen={isOpen}
    >
      <h2 className={styles.modalTitle} id={titleId}>
        {title}
      </h2>
      <p className={styles.message} role={messageRole}>
        {message}
      </p>
      <div className={styles.footer}>
        <Button
          className={styles.action}
          disabled={isSubmitting}
          label={cancelLabel}
          onClick={onCancel}
          variant="text"
        />
        {actions.map((action) => (
          <Button
            className={styles.action}
            disabled={isSubmitting || action.disabled}
            key={action.label}
            label={action.label}
            loading={action.loading}
            onClick={action.onClick}
            variant={action.variant}
          />
        ))}
      </div>
    </Modal>
  );
};

export default IntegrationClientConfirmationModal;
