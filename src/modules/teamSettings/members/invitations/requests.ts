import api from '@/core/api/Api';
import { z } from 'zod';
import { InvitationCancelSchema, type InvitationCancel } from './models/invitationCancel.model';
import { InvitationCreateSchema, type InvitationCreate } from './models/invitationCreate.model';
import { InvitationDtoSchema, type InvitationDto } from './models/invitationDto.model';
import {
  InvitationListParamsSchema,
  InvitationPageSchema,
  type InvitationListParams,
  type InvitationPage,
} from './models/invitationList.model';
import { InvitationResendSchema, type InvitationResend } from './models/invitationResend.model';
import { InvitationUpdateSchema, type InvitationUpdate } from './models/invitationUpdate.model';
import { parseInvitationInput, runInvitationRequest, type InvitationProblem } from './problem';

const collectionPath = (slug: string): string => `/organizations/${encodeURIComponent(slug)}/invitations`;

const itemPath = (slug: string, id: string): string => `${collectionPath(slug)}/${encodeURIComponent(id)}`;

const INVITATION_API_VERSION = 2;
const config = { params: { version: INVITATION_API_VERSION }, skipConnectionErrorToast: true };
const keySchema = z.string().uuid('invitations.validation.idempotencyKey');

const keyHeaders = (key: string): Record<string, string> => ({
  'Idempotency-Key': parseInvitationInput(keySchema, key),
});

export function listInvitations(
  slug: string,
  input: InvitationListParams,
  signal?: AbortSignal,
): Promise<InvitationPage> {
  return runInvitationRequest(async () => {
    const params = parseInvitationInput(InvitationListParamsSchema, input);
    const response = await api.get<unknown>(collectionPath(slug), {
      ...config,
      params: { version: INVITATION_API_VERSION, ...params },
      signal,
    });

    return InvitationPageSchema.parse(response.data);
  });
}

export async function listAllInvitations(slug: string, signal?: AbortSignal): Promise<InvitationPage> {
  const pageSize = 200;
  const first = await listInvitations(slug, { pageSize, pageNumber: 1 }, signal);
  const results = [...first.results];
  let latest = first;
  const pageCount = Math.ceil(first.count / pageSize);
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
    if (signal?.aborted) throw { kind: 'cancelled', status: null } satisfies InvitationProblem;
    latest = await listInvitations(slug, { pageSize, pageNumber }, signal);
    results.push(...latest.results);
    if (pageNumber * pageSize >= latest.count) break;
  }

  return { ...latest, results };
}

export function getInvitation(slug: string, id: string, signal?: AbortSignal): Promise<InvitationDto> {
  return runInvitationRequest(async () => {
    const response = await api.get<unknown>(itemPath(slug, id), { ...config, signal });

    return InvitationDtoSchema.parse(response.data);
  });
}

export function createInvitation(slug: string, input: InvitationCreate, key: string): Promise<InvitationDto> {
  return runInvitationRequest(async () => {
    const body = parseInvitationInput(InvitationCreateSchema, input);
    const response = await api.post<unknown>(collectionPath(slug), body, { ...config, headers: keyHeaders(key) });

    return InvitationDtoSchema.parse(response.data);
  });
}

export function updateInvitation(slug: string, id: string, input: InvitationUpdate): Promise<InvitationDto> {
  return runInvitationRequest(async () => {
    const body = parseInvitationInput(InvitationUpdateSchema, input);
    const response = await api.patch<unknown>(itemPath(slug, id), body, config);

    return InvitationDtoSchema.parse(response.data);
  });
}

export function resendInvitation(
  slug: string,
  id: string,
  input: InvitationResend,
  key: string,
): Promise<InvitationDto> {
  return runInvitationRequest(async () => {
    const body = parseInvitationInput(InvitationResendSchema, input);
    const response = await api.post<unknown>(`${itemPath(slug, id)}/resend`, body, {
      ...config,
      headers: keyHeaders(key),
    });

    return InvitationDtoSchema.parse(response.data);
  });
}

export function cancelInvitation(slug: string, id: string, input: InvitationCancel): Promise<void> {
  return runInvitationRequest(async () => {
    const { expectedRevision } = parseInvitationInput(InvitationCancelSchema, input);
    await api.delete<unknown>(itemPath(slug, id), {
      ...config,
      params: { version: INVITATION_API_VERSION, expectedRevision },
    });
  });
}
