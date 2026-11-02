import { NoteFormSchema, WorklogFormSchema } from './unitForm.model';

const baseForm = {
  projectId: 'project-1',
  description: 'Administrative entry',
  taskId: null,
  date: '2026-08-10',
};

describe('NoteFormSchema', () => {
  it('accepts a Note without duration', () => {
    const result = NoteFormSchema.safeParse({
      ...baseForm,
      duration: undefined,
    });

    expect(result.success).toBe(true);
  });
});

describe('WorklogFormSchema', () => {
  it.each(['', '0', '0:00'])('rejects Worklog duration %s', (duration) => {
    const result = WorklogFormSchema(8).safeParse({
      ...baseForm,
      duration,
    });

    expect(result.success).toBe(false);
  });

  it('accepts a positive Worklog duration within the daily limit', () => {
    const result = WorklogFormSchema(8).safeParse({
      ...baseForm,
      duration: '1:00',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a Worklog duration over the daily limit with an interpolated message', () => {
    const result = WorklogFormSchema(8).safeParse({
      ...baseForm,
      duration: '9:00',
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const durationError = result.error.errors.find((err) => err.path[0] === 'duration');
    expect(durationError).toBeDefined();

    const payload = JSON.parse(durationError!.message) as {
      marker: string;
      key: string;
      params: Record<string, unknown>;
    };
    expect(payload.key).toBe('working_time.calendar.unit_form.error.maximum_amount_of_hours_count');
    expect(payload.params).toEqual({ hours: 8 });
  });
});
