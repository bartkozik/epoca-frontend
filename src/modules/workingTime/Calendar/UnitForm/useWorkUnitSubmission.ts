import { isNetworkError } from '@/core/api/utils';
import { ErrorResponse, isAxiosError, showToastForError } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useAddUnitMutation } from '@/modules/workingTime/hooks/useAddUnitMutation';
import { useEditUnitMutation } from '@/modules/workingTime/hooks/useEditUnitMutation';
import { useCallback, useRef, useState } from 'react';
import i18n from 'i18next';
import { classifyWorkUnitSubmitError } from '../../idempotency/classifyWorkUnitSubmitError';
import {
  createAddUnitSignature,
  createEditUnitSignature,
  WorkUnitSubmissionIdentity,
} from '../../idempotency/WorkUnitSubmissionIdentity';
import { RawUnit, UnitDto, UnitEditDto } from '../../types';

export type RetryBlockReason = 'expired' | 'version-unsupported' | null;

export interface UseWorkUnitSubmissionResult {
  submitAdd: (dto: UnitDto, isDraft: boolean) => Promise<RawUnit | undefined>;
  submitEdit: (workUnitId: string, dto: UnitEditDto, shouldFinalize: boolean) => Promise<boolean>;
  isSubmitting: boolean;
  isRetryBlocked: boolean;
  retryBlockReason: RetryBlockReason;
  getFormSession: () => number;
  isActiveWorkUnitFormSession: (formSession: number) => boolean;
  resetSubmissionState: () => void;
}

const showUnitSubmitToast = (error: unknown, message: string): void => {
  if (!isAxiosError(error)) return;

  const errorMessageMap: Record<string, string> = { default: message };
  const status = error.response?.status;
  if (status !== undefined) errorMessageMap[status] = message;

  showToastForError({
    errorMessageMap,
    error,
  });
};

const showMappedUnitSubmitToast = (error: unknown): void => {
  if (!isAxiosError(error)) return;

  const message = {
    400: i18n.t('toast_message.working_time.add_new_unit_no_duration_error'),
    403: i18n.t('toast_message.working_time.not_authorized'),
    404: i18n.t('toast_message.working_time.unit_save_error_on_archived_project'),
  }[error.response?.status || 0];

  showUnitSubmitToast(error, message || i18n.t('toast_message.working_time.default_error'));
};

export function useWorkUnitSubmission(onBlocked?: () => void): UseWorkUnitSubmissionResult {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const addUnitMutation = useAddUnitMutation();
  const editUnitMutation = useEditUnitMutation();

  // A ref, not state: both submit paths check it synchronously, so two calls made back-to-back
  // without an await in between still dedup (React would batch a state update past the second one).
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetryBlocked, setIsRetryBlocked] = useState(false);
  const [retryBlockReason, setRetryBlockReason] = useState<RetryBlockReason>(null);

  const formSessionRef = useRef(0);
  const identityRef = useRef<WorkUnitSubmissionIdentity | undefined>(undefined);
  if (!identityRef.current) identityRef.current = new WorkUnitSubmissionIdentity();
  const identity = identityRef.current;

  const handleSubmitError = useCallback(
    (error: unknown, formSession: number): void => {
      const decision = classifyWorkUnitSubmitError(error);
      const isActiveFormSession = formSession === formSessionRef.current;

      if (decision === 'block-expired') {
        if (isActiveFormSession) {
          identity.clear();
          setIsRetryBlocked(true);
          setRetryBlockReason('expired');
        }
        onBlocked?.();
        showUnitSubmitToast(error, i18n.t('toast_message.working_time.idempotency_result_expired'));
        return;
      }

      if (decision === 'block-version-unsupported') {
        if (isActiveFormSession) {
          setIsRetryBlocked(true);
          setRetryBlockReason('version-unsupported');
        }
        onBlocked?.();
        showUnitSubmitToast(error, i18n.t('toast_message.working_time.idempotency_version_unsupported'));
        return;
      }

      if (decision === 'rotate-key') {
        if (isActiveFormSession) identity.clear();

        const responseData = isAxiosError(error) ? (error.response?.data as ErrorResponse | undefined) : undefined;
        if (responseData?.type === 'result:work-unit:idempotency-key-conflict') {
          showUnitSubmitToast(error, i18n.t('toast_message.working_time.idempotency_conflict'));
        } else {
          showMappedUnitSubmitToast(error);
        }
        return;
      }

      if (isNetworkError(error) || !isAxiosError(error)) return;

      const status = error.response?.status;
      if (status === 408 || status === 429 || (status !== undefined && status >= 500 && status <= 599)) {
        showUnitSubmitToast(error, i18n.t('toast_message.working_time.retryable_save_error'));
        return;
      }

      showMappedUnitSubmitToast(error);
    },
    [identity, onBlocked],
  );

  const submitAdd = useCallback(
    async (dto: UnitDto, isDraft: boolean): Promise<RawUnit | undefined> => {
      if (isSubmittingRef.current || isRetryBlocked) return undefined;

      const formSession = formSessionRef.current;
      const signature = createAddUnitSignature(organizationSlug, dto, isDraft);
      const idempotencyKey = identity.keyFor(signature);
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        return await addUnitMutation.mutateAsync({ dto, isDraft, idempotencyKey });
      } catch (error) {
        handleSubmitError(error, formSession);
        return undefined;
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [addUnitMutation, handleSubmitError, identity, isRetryBlocked, organizationSlug],
  );

  const submitEdit = useCallback(
    async (workUnitId: string, dto: UnitEditDto, shouldFinalize: boolean): Promise<boolean> => {
      if (isSubmittingRef.current || isRetryBlocked) return false;

      const formSession = formSessionRef.current;
      const signature = createEditUnitSignature(organizationSlug, workUnitId, dto, shouldFinalize);
      const idempotencyKey = identity.keyFor(signature);
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        await editUnitMutation.mutateAsync({ workUnitId, dto, shouldFinalize, idempotencyKey });
        return true;
      } catch (error) {
        handleSubmitError(error, formSession);
        return false;
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [editUnitMutation, handleSubmitError, identity, isRetryBlocked, organizationSlug],
  );

  // Deliberately leaves the in-flight guard alone -- a pending request still has to clear it.
  const resetSubmissionState = useCallback((): void => {
    formSessionRef.current += 1;
    identity.clear();
    setIsRetryBlocked(false);
    setRetryBlockReason(null);
  }, [identity]);

  const getFormSession = useCallback((): number => formSessionRef.current, []);
  const isActiveWorkUnitFormSession = useCallback(
    (formSession: number): boolean => formSession === formSessionRef.current,
    [],
  );

  return {
    submitAdd,
    submitEdit,
    isSubmitting,
    isRetryBlocked,
    retryBlockReason,
    getFormSession,
    isActiveWorkUnitFormSession,
    resetSubmissionState,
  };
}
