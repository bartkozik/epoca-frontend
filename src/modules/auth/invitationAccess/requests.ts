import api from '@/core/api';
import type { AxiosRequestConfig } from 'axios';
import {
  InvitationAcceptSchema,
  InvitationCreatePasswordSchema,
  InvitationExchangeSchema,
  InvitationJoinedSchema,
  InvitationSamlStartSchema,
  InvitationSummarySchema,
  type InvitationJoined,
  type InvitationSamlStart,
  type InvitationSummary,
} from '../models/invitationAccess.model';
import { runInvitationAccessRequest } from './problem';

const INVITATION_REQUEST_TIMEOUT_MS = 30_000;

const invitationRequestConfig = (bearer?: string, csrfToken?: string): AxiosRequestConfig => ({
  authPolicy: { mode: 'explicit', token: bearer ?? null },
  withCredentials: true,
  timeout: INVITATION_REQUEST_TIMEOUT_MS,
  skipConnectionErrorToast: true,
  headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
});

export const exchangeInvitation = (token: string, bearer?: string): Promise<InvitationSummary> =>
  runInvitationAccessRequest(async () => {
    const body = InvitationExchangeSchema.parse({ token });
    const response = await api.post<unknown>('/invitation-access/exchange', body, invitationRequestConfig(bearer));

    return InvitationSummarySchema.parse(response.data);
  });

export const getInvitationSummary = (bearer?: string): Promise<InvitationSummary> =>
  runInvitationAccessRequest(async () => {
    const response = await api.get<unknown>('/invitation-access', invitationRequestConfig(bearer));

    return InvitationSummarySchema.parse(response.data);
  });

export const acceptInvitation = (
  summary: Pick<InvitationSummary, 'revision' | 'csrfToken'>,
  bearer?: string,
  password?: string,
): Promise<InvitationJoined> =>
  runInvitationAccessRequest(async () => {
    const body =
      password === undefined
        ? InvitationAcceptSchema.parse({ expectedRevision: summary.revision })
        : InvitationCreatePasswordSchema.parse({ expectedRevision: summary.revision, password });
    const response = await api.post<unknown>(
      password === undefined ? '/invitation-access/accept' : '/invitation-access/password',
      body,
      invitationRequestConfig(bearer, summary.csrfToken),
    );

    return InvitationJoinedSchema.parse(response.data);
  });

export const startInvitationSaml = (csrfToken: string, bearer?: string): Promise<InvitationSamlStart> =>
  runInvitationAccessRequest(async () => {
    const response = await api.post<unknown>(
      '/invitation-access/saml',
      undefined,
      invitationRequestConfig(bearer, csrfToken),
    );

    return InvitationSamlStartSchema.parse(response.data);
  });
