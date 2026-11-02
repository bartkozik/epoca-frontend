import i18n from 'i18next';
import { ZodError } from 'zod';

interface FormError {
  message: string;
}

type FormErrors<T> = {
  [K in keyof T]?: FormError;
};

// A schema's message is meant to be an i18n key, resolved here at display time (see CLAUDE.md's
// Zod conventions) rather than eagerly at schema-definition time -- that's what lets a schema
// built as a module-scope const stay language-agnostic. i18next returns an unmatched string back
// verbatim, so a message that's already a resolved sentence (schemas not yet migrated to this
// convention) keeps rendering unchanged. This relies on i18next having been initialized (the app's
// real entry point does this via `@/core/i18n/i18n`); a test that renders a form and asserts on a
// validation message needs to either initialize it too or mock this module, or `message` here
// comes back `undefined` instead of the key.
const VALIDATION_MESSAGE_MARKER = '__validationMessage__';

interface ValidationMessagePayload {
  marker: typeof VALIDATION_MESSAGE_MARKER;
  key: string;
  params: Record<string, unknown>;
}

// A plain translation key can't carry interpolation params (zod's `message` is just a string), so
// a schema that needs them (e.g. "max {{hours}} hours") builds its message with this helper
// instead of a raw string. The marker distinguishes this from an already-resolved sentence that
// happens to start with "{" -- handleValidationErrors below falls back to treating anything else
// (including malformed/foreign JSON) as a plain key or resolved string, never throwing on it.
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
