import {
  ClientFilterType,
  ClientStatus,
  ClientType,
  OrganizationUserRole,
  ProjectStatus,
  ProjectUserRole,
} from '@/core/models/enums';
import { Language } from '@/core/models/types';
import i18n from 'i18next';
import {
  ClientFilterTypeOption,
  ClientStatusOption,
  ClientTypeOption,
  LanguageOption,
  OrganizationUserRoleOption,
  ProjectStatusOption,
  ProjectUserRoleOption,
} from './option-types';

export const getClientStatusOptions = (): ClientStatusOption[] => [
  { value: ClientStatus.Active, label: i18n.t('common.active') },
  { value: ClientStatus.Archived, label: i18n.t('common.archived') },
];

export const getClientTypeOptions = (): ClientTypeOption[] => [
  { value: ClientType.External, label: i18n.t('common.external') },
  { value: ClientType.Internal, label: i18n.t('common.internal') },
];

export const getClientFilterTypeOptions = (): ClientFilterTypeOption[] => [
  { value: ClientFilterType.All, label: i18n.t('common.all') },
  { value: ClientFilterType.External, label: i18n.t('common.external') },
  { value: ClientFilterType.Internal, label: i18n.t('common.internal') },
];

export const getProjectStatusOptions = (): ProjectStatusOption[] => [
  { value: ProjectStatus.Active, label: i18n.t('common.active') },
  { value: ProjectStatus.Archived, label: i18n.t('common.archived') },
];

export const getProjectUserRoleOptions = (): ProjectUserRoleOption[] => [
  { value: ProjectUserRole.Owner, label: i18n.t('common.owner') },
  { value: ProjectUserRole.Member, label: i18n.t('common.member') },
];

export const getLanguageOptions = (): LanguageOption[] => [
  { value: Language.Polish, label: i18n.t('common.pl') },
  { value: Language.English, label: i18n.t('common.en') },
];

export const getOrganizationUserRoleOptions = (): OrganizationUserRoleOption[] => [
  { value: OrganizationUserRole.Employee, label: i18n.t('common.employee') },
  { value: OrganizationUserRole.External, label: i18n.t('common.external') },
  { value: OrganizationUserRole.Manager, label: i18n.t('common.manager') },
  { value: OrganizationUserRole.Owner, label: i18n.t('common.owner') },
];
