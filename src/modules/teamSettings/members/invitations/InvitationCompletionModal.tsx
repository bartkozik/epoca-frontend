import { Input } from '@/core/theme/inputs';
import Select from '@/core/theme/select';
import { useTranslation } from 'react-i18next';
import { useInvitationCompletionForm } from './hooks/useInvitationCompletionForm';
import styles from './InvitationForm.module.scss';
import InvitationLatestState from './InvitationLatestState';
import InvitationModalForm from './InvitationModalForm';
import type { InvitationCompletionFormOptions } from './types';
import { invitationRoleItems } from './utils/invitation-form';

type InvitationCompletionModalProps = InvitationCompletionFormOptions;

const InvitationCompletionModal = (props: InvitationCompletionModalProps): JSX.Element => {
  return <InvitationCompletionSession key={`${props.organizationSlug}:${props.invitation.id}`} {...props} />;
};

const InvitationCompletionSession = (props: InvitationCompletionModalProps): JSX.Element => {
  const { t } = useTranslation();
  const { onClose, resend = false } = props;
  const {
    invitation,
    prefix,
    titleId,
    formRef,
    firstInput,
    pending,
    confirmDiscard,
    cancelDiscard,
    errors,
    basics,
    changeBasics,
    close,
    submit,
    problemMessage,
    conflict,
    latest,
    refreshing,
    refreshLatest,
    reviewLatest,
    submitDisabled,
  } = useInvitationCompletionForm(props);

  const errorFor = (field: string): { type: 'custom'; message: string } | undefined =>
    errors[field] ? { type: 'custom', message: t(errors[field]) } : undefined;

  const roleItems = invitationRoleItems(t);

  return (
    <InvitationModalForm
      title={t('invitations.completion.title')}
      titleId={titleId}
      formRef={formRef}
      pending={pending}
      confirmDiscard={confirmDiscard}
      submitDisabled={submitDisabled}
      submitLabel={t(resend ? 'invitations.action.resend' : 'invitations.action.save')}
      submit={submit}
      close={close}
      cancelDiscard={cancelDiscard}
      discard={onClose}
    >
      <p className={styles.note}>{invitation.email}</p>
      <fieldset disabled={pending || confirmDiscard} className={styles.fields}>
        <p>{t('invitations.completion.message')}</p>
        {(['firstName', 'lastName'] as const).map((field) => (
          <Input
            key={field}
            ref={field === 'firstName' ? firstInput : undefined}
            name={`${prefix}-${field}`}
            label={t(`invitations.form.${field}`)}
            type="text"
            value={basics[field]}
            onChange={(event) => {
              changeBasics({ ...basics, [field]: event.target.value });
            }}
            error={errorFor(field)}
          />
        ))}
        <Select
          name={`${prefix}-role`}
          size="normal"
          label={t('invitations.form.role')}
          items={roleItems}
          selectedItem={roleItems.find((item) => item.value === basics.role)}
          readOnly={pending || confirmDiscard}
          onSelect={(item) => {
            changeBasics({ ...basics, role: item.value });
          }}
          error={errorFor('role')}
        />
      </fieldset>
      {problemMessage && (
        <p role="alert" className={styles.error}>
          {t(conflict ? 'invitations.error.revision-conflict' : `invitations.error.${problemMessage}`)}
        </p>
      )}
      {conflict && (
        <InvitationLatestState
          invitation={latest}
          refreshing={refreshing}
          onRefresh={() => void refreshLatest()}
          onReviewed={reviewLatest}
        />
      )}
    </InvitationModalForm>
  );
};

export default InvitationCompletionModal;
