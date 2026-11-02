import { ApiResponse } from '@/core/api';
// CT-540: canonical definition lives in core/models/enums (core needs the enum itself for
// status/role selects) — re-exported below so every existing `from '@/modules/organizations/types'`
// site keeps working unchanged.
import { OrganizationUserRole } from '@/core/models/enums';
import { User } from '@/modules/users/types';
import { z } from 'zod';
import {
  OrganizationUserProjectSchema,
  RawOrganizationResultsSchema,
  RawOrganizationSchema,
  RawOrganizationUserSchema,
} from './models/organizationDto.model';

export type RawOrganization = z.infer<typeof RawOrganizationSchema>;
export type RawOrganizationsResults = z.infer<typeof RawOrganizationResultsSchema>;
export type RawOrganizationUser = z.infer<typeof RawOrganizationUserSchema>;
export type OrganizationUserProject = z.infer<typeof OrganizationUserProjectSchema>;

export interface Organization extends RawOrganization {
  users: User[];
  archived: boolean;
}

export interface OrganizationUser extends RawOrganizationUser {
  displayedName: string;
  fullName: string;
  projects: OrganizationUserProject[];
  email: string;
  name?: string;
}

export { OrganizationUserRole };

export type OrganizationDeleteReturn = ApiResponse<void>;
export type OrganizationReturn = ApiResponse<RawOrganization>;
export type OrganizationsReturn = ApiResponse<RawOrganizationsResults>;
export type OrganizationUsersReturn = ApiResponse<RawOrganizationUser[]>;
export type OrganizationUserProjectsReturn = ApiResponse<OrganizationUserProject[]>;
