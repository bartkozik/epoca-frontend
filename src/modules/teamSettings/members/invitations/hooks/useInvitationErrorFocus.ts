import { useEffect, type RefObject } from 'react';
import type { InvitationFormErrors } from '../types';

type InvitationErrorFocusOptions = {
  errors: InvitationFormErrors;
  formRef: RefObject<HTMLFormElement>;
  prefix: string;
};

export const useInvitationErrorFocus = ({ errors, formRef, prefix }: InvitationErrorFocusOptions): void => {
  useEffect(() => {
    const field = Object.keys(errors)[0];
    if (!field) return;
    const input = formRef.current?.elements.namedItem(`${prefix}-${field.replaceAll('.', '-')}`);
    if (input instanceof HTMLElement) input.focus();
  }, [errors, formRef, prefix]);
};
