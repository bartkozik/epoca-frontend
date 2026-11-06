import { FetchProjectsDto } from '@/modules/projects/types';

export const projectQueryKey = (organizationSlug: string, projectId: string): readonly [string, string, string] => [
  'project',
  organizationSlug,
  projectId,
];

export const projectsQueryKey = (dto: FetchProjectsDto): readonly [string, string] => ['projects', JSON.stringify(dto)];
