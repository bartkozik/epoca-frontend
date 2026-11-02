import { ApiResponse } from '@/core/api';
import { OrganizationUserProject } from '@/modules/organizations/types';
import { z } from 'zod';
import { RawUserSchema, UserIdentitySchema } from './models/userDto.model';

export type UserIdentity = z.infer<typeof UserIdentitySchema>;

export type RawUser = z.infer<typeof RawUserSchema>;

export interface User extends RawUser {
  archived: boolean;
  displayedName: string;
  fullName: string;
  isLoggedInUser: boolean;
  projects: (OrganizationUserProject | UserProject)[];
  email: string;
  name?: string;
}

export type UserDto = { email: string; firstName: string; lastName: string };

export enum UserSearchLabel {
  Owner = 'owner',
  Member = 'member',
}

export interface UserProject {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
}

export type UserAction = 'add' | 'remove';

export interface EditUserDto {
  userId: string;
  name: string;
}

export type UserReturn = ApiResponse<RawUser>;
export type UsersReturn = ApiResponse<RawUser[]>;
export type UserDeleteReturn = ApiResponse<void>;
