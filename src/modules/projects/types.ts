import { ApiResponse } from '@/core/api';
import { ProjectStatus, ProjectUserRole } from '@/core/models/enums';
import { z } from 'zod';
import {
  AddProjectArgsSchema,
  AssignUserToAllProjectParamsSchema,
  AssignUserToAllProjectsResultSchema,
  EditProjectArgsSchema,
  FetchProjectsDtoSchema,
  ProjectPatchResultSchema,
  RawProjectResultsSchema,
  RawProjectSchema,
  RawProjectUserSchema,
} from './models/projectDto.model';

export type AssignUserToAllProjectParams = z.infer<typeof AssignUserToAllProjectParamsSchema>;

export enum AssignedMembersSortColumn {
  Name = 'User name',
  Role = 'User role',
}

export type AddProjectArgs = z.infer<typeof AddProjectArgsSchema>;

export type EditProjectArgs = z.infer<typeof EditProjectArgsSchema>;

export type FetchProjectsDto = z.infer<typeof FetchProjectsDtoSchema>;

export interface Projects {
  projects: Project[];
}

export { ProjectStatus, ProjectUserRole };

export enum ProjectsSortColumn {
  Project = 'Project',
  Client = 'Client',
  Members = 'Members',
  DateAdded = 'Date added',
}

export type RawProjectUser = z.infer<typeof RawProjectUserSchema>;

export interface ProjectUser extends RawProjectUser {
  fullName: string;
}

export type RawProject = z.infer<typeof RawProjectSchema>;

export interface Project extends RawProject {
  archived: boolean;
  archivedDate: string;
  formattedCreatedAt: string;
  members: ProjectUser[];
  owners: ProjectUser[];
  projectUsers: ProjectUser[];
}

export type RawProjectResults = z.infer<typeof RawProjectResultsSchema>;

export type ProjectPatchResult = z.infer<typeof ProjectPatchResultSchema>;

export interface SelectedProjectDetails {
  description: string;
  id: string;
  archived: boolean;
  unitCreatorIsNoProjectMember: boolean;
}

export type ProjectReturn = ApiResponse<RawProject>;
export type ProjectPatchReturn = ApiResponse<ProjectPatchResult>;
export type ProjectsReturn = ApiResponse<RawProjectResults>;
export type ProjectDeleteReturn = ApiResponse<void>;
export type AssignUserToAllProjectsReturn = ApiResponse<z.infer<typeof AssignUserToAllProjectsResultSchema>>;
