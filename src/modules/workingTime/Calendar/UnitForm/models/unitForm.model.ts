import { convertTimeFormat, formatValidationMessage } from '@/core/utils/helpers';
import { z } from 'zod';

// Duration validation for a Worklog entry only -- a Note entry never carries a duration. maxDuration
// is a genuine runtime value (a project's max-loggable-hours business rule), so it stays a parameter
// rather than something to make static.
const durationWithinLimitSchema = (maxDuration: number): z.ZodType<string> =>
  z
    .string()
    .min(1, 'working_time.calendar.unit_form.error.hours_field_required')
    .refine(
      (val) => {
        const formattedTime = convertTimeFormat({ time: val, fractionalHour: true });
        const convertedVal = parseFloat(formattedTime);
        return convertedVal > 0;
      },
      { message: 'working_time.calendar.unit_form.error.cannot_report_0_hours' },
    )
    .refine(
      (val) => {
        const formattedTime = convertTimeFormat({ time: val, fractionalHour: true }) || '0';
        const convertedVal = parseFloat(formattedTime);
        return convertedVal <= Number(maxDuration);
      },
      {
        message: formatValidationMessage('working_time.calendar.unit_form.error.maximum_amount_of_hours_count', {
          hours: maxDuration,
        }),
      },
    );

export const WorklogFormSchema = (
  maxDuration: number,
): z.ZodType<
  { projectId: string; duration: string; description: string; taskId: string | null; date?: string },
  z.ZodTypeDef,
  { projectId: string; duration: string; description: string; taskId: string | null; date?: string }
> =>
  z.object({
    projectId: z.string().min(1, 'working_time.calendar.unit_form.error.clients_and_project_required'),
    duration: durationWithinLimitSchema(maxDuration),
    description: z.string().min(1, 'working_time.calendar.unit_form.error.description_field_required'),
    taskId: z.string().nullable(),
    date: z.string().optional(),
  });

export const NoteFormSchema = z.object({
  projectId: z.string().min(1, 'working_time.calendar.unit_form.error.clients_and_project_required'),
  duration: z.string().optional(),
  description: z.string().min(1, 'working_time.calendar.unit_form.error.description_field_required'),
  taskId: z.string().nullable(),
  date: z.string().optional(),
});

export type WorklogFormValues = z.infer<ReturnType<typeof WorklogFormSchema>>;
export type NoteFormValues = z.infer<typeof NoteFormSchema>;
