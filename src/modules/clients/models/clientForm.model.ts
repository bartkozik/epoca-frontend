import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { z } from 'zod';
import { RawClient } from '../types';

// Takes RawClient[] rather than Client[] -- this only reads `.name`/`.id`, both present on the raw
// wire shape, so callers can pass a query result's `results` directly without deriving the fuller
// Client (RawClient + archived/projects/etc.) just to satisfy this uniqueness check.
export const ClientFormSchema = (
  clients: RawClient[],
  currentClientId?: string,
): z.ZodType<{ clientName: string; logoURL?: string }, z.ZodTypeDef, { clientName: string; logoURL?: unknown }> =>
  z.object({
    clientName: z
      .string()
      .min(1, 'clients.client_form.error.project_name_required')
      .max(MAX_NAME_LENGTH, 'clients.client_form.error.project_name_too_long')
      .refine(
        (value) =>
          !clients.some(
            (client) => client.name.toLowerCase() === value.trim().toLowerCase() && client.id !== currentClientId,
          ),
        { message: 'common.error.name_is_already_in_use' },
      ),
    logoURL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url('common.error.please_enter_a_valid_url').optional(),
    ),
  });
