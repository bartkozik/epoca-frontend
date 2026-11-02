import Button from '@/core/theme/button';
import Confirmation from '@/core/theme/confirmation';
import FormHeader from '@/core/theme/FormHeader';
import Modal from '@/core/theme/modal';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './InvitationForm.module.scss';

type InvitationModalFormProps = {
  title: string;
  titleId: string;
  formRef: RefObject<HTMLFormElement>;
  children: ReactNode;
  pending: boolean;
  confirmDiscard: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  submit: () => Promise<void>;
  close: () => void;
  cancelDiscard: () => void;
  discard: () => void;
};

const InvitationModalForm = ({
  title,
  titleId,
  formRef,
  children,
  pending,
  confirmDiscard,
  submitDisabled,
  submitLabel,
  submit,
  close,
  cancelDiscard,
  discard,
}: InvitationModalFormProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <>
      <Modal
        isOpen
        ariaLabelledBy={titleId}
        className={styles.modal}
        close={pending ? undefined : close}
        disableClickOutside={pending || confirmDiscard}
        disableEscapeClickClose={pending || confirmDiscard}
        suspendFocusTrap={confirmDiscard}
      >
        <form
          ref={formRef}
          className={styles.form}
          aria-labelledby={titleId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onKeyDown={(event) => {
            if (!event.defaultPrevented && event.ctrlKey && event.key === 'Enter') {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        >
          <div id={titleId}>
            <FormHeader title={title} />
          </div>
          {children}
          <div className={styles.actions}>
            <Button label={t('common.cancel')} onClick={close} variant="text" disabled={pending || confirmDiscard} />
            <Button
              label={submitLabel}
              type="submit"
              disabled={submitDisabled}
              loading={pending}
              aria-label={submitLabel}
            />
          </div>
        </form>
      </Modal>
      <Confirmation
        actionType="attention"
        isOpen={confirmDiscard}
        title={t('invitations.discard.title')}
        text={t('invitations.discard.message')}
        cancelBtnText={t('invitations.discard.keep')}
        onCancel={cancelDiscard}
        confirmActions={[{ text: t('invitations.discard.confirm'), action: discard }]}
      />
    </>
  );
};

export default InvitationModalForm;
