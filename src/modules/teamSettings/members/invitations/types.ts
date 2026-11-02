import type { InvitationDto } from './models/invitationDto.model';

export type InvitationFormErrors = Record<string, string>;

export type InvitationCompletionFormOptions = {
  onDeliveryResult?: (result: InvitationDto) => void;
  organizationSlug: string;
  invitation: InvitationDto;
  onClose: () => void;
  onSaved?: () => void;
  resend?: boolean;
};
