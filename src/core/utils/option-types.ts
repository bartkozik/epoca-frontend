import {
  ClientFilterType,
  ClientStatus,
  ClientType,
  OrganizationUserRole,
  ProjectStatus,
  ProjectUserRole,
} from '@/core/models/enums';
import { Language } from '@/core/models/types';
import { CustomSelectOption } from '@/core/theme/inputs';

export type ClientFilterTypeOption = CustomSelectOption<ClientFilterType>;
export type ClientStatusOption = CustomSelectOption<ClientStatus>;
export type ClientTypeOption = CustomSelectOption<ClientType>;
export type LanguageOption = CustomSelectOption<Language>;
export type OrganizationUserRoleOption = CustomSelectOption<OrganizationUserRole>;
export type ProjectStatusOption = CustomSelectOption<ProjectStatus>;
export type ProjectUserRoleOption = CustomSelectOption<ProjectUserRole>;
