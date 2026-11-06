import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { ReportedUnit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { render, RenderResult, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { createQueryWrapper, overrideFixture } from '../../workUnitOverride/overrideTestFixtures';
import ReportTableRow from './ReportTableRow';

let authState: {
  hasAccess: (permissions: unknown) => boolean;
  loggedInUser: { id: string };
};
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => authState }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

const { refreshReportedUnitsMock } = vi.hoisted(() => ({
  refreshReportedUnitsMock: vi.fn(),
}));

vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({
  refreshReportedUnits: refreshReportedUnitsMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/core/theme/linkCreator', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('@/core/theme/moreInfoDropdown', () => ({
  __esModule: true,
  default: ({
    children,
    items,
  }: {
    children: React.ReactNode;
    items: Array<{ label: string; value?: string | JSX.Element }>;
  }) => (
    <aside aria-label="Mobile More">
      <ul>
        {items.map(({ label, value }) => (
          <li key={label} data-testid={`more-${label}`}>
            <span>{label}: </span>
            {value}
          </li>
        ))}
      </ul>
      {children}
    </aside>
  ),
}));

const sourceProjectClient = {
  clientColor: '#123456',
  clientId: 'client-1',
  clientName: 'Iterators',
  clientTexture: '',
  projectDescription: '',
  projectId: 'project-1',
  projectName: 'Epoca',
};

const createUnit = (overrides: Partial<ReportedUnit> = {}): ReportedUnit => ({
  convertedDate: new Date('2026-07-28T00:00:00.000Z'),
  createdAt: '2026-07-28T08:00:00.000Z',
  date: '2026-07-28',
  description: 'Administrative entry',
  duration: 'PT8H',
  entryType: WorkUnitEntryType.Worklog,
  formattedCreatedAt: '28/07/2026',
  formattedDate: '28/07/2026',
  formattedDuration: '8:00',
  formattedReportDuration: '8:00',
  id: 'unit-1',
  modifiedAt: '2026-07-28T08:00:00.000Z',
  projectClient: sourceProjectClient,
  sequenceIndex: 0,
  state: UnitState.Active,
  taskId: 'CT-509',
  userFullName: 'Test User',
  userId: 'user-1',
  effectiveProjectClient: sourceProjectClient,
  effectiveTaskId: 'CT-509',
  ...overrides,
});

interface RenderRowOptions {
  hasInternalAccess?: boolean;
  hasOwnerAccess?: boolean;
  loggedInUserId?: string;
  onArchive?: Mock;
  onEdit?: Mock;
}

interface RenderRowResult extends RenderResult {
  onArchive: Mock;
  onEdit: Mock;
}

const renderRow = (unit: ReportedUnit, options: RenderRowOptions = {}): RenderRowResult => {
  const {
    hasInternalAccess = true,
    hasOwnerAccess = true,
    loggedInUserId = 'user-1',
    onArchive = vi.fn(),
    onEdit = vi.fn(),
  } = options;

  authState = {
    hasAccess: vi.fn((permissions) => {
      if (permissions === ROLE_PERMISSIONS.Internal) return hasInternalAccess;
      if (permissions === ROLE_PERMISSIONS.Owner) return hasOwnerAccess;
      return false;
    }),
    loggedInUser: { id: loggedInUserId },
  };

  const { wrapper } = createQueryWrapper();
  const view = render(
    <table>
      <tbody>
        <ReportTableRow
          isSelected={false}
          onArchive={onArchive}
          onCheckboxClick={vi.fn()}
          onEdit={onEdit}
          unit={unit}
        />
      </tbody>
    </table>,
    { wrapper },
  );

  return { ...view, onArchive, onEdit };
};

describe('ReportTableRow entry types', () => {
  it('uses a corrected Task ID on desktop and mobile without showing the source task', () => {
    renderRow(createUnit({ effectiveTaskId: 'CORRECTED' }));
    expect(screen.getByRole('cell', { name: 'CORRECTED' })).toBeVisible();
    expect(within(screen.getByLabelText('Mobile More')).getByText('CORRECTED')).toBeVisible();
    expect(screen.queryByText('CT-509')).not.toBeInTheDocument();
  });
  it('keeps source-less rows visible with safe unknown effective values and no ordinary edit entry point', () => {
    renderRow(
      createUnit({
        projectClient: null,
        effectiveProjectClient: null,
        effectiveTaskId: null,
      } as unknown as Partial<ReportedUnit>),
    );
    expect(screen.getByRole('row')).toBeVisible();
    expect(screen.getAllByRole('cell', { name: 'common.unknown' })).toHaveLength(2);
    screen.getAllByRole('button', { name: /common\.edit$/ }).forEach((button) => expect(button).toBeDisabled());
  });

  it('keeps correction and history available for a row without a source project', () => {
    renderRow(
      createUnit({
        projectClient: null,
        effectiveProjectClient: createUnit().projectClient,
        override: overrideFixture().override,
      } as unknown as Partial<ReportedUnit>),
    );
    screen.getAllByRole('button', { name: /common\.edit$/ }).forEach((button) => expect(button).toBeEnabled());
  });

  it('renders only effective project/client values and preserves an explicitly cleared Task ID on desktop and mobile', () => {
    const unit = createUnit();
    renderRow(
      createUnit({
        effectiveProjectClient: {
          ...sourceProjectClient,
          projectName: 'Corrected project',
          clientName: 'Corrected client',
        },
        effectiveTaskId: null,
      }),
    );
    expect(screen.getByRole('cell', { name: 'Corrected project' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Corrected client' })).toBeVisible();
    const mobile = within(screen.getByLabelText('Mobile More'));
    expect(mobile.getByText('Corrected project')).toBeVisible();
    expect(mobile.getByText('Corrected client')).toBeVisible();
    expect(screen.queryByText('CT-509')).not.toBeInTheDocument();
    expect(screen.queryByText('Epoca')).not.toBeInTheDocument();
    expect(unit.taskId).toBe('CT-509');
  });

  it('shows no reported hours and no entry type cell for a note', () => {
    renderRow(
      createUnit({
        duration: 'PT0S',
        entryType: WorkUnitEntryType.Note,
        formattedDuration: '0:00',
        formattedReportDuration: '0:00',
      }),
    );

    expect(screen.queryByRole('cell', { name: 'working_time.entry_type.note' })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '-' })).toBeVisible();
    expect(screen.queryByRole('cell', { name: '0:00' })).not.toBeInTheDocument();
  });

  it('shows the reported duration of a worklog without an entry type cell', () => {
    renderRow(createUnit());

    expect(screen.queryByRole('cell', { name: 'working_time.entry_type.worklog' })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '8:00' })).toBeVisible();
  });
});

describe('ReportTableRow action matrix', () => {
  it.each(['canEdit', 'canViewHistory'] as const)(
    'enables the single pencil for backend %s without granting delete',
    (permission) => {
      const override = overrideFixture().override;
      override.active = false;
      override.permissions = { ...override.permissions, canEdit: false, canViewHistory: false, [permission]: true };
      renderRow(createUnit({ override }), { hasOwnerAccess: false, loggedInUserId: 'another-user' });
      screen.getAllByRole('button', { name: /common\.edit$/ }).forEach((button) => expect(button).toBeEnabled());
      screen.getAllByRole('button', { name: /common\.delete$/ }).forEach((button) => expect(button).toBeDisabled());
    },
  );

  it('shows a correction pencil for an external actor only when the backend allows it', () => {
    renderRow(createUnit({ override: { ...overrideFixture().override, active: false } }), {
      hasInternalAccess: false,
      hasOwnerAccess: false,
      loggedInUserId: 'another-user',
    });
    screen.getAllByRole('button', { name: /common\.edit$/ }).forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: /common\.delete$/ })).not.toBeInTheDocument();
  });

  it("natively disables source actions for an Internal user viewing another user's row", async () => {
    const user = userEvent.setup();
    const { onArchive, onEdit } = renderRow(createUnit(), {
      hasInternalAccess: true,
      hasOwnerAccess: false,
      loggedInUserId: 'another-user',
    });

    const editButtons = screen.getAllByRole('button', { name: /common\.edit$/ });
    const deleteButtons = screen.getAllByRole('button', { name: /common\.delete$/ });
    editButtons.forEach((button) => expect(button).toBeDisabled());
    deleteButtons.forEach((button) => expect(button).toBeDisabled());

    editButtons[0].focus();
    await user.keyboard('{Enter}');
    deleteButtons[0].focus();
    await user.keyboard('{Enter}');

    expect(onEdit).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
  });
});
