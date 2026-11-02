import type { WorkUnitOverrideHistoryPage } from '@/modules/reports/models/workUnitOverride.model';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  apiResponse,
  createQueryWrapper,
  deferredResponse,
  historyEntryFixture,
  overrideFixture,
  workUnitId,
} from './overrideTestFixtures';
import { getWorkUnitOverrideHistory } from './requests';
import WorkUnitOverrideBadge from './WorkUnitOverrideBadge';

let contextOrganizationSlug = 'acme';
const workspaceContext = {
  get contextOrganizationSlug(): string {
    return contextOrganizationSlug;
  },
};
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => workspaceContext,
}));
vi.mock('./requests', () => ({ getWorkUnitOverrideHistory: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({ refreshReportedUnits: refresh }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
const history = vi.mocked(getWorkUnitOverrideHistory);
let wrapper: ReturnType<typeof createQueryWrapper>['wrapper'];
const page = (): WorkUnitOverrideHistoryPage => ({
  count: 1,
  pageNumber: 1,
  pageSize: 25,
  upToVersion: 3,
  results: [historyEntryFixture()],
});
beforeEach(() => {
  vi.resetAllMocks();
  contextOrganizationSlug = 'acme';
  ({ wrapper } = createQueryWrapper());
  refresh.mockResolvedValue(undefined);
  history.mockResolvedValue(apiResponse(page()));
});
const props = (): React.ComponentProps<typeof WorkUnitOverrideBadge> => ({
  workUnitId,
  override: overrideFixture().override,
  revision: 8,
});
it('renders an active badge only and removes it after reset', () => {
  const value = props();
  const view = render(<WorkUnitOverrideBadge {...value} />, { wrapper });
  expect(screen.getByRole('button', { name: 'reports.override.badge' })).toBeVisible();
  expect(history).not.toHaveBeenCalled();
  view.rerender(<WorkUnitOverrideBadge {...value} override={{ ...value.override!, active: false }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it.each(['hover', 'focus', 'touch'] as const)(
  'fetches latest audit details only after actual %s activation',
  async (activation) => {
    const user = userEvent.setup();
    render(<WorkUnitOverrideBadge {...props()} />, { wrapper });
    expect(history).not.toHaveBeenCalled();
    const badge = screen.getByRole('button', { name: 'reports.override.badge' });
    if (activation === 'hover') await user.hover(badge);
    if (activation === 'focus') await user.tab();
    if (activation === 'touch')
      await user.pointer([
        { keys: '[TouchA>]', target: badge },
        { keys: '[/TouchA]', target: badge },
      ]);
    expect(await screen.findByText('Manager')).toBeInTheDocument();
    expect(history).toHaveBeenCalledExactlyOnceWith('acme', workUnitId, 3, 1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Source project → Corrected project');
    expect(screen.getByRole('tooltip')).toHaveTextContent('SOURCE → CORRECTED');
    expect(screen.queryByRole('button', { name: 'reports.override.history.loadMore' })).not.toBeInTheDocument();
  },
);
it('limits the tooltip to one page and directs the user to full history when retained changes are older', async () => {
  const active = { ...historyEntryFixture(), version: 1 };
  const undone = {
    ...active,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version: 3,
    operation: 'Undo' as const,
  };
  const removed = {
    ...active,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    version: 2,
    revertedBy: { eventId: undone.id, actor: undone.actor, changedAt: undone.changedAt },
  };
  history
    .mockResolvedValueOnce(
      apiResponse({ count: 26, pageNumber: 1, pageSize: 25, upToVersion: 3, results: [undone, removed] }),
    )
    .mockResolvedValueOnce(apiResponse({ count: 26, pageNumber: 2, pageSize: 25, upToVersion: 3, results: [active] }));
  const user = userEvent.setup();
  render(<WorkUnitOverrideBadge {...props()} />, { wrapper });
  await user.hover(screen.getByRole('button', { name: 'reports.override.badge' }));
  expect(await screen.findByText('reports.override.history.previewLimited')).toBeVisible();
  expect(history).toHaveBeenCalledExactlyOnceWith('acme', workUnitId, 3, 1);
  expect(screen.queryByText('Manager')).not.toBeInTheDocument();
});
it('shows only nonsensitive generic information without history permission', async () => {
  const user = userEvent.setup();
  const value = props();
  render(
    <WorkUnitOverrideBadge
      {...value}
      override={{ ...value.override!, permissions: { ...value.override!.permissions, canViewHistory: false } }}
    />,
    { wrapper },
  );
  await user.hover(screen.getByRole('button', { name: 'reports.override.badge' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('reports.override.badge.generic');
  expect(history).not.toHaveBeenCalled();
  expect(screen.queryByText('Manager')).not.toBeInTheDocument();
});
it('ignores a closed tooltip response and reloads on the next activation', async () => {
  const pending = deferredResponse<ReturnType<typeof apiResponse<WorkUnitOverrideHistoryPage>>>();
  history.mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  render(<WorkUnitOverrideBadge {...props()} />, { wrapper });
  const badge = screen.getByRole('button', { name: 'reports.override.badge' });
  await user.hover(badge);
  await user.unhover(badge);
  await act(async () => {
    pending.resolve(apiResponse(page()));
    await pending.promise;
  });
  expect(screen.queryByText('Manager')).not.toBeInTheDocument();
  await user.hover(badge);
  expect(await screen.findByText('Manager')).toBeInTheDocument();
  expect(history).toHaveBeenCalledTimes(2);
});
it.each(['revision', 'version', 'permission', 'worklog', 'organization'] as const)(
  'invalidates loaded details on %s change',
  async (change) => {
    const value = props();
    const user = userEvent.setup();
    const view = render(<WorkUnitOverrideBadge {...value} />, { wrapper });
    await user.hover(screen.getByRole('button', { name: 'reports.override.badge' }));
    await screen.findByText('Manager');
    if (change === 'revision') value.revision = 9;
    if (change === 'version') value.override = { ...value.override!, version: 4 };
    if (change === 'permission')
      value.override = { ...value.override!, permissions: { ...value.override!.permissions, canViewHistory: false } };
    if (change === 'worklog') value.workUnitId = 'other';
    if (change === 'organization') contextOrganizationSlug = 'other';
    view.rerender(<WorkUnitOverrideBadge {...value} override={{ ...value.override! }} />);
    expect(screen.queryByText('Manager')).not.toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(1);
  },
);
it('clears restricted details and refreshes the report after confirmed revocation', async () => {
  history.mockRejectedValueOnce({ response: { status: 403 } });
  const user = userEvent.setup();
  render(<WorkUnitOverrideBadge {...props()} />, { wrapper });
  await user.hover(screen.getByRole('button', { name: 'reports.override.badge' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(screen.getByRole('tooltip')).toHaveTextContent('reports.override.badge.generic');
  await user.unhover(screen.getByRole('button', { name: 'reports.override.badge' }));
  await user.hover(screen.getByRole('button', { name: 'reports.override.badge' }));
  expect(history).toHaveBeenCalledOnce();
});
it('keeps old organization responses out even before a parent rerender', async () => {
  const pending = deferredResponse<ReturnType<typeof apiResponse<WorkUnitOverrideHistoryPage>>>();
  history.mockReturnValueOnce(pending.promise);
  render(<WorkUnitOverrideBadge {...props()} />, { wrapper });
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'reports.override.badge' }));
  contextOrganizationSlug = 'other';
  await act(async () => {
    pending.resolve(apiResponse(page()));
    await pending.promise;
  });
  expect(screen.queryByText('Manager')).not.toBeInTheDocument();
});
