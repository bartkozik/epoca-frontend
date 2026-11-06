import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { z } from 'zod';
import { Project } from '../types';

export const ProjectFormSchema = (
  projects: Project[],
  currentProjectId?: string,
): z.ZodType<{ projectName: string }, z.ZodTypeDef, { projectName: string }> =>
  z.object({
    projectName: z
      .string()
      .min(1, 'projects.project_form.error.project_name_required')
      .max(MAX_NAME_LENGTH, 'projects.project_form.error.project_name_too_long')
      .refine(
        (value) =>
          !projects.some(
            (project) => project.name.toLowerCase() === value.trim().toLowerCase() && project.id !== currentProjectId,
          ),
        { message: 'common.error.name_is_already_in_use' },
      ),
  });
