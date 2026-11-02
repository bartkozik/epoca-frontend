import enTranslation from '@/core/i18n/locales/en/translation.json';
import plTranslation from '@/core/i18n/locales/pl/translation.json';
import { UnitState, Unit as UnitType, WorkUnitEntryType } from '@/modules/workingTime/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Unit from './Unit';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));

vi.mock('@/core/utils/helpers', async () => ({
  ...(await vi.importActual<typeof import('@/core/utils/helpers')>('@/core/utils/helpers')),
  convertImageToGrayscale: (_src: string, callback: (newTexture: string) => void) => callback('gray-texture'),
}));

const createUnit = (overrides: Partial<UnitType> = {}): UnitType => ({
  convertedDate: new Date('2026-07-28T00:00:00.000Z'),
  createdAt: '2026-07-28T08:00:00.000Z',
  date: '2026-07-28',
  description: 'Implement CT-513 task ID badge',
  duration: 'PT8H',
  entryType: WorkUnitEntryType.Worklog,
  formattedCreatedAt: '28/07/2026',
  formattedDate: '28/07/2026',
  formattedDuration: '8:00',
  formattedReportDuration: '8:00',
  id: 'unit-513',
  modifiedAt: '2026-07-28T08:00:00.000Z',
  projectClient: {
    clientColor: '#123456',
    clientId: 'client-513',
    clientName: 'Iterators',
    clientTexture: 'texture.png',
    projectDescription: 'Internal work',
    projectId: 'project-513',
    projectName: 'Epoca',
  },
  sequenceIndex: 0,
  state: UnitState.Active,
  taskId: 'CT-513',
  userFullName: 'Test User',
  userId: 'user-513',
  ...overrides,
});

describe('Unit task ID badge', () => {
  it('marks a Note accessibly without presenting it as reported time', () => {
    const note = createUnit({
      description: 'Planned absence',
      duration: 'PT0S',
      entryType: WorkUnitEntryType.Note,
      formattedDuration: '0:00',
      formattedReportDuration: '0:00',
    });

    render(<Unit data={note} />);

    expect(screen.getByText('working_time.entry_type.note')).toBeVisible();
    expect(screen.queryByText('0:00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pencil.svg' })).toBeVisible();

    const tile = screen.getByRole('article', { name: note.description });
    expect(Number.parseFloat(tile.style.height)).toBeGreaterThan(0);
  });

  it('shows one task ID in a top tooltip on hover and focus', async () => {
    const user = userEvent.setup();
    render(<Unit data={createUnit()} />);

    const badge = screen.getByRole('button', {
      name: 'working_time.calendar.unit.task_id_badge.aria_label:1',
    });
    const tooltip = screen.getByRole('tooltip', { hidden: true });

    expect(badge).toHaveTextContent('# ID');
    expect(badge).not.toHaveTextContent('×');

    await user.hover(badge);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    expect(tooltip).toHaveAttribute('data-placement', 'top');
    expect(tooltip).toHaveTextContent('working_time.calendar.unit.task_id_badge.tooltip_title:1');
    expect(tooltip).toHaveTextContent('CT-513');

    await user.unhover(badge);
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');

    await user.tab();
    expect(badge).toHaveFocus();
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  });

  it('counts cleaned task IDs while preserving their order and duplicates in the tooltip', async () => {
    const user = userEvent.setup();
    render(<Unit data={createUnit({ taskId: ' CT-513, ,CT-426, CT-513 ' })} />);

    const badge = screen.getByRole('button', {
      name: 'working_time.calendar.unit.task_id_badge.aria_label:3',
    });

    expect(badge).toHaveTextContent('# ID ×3');

    await user.hover(badge);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('CT-513, CT-426, CT-513');
  });

  it('shows a badge for a draft without rendering the saved edit action', () => {
    render(<Unit data={createUnit()} isDraft />);

    expect(screen.getByRole('button', { name: 'working_time.calendar.unit.task_id_badge.aria_label:1' })).toBeVisible();
    expect(screen.getByRole('button', { name: /common\.draft/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'pencil.svg' })).not.toBeInTheDocument();
  });

  it.each<[string, UnitType['taskId']]>([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['commas only', ' , , '],
  ])('does not show a badge for %s task IDs', (_description, taskId) => {
    render(<Unit data={createUnit({ taskId })} />);

    expect(
      screen.queryByRole('button', { name: /working_time\.calendar\.unit\.task_id_badge\.aria_label/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the tooltip without editing when the badge is clicked, while tile text still edits the exact unit', async () => {
    const user = userEvent.setup();
    const unit = createUnit();
    const onEdit = vi.fn();
    render(<Unit data={unit} onEdit={onEdit} />);

    const badge = screen.getByRole('button', {
      name: 'working_time.calendar.unit.task_id_badge.aria_label:1',
    });
    const tooltip = screen.getByRole('tooltip', { hidden: true });

    await user.click(badge);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    expect(onEdit).not.toHaveBeenCalled();

    await user.click(badge);
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    expect(onEdit).not.toHaveBeenCalled();

    await user.click(screen.getByText(unit.description));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(unit);
  });

  it('edits a saved unit exactly once when its pencil action is clicked', async () => {
    const user = userEvent.setup();
    const unit = createUnit();
    const onEdit = vi.fn();
    render(<Unit data={unit} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'pencil.svg' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(unit);
  });

  it('keeps the time, task ID badge, and edit action in a saved footer', () => {
    render(<Unit data={createUnit()} />);

    expect(screen.getByText('8:00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'working_time.calendar.unit.task_id_badge.aria_label:1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'pencil.svg' })).toBeVisible();
  });

  it('keeps all ten cleaned task IDs available in the tooltip', async () => {
    const user = userEvent.setup();
    const taskIds = Array.from({ length: 10 }, (_, index) => `CT-${index + 1}`);
    render(<Unit data={createUnit({ taskId: taskIds.map((taskId) => ` ${taskId} `).join(',') })} />);

    const badge = screen.getByRole('button', {
      name: 'working_time.calendar.unit.task_id_badge.aria_label:10',
    });

    await user.hover(badge);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(taskIds.join(', '));
  });

  it('includes the exact English and Polish badge translations', () => {
    expect(enTranslation['working_time.calendar.unit.task_id_badge.aria_label']).toBe(
      'Added {count} {count, plural, one {task ID} other {task IDs}}',
    );
    expect(enTranslation['working_time.calendar.unit.task_id_badge.tooltip_title']).toBe(
      '{count, plural, one {Task ID} other {Task IDs}}',
    );
    expect(plTranslation['working_time.calendar.unit.task_id_badge.aria_label']).toBe(
      'Dodano {count} {count, plural, one {ID zadania} few {ID zadań} other {ID zadań}}',
    );
    expect(plTranslation['working_time.calendar.unit.task_id_badge.tooltip_title']).toBe(
      '{count, plural, one {ID zadania} few {ID zadań} other {ID zadań}}',
    );
  });

  it('renders no tile when project client data is unavailable', () => {
    const unit = createUnit();
    const unitWithoutProjectClient = { ...unit, projectClient: null } as unknown as UnitType;

    expect(() => render(<Unit data={unitWithoutProjectClient} />)).not.toThrow();
    expect(screen.queryByText(unit.description)).not.toBeInTheDocument();
  });
});
