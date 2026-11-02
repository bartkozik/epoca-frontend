import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import type { ReportedUnit } from '@/modules/workingTime/types';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import { overrideFixture, workUnitId } from './overrideTestFixtures';
import ReportWorkUnitEditForm from './ReportWorkUnitEditForm';
import { useWorkUnitOverride } from './useWorkUnitOverride';

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: vi.fn() }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: vi.fn() }));
vi.mock('./useWorkUnitOverride', () => ({ useWorkUnitOverride: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/core/theme/modal', () => ({
  default: ({ children, close }: { children: ReactNode; close: () => void }) => (
    <div role="dialog">
      <button onClick={close}>Close</button>
      {children}
    </div>
  ),
}));
vi.mock('@/core/theme/confirmation', () => ({
  default: ({
    isOpen,
    confirmActions,
  }: {
    isOpen: boolean;
    confirmActions: Array<{ action: () => void; text: string }>;
  }) =>
    isOpen ? (
      <div role="alertdialog">
        {confirmActions.map(({ action, text }) => (
          <button key={text} onClick={action}>
            {text}
          </button>
        ))}
      </div>
    ) : null,
}));
vi.mock('@/modules/workingTime/Calendar/UnitForm', () => ({
  default: ({ unit, onDirtyChange }: { unit: ReportedUnit; onDirtyChange: (dirty: boolean) => void }) => (
    <div data-testid="source-editor">
      {unit.description}
      <button onClick={() => onDirtyChange(true)}>Modify</button>
    </div>
  ),
}));
vi.mock('./WorkUnitOverrideForm', () => ({ default: () => <div data-testid="correction-editor" /> }));
vi.mock('./WorkUnitOverrideHistory', () => ({ default: () => <div data-testid="correction-history" /> }));

const useAuthMock = useAuth as MockedFunction<typeof useAuth>;
const useWorkspaceMock = useWorkspace as MockedFunction<typeof useWorkspace>;
const useProjectsMock = useProjects as MockedFunction<typeof useProjects>;
const useWorkUnitOverrideMock = useWorkUnitOverride as MockedFunction<typeof useWorkUnitOverride>;

const sourceUnit = {
  id: workUnitId,
  userId: workUnitId,
  description: 'Source description',
  projectClient: overrideFixture().projectClient,
  override: { permissions: { canEdit: false, canViewHistory: false } },
} as ReportedUnit;

beforeEach(() => {
  useAuthMock.mockReturnValue({
    hasAccess: () => true,
    loggedInUser: { id: workUnitId },
  } as unknown as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({
    contextOrganizationSlug: 'acme',
    contextOrganizationUsers: [],
  } as unknown as ReturnType<typeof useWorkspace>);
  useProjectsMock.mockReturnValue({ reportedProjects: [] } as unknown as ReturnType<typeof useProjects>);
  useWorkUnitOverrideMock.mockReturnValue({
    base: null,
    dirty: false,
    loadingCurrent: false,
    undoConfirmationOpen: false,
    isBusy: () => false,
  } as unknown as ReturnType<typeof useWorkUnitOverride>);
});

it('opens the source editor and closes it on request', () => {
  const onClose = vi.fn();
  render(<ReportWorkUnitEditForm unit={sourceUnit} onClose={onClose} />);

  expect(screen.getByTestId('source-editor')).toHaveTextContent('Source description');
  expect(screen.queryByTestId('correction-editor')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('shows correction controls when the worklog grants correction access', () => {
  const correctedUnit = {
    ...sourceUnit,
    override: { permissions: { canEdit: true, canViewHistory: true } },
  } as ReportedUnit;
  useWorkUnitOverrideMock.mockReturnValue({
    base: overrideFixture(),
    dirty: false,
    loadingCurrent: false,
    undoConfirmationOpen: false,
    isBusy: () => false,
  } as unknown as ReturnType<typeof useWorkUnitOverride>);

  render(<ReportWorkUnitEditForm unit={correctedUnit} onClose={vi.fn()} />);

  expect(screen.getByTestId('correction-editor')).toBeInTheDocument();
  expect(screen.getByTestId('correction-history')).toBeInTheDocument();
  expect(screen.queryByTestId('source-editor')).not.toBeInTheDocument();
});

it('requires confirmation before discarding a changed source entry', () => {
  const onClose = vi.fn();
  render(<ReportWorkUnitEditForm unit={sourceUnit} onClose={onClose} />);

  fireEvent.click(screen.getByRole('button', { name: 'Modify' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'reports.override.discard.confirm' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('does not render the source editor without permission', () => {
  useAuthMock.mockReturnValue({
    hasAccess: () => false,
    loggedInUser: { id: workUnitId },
  } as unknown as ReturnType<typeof useAuth>);

  render(<ReportWorkUnitEditForm unit={sourceUnit} onClose={vi.fn()} />);

  expect(screen.queryByTestId('source-editor')).not.toBeInTheDocument();
});

it('closes the editor when the organization changes', () => {
  const onClose = vi.fn();
  const view = render(<ReportWorkUnitEditForm unit={sourceUnit} onClose={onClose} />);
  useWorkspaceMock.mockReturnValue({
    contextOrganizationSlug: 'other',
    contextOrganizationUsers: [],
  } as unknown as ReturnType<typeof useWorkspace>);

  view.rerender(<ReportWorkUnitEditForm unit={sourceUnit} onClose={onClose} />);

  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each(['loadingCurrent', 'refreshingReport'] as const)('shows the application loading status during %s', (state) => {
  const unit = { ...sourceUnit, override: { permissions: { canEdit: true, canViewHistory: true } } } as ReportedUnit;
  useWorkUnitOverrideMock.mockReturnValue({ base: null, [state]: true, isBusy: () => true } as unknown as ReturnType<
    typeof useWorkUnitOverride
  >);
  const { rerender } = render(<ReportWorkUnitEditForm unit={unit} onClose={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  useWorkUnitOverrideMock.mockReturnValue({
    base: overrideFixture(),
    [state]: false,
    isBusy: () => false,
  } as unknown as ReturnType<typeof useWorkUnitOverride>);
  rerender(<ReportWorkUnitEditForm unit={unit} onClose={vi.fn()} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByTestId('correction-editor')).toBeVisible();
});
