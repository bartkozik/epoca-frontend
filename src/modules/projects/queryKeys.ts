import { FetchProjectsDto } from '@/modules/projects/types';

// Keyed on organizationSlug too, not just projectId -- an org switch never clears the query cache
// itself, so a cached project could otherwise outlive it.
export const projectQueryKey = (organizationSlug: string, projectId: string): readonly [string, string, string] => [
  'project',
  organizationSlug,
  projectId,
];

// 'projects' stable prefix + JSON-stringified dto, kept general over FetchProjectsDto (not
// hardcoded to useProjectsQuery's own dto) so other fetch variants can share the key shape.
export const projectsQueryKey = (dto: FetchProjectsDto): readonly [string, string] => ['projects', JSON.stringify(dto)];
