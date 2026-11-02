import { OrganizationUserRole } from '@/core/models/enums';
import { InvitationCreateSchema } from '../models/invitationCreate.model';
import type { InvitationDto } from '../models/invitationDto.model';

export const invitationDisplayName = (invitation: InvitationDto): string =>
  [invitation.firstName, invitation.lastName].filter(Boolean).join(' ') || invitation.email;

export const invitationRole = (invitation: InvitationDto): OrganizationUserRole | undefined =>
  invitation.roles.length === 1
    ? Object.values(OrganizationUserRole).find((role) => String(role) === invitation.roles[0])
    : undefined;

export const needsInvitationCompletion = (invitation: InvitationDto): boolean =>
  invitation.protocolVersion < 2 ||
  !invitation.firstName?.trim() ||
  !invitation.lastName?.trim() ||
  !invitationRole(invitation);

export const isEmailInvitation = (invitation: InvitationDto): boolean =>
  InvitationCreateSchema.shape.email.safeParse(invitation.email).success;

export const isWaitingInvitation = (invitation: InvitationDto): boolean =>
  ['Pending', 'Expired'].includes(invitation.status);

export const invitationDelivery = (status: string): string =>
  ['Sent', 'Failed', 'Unknown', 'Started', 'NotSent'].includes(status) ? status : 'Unknown';

export const isListedInvitation = (invitation: InvitationDto): boolean =>
  !['Accepted', 'Cancelled'].includes(invitation.status);
