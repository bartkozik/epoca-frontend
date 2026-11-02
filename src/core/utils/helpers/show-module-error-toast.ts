import { addToast } from '@/core/providers/toastProvider';
import axios from 'axios';
import { showToastForError } from './show-toasts-for-error';

// showToastForError silently no-ops for non-AxiosError values -- a fallback for ZodErrors from
// zod-validated responses, which would otherwise drop with no trace.
export function showModuleErrorToast(error: unknown, errorMessageMap: Record<string, string>): void {
  if (axios.isAxiosError(error)) {
    showToastForError({ errorMessageMap, error });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(error);
  addToast({ content: errorMessageMap.default, type: 'error' });
}
