import { WorkUnitEntryType } from '@/modules/workingTime/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntryTypeSelector from './EntryTypeSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('EntryTypeSelector', () => {
  it('shows both choices, marks time entry as selected and reports a Note selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EntryTypeSelector
        label="working_time.calendar.unit_form.question.what_to_add"
        onChange={onChange}
        value={WorkUnitEntryType.Worklog}
      />,
    );

    const worklog = screen.getByRole('button', { name: 'working_time.entry_type.worklog' });
    const note = screen.getByRole('button', { name: 'working_time.entry_type.note' });

    expect(screen.getByRole('group', { name: 'working_time.calendar.unit_form.question.what_to_add' })).toBeVisible();
    expect(worklog).toHaveAttribute('aria-pressed', 'true');
    expect(note).toHaveAttribute('aria-pressed', 'false');

    await user.click(note);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(WorkUnitEntryType.Note);
  });

  it('marks Note as selected and switches back to time entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EntryTypeSelector
        label="working_time.calendar.unit_form.question.what_to_add"
        onChange={onChange}
        value={WorkUnitEntryType.Note}
      />,
    );

    const worklog = screen.getByRole('button', { name: 'working_time.entry_type.worklog' });
    const note = screen.getByRole('button', { name: 'working_time.entry_type.note' });

    expect(worklog).toHaveAttribute('aria-pressed', 'false');
    expect(note).toHaveAttribute('aria-pressed', 'true');

    await user.click(worklog);

    expect(onChange).toHaveBeenCalledWith(WorkUnitEntryType.Worklog);
  });
});
