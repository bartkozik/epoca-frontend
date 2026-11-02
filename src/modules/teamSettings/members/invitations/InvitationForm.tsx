import { OrganizationUserRole } from '@/core/models/enums';
import { useToast } from '@/core/providers/toastProvider';
import { Input } from '@/core/theme/inputs';
import Select from '@/core/theme/select';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateInvitationMutation } from './hooks/useCreateInvitationMutation';
import { useDiscardGuard } from './hooks/useDiscardGuard';
import { useInvitationErrorFocus } from './hooks/useInvitationErrorFocus';
import { usePendingAction } from './hooks/usePendingAction';
import styles from './InvitationForm.module.scss';
import InvitationModalForm from './InvitationModalForm';
import { InvitationCreateSchema } from './models/invitationCreate.model';
import type { InvitationDto } from './models/invitationDto.model';
import { normalizeInvitationProblem, type InvitationProblem } from './problem';
import { invitationDeliveryToast } from './utils/invitation-delivery-toast';
import { invitationProblemMessage, invitationRoleItems, validateInvitationForm } from './utils/invitation-form';
import { isWaitingInvitation } from './utils/invitation-management';

type InvitationFormProps = {
  existingInvitations?: InvitationDto[];
  onDeliveryResult?: (result: InvitationDto) => void;
  isOpen: boolean;
  organizationSlug: string;
  onClose: () => void;
};

// Remount on reopen or organization change to reset the draft and idempotency key.
const InvitationForm = (props: InvitationFormProps): JSX.Element | null => {
  return props.isOpen ? <InvitationFormSession key={props.organizationSlug} {...props} /> : null;
};

const InvitationFormSession = ({
  organizationSlug,
  onClose,
  onDeliveryResult,
  existingInvitations = [],
}: InvitationFormProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const create = useCreateInvitationMutation();
  const prefix = useId();
  const titleId = `${prefix}-title`;
  const formRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const { active, pendingRef, pending, run } = usePendingAction();
  const { markDirty, confirmDiscard, cancelDiscard, close } = useDiscardGuard(pendingRef, onClose);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailConflict, setEmailConflict] = useState<{
    email: string;
    kind: 'already-exists' | 'already-member';
  } | null>(null);
  const [problem, setProblem] = useState<InvitationProblem | null>(null);
  const [basics, setBasics] = useState({ firstName: '', lastName: '', email: '', role: OrganizationUserRole.Employee });
  const normalizedEmail = basics.email.trim().toLowerCase();
  const emailProblem =
    emailConflict?.email === normalizedEmail
      ? emailConflict.kind
      : existingInvitations.some(
            (invitation) =>
              isWaitingInvitation(invitation) && invitation.email.trim().toLowerCase() === normalizedEmail,
          )
        ? 'already-exists'
        : null;

  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  useInvitationErrorFocus({ errors, formRef, prefix });

  useEffect(() => {
    if (!emailConflict || pending) return;
    const emailInput = formRef.current?.elements.namedItem(`${prefix}-email`);
    if (emailInput instanceof HTMLElement) emailInput.focus();
  }, [emailConflict, pending, prefix]);

  const errorFor = (field: string): { type: 'custom'; message: string } | undefined => {
    const message = field === 'email' && emailProblem ? `invitations.error.${emailProblem}` : errors[field];

    return message ? { type: 'custom', message: t(message) } : undefined;
  };

  const submit = async (): Promise<void> => {
    if (pendingRef.current || confirmDiscard || !active.current || emailProblem) return;
    const candidate = {
      ...basics,
      locale: (i18n.resolvedLanguage ?? i18n.language).split('-')[0] === 'pl' ? 'pl' : 'en',
    };
    const parsed = validateInvitationForm(InvitationCreateSchema, candidate);
    if (!parsed.success) {
      setErrors(parsed.errors);

      return;
    }
    setErrors({});
    setProblem(null);

    await run(async () => {
      try {
        const result = await create.mutateAsync({ organizationSlug, input: parsed.data });
        if (!active.current) return;
        if (onDeliveryResult) onDeliveryResult(result);
        else addToast(invitationDeliveryToast(result.delivery.status, t));
        onClose();
      } catch (error: unknown) {
        if (active.current) {
          const nextProblem = normalizeInvitationProblem(error);
          if (nextProblem.kind === 'already-exists' || nextProblem.kind === 'already-member') {
            setEmailConflict({ email: normalizedEmail, kind: nextProblem.kind });
          } else setProblem(nextProblem);
        }
      }
    });
  };

  const roleItems = invitationRoleItems(t);
  const problemMessage = invitationProblemMessage(problem);

  return (
    <InvitationModalForm
      title={t('invitations.form.title')}
      titleId={titleId}
      formRef={formRef}
      pending={pending}
      confirmDiscard={confirmDiscard}
      submitDisabled={pending || confirmDiscard || !!emailProblem}
      submitLabel={t('invitations.form.submit')}
      submit={submit}
      close={close}
      cancelDiscard={cancelDiscard}
      discard={onClose}
    >
      <fieldset disabled={pending || confirmDiscard} className={styles.fields}>
        {(['firstName', 'lastName', 'email'] as const).map((field) => (
          <Input
            key={field}
            ref={field === 'firstName' ? firstInput : undefined}
            name={`${prefix}-${field}`}
            label={t(`invitations.form.${field}`)}
            type={field === 'email' ? 'email' : 'text'}
            value={basics[field]}
            onChange={(event) => {
              setBasics({ ...basics, [field]: event.target.value });
              markDirty();
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
            setBasics({ ...basics, role: item.value });
            markDirty();
          }}
          error={errorFor('role')}
        />
      </fieldset>
      {problemMessage && (
        <p role="alert" className={styles.error}>
          {t(`invitations.error.${problemMessage}`)}
        </p>
      )}
    </InvitationModalForm>
  );
};

export default InvitationForm;
