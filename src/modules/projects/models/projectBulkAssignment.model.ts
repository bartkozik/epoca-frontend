import { AssignUserToAllProjectsResultSchema } from '@/modules/projects/models/projectDto.model';
import { z } from 'zod';

export type ToggleAllProjectsAssignmentResult = z.infer<typeof AssignUserToAllProjectsResultSchema>;
