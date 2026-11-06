import i18n from 'i18next';
import { ZodError } from 'zod';

interface FormError {
  message: string;
}

type FormErrors<T> = {
  [K in keyof T]?: FormError;
};

const VALIDATION_MESSAGE_MARKER = '__validationMessage__';

interface ValidationMessagePayload {
  marker: typeof VALIDATION_MESSAGE_MARKER;
  key: string;
  params: Record<string, unknown>;
}

export function formatValidationMessage(key: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ marker: VALIDATION_MESSAGE_MARKER, key, params } satisfies ValidationMessagePayload);
}

function parseValidationMessage(message: string): ValidationMessagePayload | null {
  if (!message.startsWith('{')) return null;

  try {
    const parsed: unknown = JSON.parse(message);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Partial<ValidationMessagePayload>).marker === VALIDATION_MESSAGE_MARKER &&
      typeof (parsed as Partial<ValidationMessagePayload>).key === 'string'
    ) {
      return parsed as ValidationMessagePayload;
    }
  } catch {
    return null;
  }

  return null;
}

export function handleValidationErrors<T>(zodError: ZodError<T>): FormErrors<T> {
  const newFormErrors: FormErrors<T> = {};

  zodError.errors.forEach((err) => {
    const fieldName = err.path[0] as keyof T;
    const payload = parseValidationMessage(err.message);
    newFormErrors[fieldName] = {
      message: payload ? i18n.t(payload.key, payload.params) : i18n.t(err.message),
    };
  });

  return newFormErrors;
}
