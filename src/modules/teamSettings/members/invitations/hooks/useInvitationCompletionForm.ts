import { useToast } from '@/core/providers/toastProvider';
import { useCooldown } from '@/core/utils/hooks/useCooldown';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvitationCreate } from '../models/invitationCreate.model';
import type { InvitationDto } from '../models/invitationDto.model';
import { InvitationUpdateSchema } from '../models/invitationUpdate.model';
import { normalizeInvitationProblem, type InvitationProblem } from '../problem';
import type { InvitationCompletionFormOptions, InvitationFormErrors } from '../types';
import { invitationDeliveryToast } from '../utils/invitation-delivery-toast';
import { invitationProblemMessage, validateInvitationForm } from '../utils/invitation-form';
import { invitationRole } from '../utils/invitation-management';
import { useDiscardGuard } from './useDiscardGuard';
import { useInvitationConflict } from './useInvitationConflict';
import { useInvitationErrorFocus } from './useInvitationErrorFocus';
import { usePendingAction } from './usePendingAction';
import { useResendInvitationMutation } from './useResendInvitationMutation';
import { useUpdateInvitationMutation } from './useUpdateInvitationMutation';

type InvitationBasics = Pick<InvitationCreate, 'firstName' | 'lastName'> & { role: ReturnType<typeof invitationRole> };
type InvitationCompletionFormState = {
  invitation: InvitationDto;
  prefix: string;
  titleId: string;
  formRef: RefObject<HTMLFormElement>;
  firstInput: RefObject<HTMLInputElement>;
  pending: boolean;
  confirmDiscard: boolean;
  cancelDiscard: () => void;
  errors: InvitationFormErrors;
  basics: InvitationBasics;
  changeBasics: (value: InvitationBasics) => void;
  close: () => void;
  submit: () => Promise<void>;
  problemMessage: string | null;
  conflict: boolean;
  latest: InvitationDto | null;
  refreshing: boolean;
  refreshLatest: () => Promise<void>;
  reviewLatest: () => void;
  submitDisabled: boolean;
};

export function useInvitationCompletionForm({
  organizationSlug,
  invitation: initialInvitation,
  onClose,
  onSaved,
  onDeliveryResult,
  resend = false,
}: InvitationCompletionFormOptions): InvitationCompletionFormState {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const update = useUpdateInvitationMutation();
  const send = useResendInvitationMutation();
  const [invitation] = useState(initialInvitation);
  const [revision, setRevision] = useState(invitation.revision);
  const { conflict, setConflict, latest, refreshing, refreshLatest, handleConflict } = useInvitationConflict({
    organizationSlug,
    invitationId: invitation.id,
  });
  const prefix = useId();
  const titleId = `${prefix}-title`;
  const formRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const { active, pendingRef, pending, run } = usePendingAction();
  const { markDirty, confirmDiscard, cancelDiscard, close } = useDiscardGuard(pendingRef, onClose);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<InvitationProblem | null>(null);
  const { cooldown, setCooldown } = useCooldown();
  const [basics, setBasics] = useState({
    firstName: invitation.firstName ?? '',
    lastName: invitation.lastName ?? '',
    role: invitationRole(invitation),
  });

  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  useInvitationErrorFocus({ errors, formRef, prefix });

  const submit = async (): Promise<void> => {
    if (pendingRef.current || confirmDiscard || conflict || (resend && cooldown > 0) || !active.current) return;
    const candidate = {
      expectedRevision: revision,
      ...basics,
      locale: (i18n.resolvedLanguage ?? i18n.language).split('-')[0] === 'pl' ? 'pl' : 'en',
    };
    const parsed = validateInvitationForm(
      InvitationUpdateSchema,
      candidate,
      basics.role ? {} : { role: 'invitations.validation.role' },
    );
    if (!parsed.success) {
      setErrors(parsed.errors);

      return;
    }
    setErrors({});
    setProblem(null);

    await run(async () => {
      try {
        const variables = { organizationSlug, invitationId: invitation.id, input: parsed.data };
        const result = resend ? await send.mutateAsync(variables) : await update.mutateAsync(variables);
        if (!active.current) return;
        if (resend) {
          if (onDeliveryResult) onDeliveryResult(result);
          else addToast(invitationDeliveryToast(result.delivery.status, t));
        } else {
          addToast({ content: t('invitations.saved') });
        }
        onSaved?.();
        onClose();
      } catch (error: unknown) {
        if (active.current) {
          const safeProblem = normalizeInvitationProblem(error);
          setProblem(safeProblem);
          if (safeProblem.retryAfterSeconds) setCooldown(safeProblem.retryAfterSeconds);
          await handleConflict(safeProblem);
        }
      }
    });
  };

  return {
    invitation,
    prefix,
    titleId,
    formRef,
    firstInput,
    pending,
    confirmDiscard,
    errors,
    basics,
    close,
    submit,
    conflict,
    latest,
    refreshing,
    refreshLatest,
    problemMessage: invitationProblemMessage(problem),
    submitDisabled: pending || confirmDiscard || conflict || (resend && cooldown > 0),

    cancelDiscard,

    changeBasics: (value) => {
      setBasics(value);
      markDirty();
    },

    reviewLatest: () => {
      if (!latest) return;
      setRevision(latest.revision);
      setConflict(false);
      setProblem(null);
    },
  };
}
