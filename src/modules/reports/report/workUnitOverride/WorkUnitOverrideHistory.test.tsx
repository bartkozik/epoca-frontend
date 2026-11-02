import {
  WorkUnitOverrideHistoryEntrySchema,
  type WorkUnitOverrideHistoryEntry,
  type WorkUnitOverrideHistoryPage,
} from '@/modules/reports/models/workUnitOverride.model';
import type { AxiosResponse } from 'axios';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createQueryWrapper } from './overrideTestFixtures';
import { getWorkUnitOverrideHistory } from './requests';
import WorkUnitOverrideHistory from './WorkUnitOverrideHistory';
import { WorkUnitOverrideHistoryEvent } from './WorkUnitOverrideHistoryEvent';

vi.mock('./requests', () => ({ getWorkUnitOverrideHistory: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { actor?: string }) => (values?.actor ? `${key}: ${values.actor}` : key),
    i18n: { language: 'en' },
  }),
}));
const value = (
  project: string,
  taskId: string | null,
): {
  projectClient: { projectId: string; projectName: string; clientId: string; clientName: string };
  taskId: string | null;
} => ({
  projectClient: {
    projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    projectName: project,
    clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    clientName: `Client ${project}`,
  },
  taskId,
});
const entry = (patch: Record<string, unknown> = {}): WorkUnitOverrideHistoryEntry =>
  WorkUnitOverrideHistoryEntrySchema.parse({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version: 1,
    operation: 'Replace',
    provenance: 'WorkUnitOverride',
    actor: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Manager' },
    changedAt: '2026-09-17T08:00:00Z',
    before: {
      source: value('original before', 'SOURCE-1'),
      effective: value('stored before', 'BEFORE'),
      projectId: null,
      taskIdOverrideSet: false,
      taskId: { mode: 'Inherit' },
    },
    after: {
      source: value('original after', 'SOURCE-2'),
      effective: value('stored after', null),
      projectId: null,
      taskIdOverrideSet: true,
      taskId: { mode: 'Clear' },
    },
    legacyBefore: null,
    legacyAfter: null,
    ...patch,
  });
let wrapper: ReturnType<typeof createQueryWrapper>['wrapper'];
beforeEach(() => {
  vi.resetAllMocks();
  ({ wrapper } = createQueryWrapper());
});

it('renders compact changes without repeating source snapshots and caps long labels', () => {
  render(<WorkUnitOverrideHistoryEvent entry={entry()} compact />);
  expect(screen.getByText('stored before → stored after')).toBeInTheDocument();
  expect(screen.queryByText('SOURCE-1')).not.toBeInTheDocument();
  expect(screen.getByText('reports.override.history.fullHint')).toBeInTheDocument();
});

it('does not suppress a project identity change when labels are equal', () => {
  const current = entry();
  const parsed = WorkUnitOverrideHistoryEntrySchema.parse(current);
  if (parsed.provenance !== 'WorkUnitOverride' || !parsed.before || !parsed.after)
    throw new Error('Expected current history');
  const event = entry({
    before: { ...parsed.before, effective: value('Same project', 'same task') },
    after: {
      ...parsed.after,
      effective: {
        ...value('Same project', 'same task'),
        projectClient: {
          ...value('Same project', null).projectClient,
          projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
      },
    },
  });
  render(<WorkUnitOverrideHistoryEvent entry={event} compact />);
  expect(screen.getByText('Same project → Same project')).toBeInTheDocument();
  expect(screen.queryByText('reports.override.history.noEffectiveChange')).not.toBeInTheDocument();
});

it('caps compact audit labels without cutting Unicode codepoints and preserves the full-history hint', () => {
  const current = entry();
  const parsed = WorkUnitOverrideHistoryEntrySchema.parse(current);
  if (parsed.provenance !== 'WorkUnitOverride' || !parsed.before || !parsed.after)
    throw new Error('Expected current history');
  const longName = '😀'.repeat(100);
  render(
    <WorkUnitOverrideHistoryEvent
      compact
      entry={entry({
        before: { ...parsed.before, effective: value(longName, 'OLD') },
        after: { ...parsed.after, effective: value('New project', 'NEW') },
      })}
    />,
  );
  expect(screen.getByText(`${'😀'.repeat(39)}… → New project`)).toBeInTheDocument();
  expect(screen.queryByText(longName)).not.toBeInTheDocument();
  expect(screen.getByText('reports.override.history.fullHint')).toBeInTheDocument();
});

it('renders effective client, project and explicit blank Task ID, actor and a localized time', () => {
  render(<WorkUnitOverrideHistoryEvent entry={entry()} />);
  for (const text of [
    'Client stored before',
    'stored before',
    'BEFORE',
    'Client stored after',
    'stored after',
    'Manager',
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByText('reports.override.history.blank')).toBeInTheDocument();
  expect(screen.queryByText('reports.override.history.source')).not.toBeInTheDocument();
  const changedAt = within(screen.getByRole('banner')).getByRole('time');
  expect(changedAt).toHaveAttribute('dateTime', '2026-09-17T08:00:00Z');
  expect(within(changedAt).getByText(new Date('2026-09-17T08:00:00Z').toLocaleDateString('en'))).toBeVisible();
  expect(
    within(changedAt).getByText(
      new Date('2026-09-17T08:00:00Z').toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
    ),
  ).toBeVisible();
});

it('shows three change columns with author and time in the card header and the action below', () => {
  const onUndo = vi.fn();
  render(<WorkUnitOverrideHistoryEvent entry={entry()} onUndo={onUndo} />);

  const table = screen.getByRole('table');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
  ).toEqual(['reports.override.history.field', 'reports.override.history.before', 'reports.override.history.after']);
  const projectRow = within(table).getByRole('row', { name: /common.project/ });
  expect(within(projectRow).getByRole('rowheader')).toHaveTextContent('common.project');
  expect(
    within(projectRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['stored before', 'stored after']);
  const header = screen.getByRole('banner');
  expect(within(header).getByText('Manager')).toBeVisible();
  expect(within(header).getByText(new Date('2026-09-17T08:00:00Z').toLocaleDateString('en'))).toBeVisible();
  expect(within(table).queryByText('Manager')).not.toBeInTheDocument();
  const action = screen.getByRole('button', { name: 'reports.override.undo.action' });
  expect(table.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('shows only changed fields without an extra original-entry section', () => {
  const current = entry();
  if (!current.before || !current.after) throw new Error('Expected current history');
  render(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        before: { ...current.before, effective: value('Unchanged project', 'OLD-TASK') },
        after: { ...current.after, effective: value('Unchanged project', 'NEW-TASK') },
      })}
    />,
  );
  expect(screen.queryByText('Unchanged project')).not.toBeInTheDocument();
  expect(screen.getByText('OLD-TASK')).toBeVisible();
  expect(screen.getByText('NEW-TASK')).toBeVisible();
  expect(screen.getByText('Manager')).toBeVisible();
  expect(screen.queryByText('reports.override.history.source')).not.toBeInTheDocument();
  expect(screen.queryByText('SOURCE-1')).not.toBeInTheDocument();
});

it('keeps the event heading and marks the effective correction separately without changing its historical values', () => {
  render(<WorkUnitOverrideHistoryEvent entry={entry()} isCurrent />);
  expect(within(screen.getByRole('banner')).getByText('reports.override.history.current')).toBeVisible();
  expect(within(screen.getByRole('banner')).getByText('reports.override.history.operation.initial')).toBeVisible();
  expect(screen.getByText('stored before')).toBeVisible();
  expect(screen.getByText('stored after')).toBeVisible();
});

it('distinguishes a replacement from the first correction', () => {
  const current = entry();
  if (!current.before) throw new Error('Expected current history');
  render(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        before: { ...current.before, taskIdOverrideSet: true, taskId: { mode: 'Set', value: 'PREVIOUS' } },
      })}
    />,
  );
  expect(within(screen.getByRole('banner')).getByText('reports.override.history.operation.Replace')).toBeVisible();
  expect(screen.queryByText('reports.override.history.operation.initial')).not.toBeInTheDocument();
});

it('does not duplicate identical original snapshots in history cards', () => {
  const current = entry();
  if (!current.before || !current.after) throw new Error('Expected current history');
  render(
    <WorkUnitOverrideHistoryEvent entry={entry({ after: { ...current.after, source: current.before.source } })} />,
  );
  expect(screen.queryByText('SOURCE-1')).not.toBeInTheDocument();
  expect(within(screen.getByRole('article')).getByText('BEFORE')).toBeVisible();
});

it('labels reset and legacy history explicitly without inventing source snapshots', () => {
  render(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        operation: 'Clear',
        provenance: 'LegacyPmSnapshot',
        before: null,
        after: null,
        legacyBefore: value('historical PM', 'OLD-PM'),
        legacyAfter: { projectClient: null, taskId: null },
      })}
    />,
  );
  expect(screen.getByText('reports.override.history.operation.Clear')).toBeInTheDocument();
  expect(screen.getByText('reports.override.history.legacy')).toBeInTheDocument();
  expect(screen.getByText('reports.override.history.originalUnavailable')).toBeInTheDocument();
  expect(screen.getByText('historical PM')).toBeInTheDocument();
  expect(screen.queryByText('reports.override.history.source')).not.toBeInTheDocument();
});

it('uses a safe fallback for unknown operation and provenance without printing arbitrary payloads', () => {
  render(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        operation: 'Future',
        provenance: 'Future',
        before: { privatePayload: 'DO NOT GUESS' },
        after: null,
      })}
    />,
  );
  expect(screen.getByText('reports.override.history.operation.unknown')).toBeInTheDocument();
  expect(screen.getByText('reports.override.history.unavailable')).toBeInTheDocument();
  expect(screen.queryByText('DO NOT GUESS')).not.toBeInTheDocument();
});

it('labels Undo in full and compact history without exposing an undo action in compact content', () => {
  const undoEntry = entry({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    operation: 'Undo',
    revertsEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  });
  const onUndo = vi.fn();
  const { rerender } = render(<WorkUnitOverrideHistoryEvent entry={undoEntry} onUndo={onUndo} />);
  expect(screen.getByText('reports.override.history.operation.Undo')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'reports.override.undo.action' })).not.toBeInTheDocument();

  rerender(<WorkUnitOverrideHistoryEvent entry={undoEntry} compact onUndo={onUndo} />);
  expect(screen.getByText('reports.override.history.operation.Undo')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'reports.override.undo.action' })).not.toBeInTheDocument();
});

it('identifies whether removing the latest correction restored an earlier correction or the original entry', () => {
  const current = entry();
  if (!current.after) throw new Error('Expected current history');
  const undoEntry = entry({
    operation: 'Undo',
    revertsEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    after: { ...current.after, projectId: null, taskIdOverrideSet: false, taskId: { mode: 'Inherit' } },
  });
  const { rerender } = render(<WorkUnitOverrideHistoryEvent entry={undoEntry} />);
  expect(screen.getByText('reports.override.history.restoredOriginal')).toBeVisible();
  rerender(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        ...undoEntry,
        after: { ...current.after, taskIdOverrideSet: true, taskId: { mode: 'Set', value: 'PREVIOUS' } },
      })}
    />,
  );
  expect(screen.getByText('reports.override.history.restoredPrevious')).toBeVisible();
  expect(screen.queryByText('reports.override.history.restoredOriginal')).not.toBeInTheDocument();
});

it('keeps the original actor and time and renders who reverted the card and when', () => {
  render(
    <WorkUnitOverrideHistoryEvent
      entry={entry({
        revertedBy: {
          eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          actor: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', displayName: 'Undo Manager' },
          changedAt: '2026-09-18T10:30:00Z',
        },
      })}
    />,
  );
  expect(screen.getByText('Manager')).toBeVisible();
  expect(screen.getByText('reports.override.undo.reverted: Undo Manager')).toBeVisible();
  expect(screen.queryByText('reports.override.history.revertedLabel')).not.toBeInTheDocument();
  expect(screen.getByText(new Date('2026-09-18T10:30:00Z').toLocaleString('en'))).toHaveAttribute(
    'dateTime',
    '2026-09-18T10:30:00Z',
  );
});

it('hides undo events and reverted corrections while keeping the latest active correction and its undo action', async () => {
  const onUndo = vi.fn();
  const candidate = entry({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: 2, operation: 'Clear' });
  const newestUndo = entry({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    version: 4,
    operation: 'Undo',
    revertsEventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  });
  const reverted = entry({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    version: 3,
    revertedBy: {
      eventId: newestUndo.id,
      actor: newestUndo.actor,
      changedAt: newestUndo.changedAt,
    },
  });
  vi.mocked(getWorkUnitOverrideHistory)
    .mockResolvedValueOnce({
      data: { results: [newestUndo, reverted], count: 26, pageNumber: 1, pageSize: 25, upToVersion: 4 },
    } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>)
    .mockResolvedValueOnce({
      data: { results: [candidate], count: 26, pageNumber: 2, pageSize: 25, upToVersion: 4 },
    } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={4}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
      undoCandidateId={candidate.id}
      undoDisabled={false}
      onUndo={onUndo}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  const action = await screen.findByRole('button', { name: 'reports.override.undo.action' });
  expect(screen.queryByText('reports.override.history.operation.Undo')).not.toBeInTheDocument();
  expect(screen.queryByText('reports.override.undo.reverted: Manager')).not.toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(action.className).toContain('size-small');
  fireEvent.click(action);
  expect(onUndo).toHaveBeenCalledExactlyOnceWith(candidate);
});

it('marks a retained correction as current even when the viewer cannot remove it', async () => {
  const retained = entry();
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [retained], count: 1, pageNumber: 1, pageSize: 25, upToVersion: 1 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={1}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByText('reports.override.history.current')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'reports.override.undo.action' })).not.toBeInTheDocument();
});

it('does not mark a cleared correction as current when source values were restored', async () => {
  const current = entry();
  if (!current.after) throw new Error('Expected current history');
  const cleared = entry({
    operation: 'Clear',
    after: {
      ...current.after,
      projectId: null,
      taskIdOverrideSet: false,
      taskId: { mode: 'Inherit' },
    },
  });
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [cleared], count: 1, pageNumber: 1, pageSize: 25, upToVersion: 1 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={1}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByText('reports.override.history.operation.Clear')).toBeVisible();
  expect(screen.queryByText('reports.override.history.current')).not.toBeInTheDocument();
});

it('switches by keyboard from active corrections to chronological full history and keeps reverted metadata', async () => {
  const user = userEvent.setup();
  const active = entry({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: 1 });
  const undone = entry({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    version: 3,
    operation: 'Undo',
    revertsEventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    actor: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', displayName: 'Undo Manager' },
    changedAt: '2026-09-18T10:30:00Z',
  });
  const reverted = entry({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    version: 2,
    revertedBy: { eventId: undone.id, actor: undone.actor, changedAt: undone.changedAt },
  });
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [undone, reverted, active], count: 3, pageNumber: 1, pageSize: 25, upToVersion: 3 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={3}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
      undoCandidateId={active.id}
      onUndo={vi.fn()}
    />,
    { wrapper },
  );
  await user.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  const activeButton = screen.getByRole('button', { name: 'reports.override.history.active' });
  const fullButton = screen.getByRole('button', { name: 'reports.override.history.full' });
  expect(activeButton).toHaveAttribute('aria-pressed', 'true');
  expect(fullButton).toHaveAttribute('aria-pressed', 'false');
  expect(await screen.findAllByRole('article')).toHaveLength(1);
  fullButton.focus();
  await user.keyboard('{Enter}');
  expect(fullButton).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByRole('article')).toHaveLength(3);
  const cards = screen.getAllByRole('article');
  expect(within(cards[0]).getByText('reports.override.history.operation.Undo')).toBeVisible();
  expect(within(cards[1]).getByText('reports.override.history.operation.initial')).toBeVisible();
  expect(within(cards[2]).getByText('reports.override.history.operation.initial')).toBeVisible();
  expect(within(cards[2]).getByText('reports.override.history.current')).toBeVisible();
  const revertedCard = cards[1];
  expect(within(revertedCard).queryByText('reports.override.history.revertedLabel')).not.toBeInTheDocument();
  expect(within(revertedCard).getByText('reports.override.undo.reverted: Undo Manager')).toBeVisible();
  expect(within(revertedCard).getByText(new Date(undone.changedAt).toLocaleString('en'))).toHaveAttribute(
    'dateTime',
    undone.changedAt,
  );
  expect(screen.getAllByRole('button', { name: 'reports.override.undo.action' })).toHaveLength(1);
  activeButton.focus();
  await user.keyboard(' ');
  expect(activeButton).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

it('loads past removed corrections so the current correction appears first without clicking load more', async () => {
  const latestUndo = entry({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    version: 3,
    operation: 'Undo',
    revertsEventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  });
  const removed = entry({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    version: 2,
    revertedBy: { eventId: latestUndo.id, actor: latestUndo.actor, changedAt: latestUndo.changedAt },
  });
  const active = entry({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: 1 });
  vi.mocked(getWorkUnitOverrideHistory)
    .mockResolvedValueOnce({
      data: { results: [latestUndo, removed], count: 26, pageNumber: 1, pageSize: 25, upToVersion: 3 },
    } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>)
    .mockResolvedValueOnce({
      data: { results: [active], count: 26, pageNumber: 2, pageSize: 25, upToVersion: 3 },
    } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={3}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
      undoCandidateId={active.id}
      onUndo={vi.fn()}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByRole('button', { name: 'reports.override.undo.action' })).toBeVisible();
  expect(getWorkUnitOverrideHistory).toHaveBeenCalledTimes(2);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByText('reports.override.history.operation.Undo')).not.toBeInTheDocument();
});

it('shows an empty correction list when every correction was removed', async () => {
  const latestUndo = entry({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    version: 2,
    operation: 'Undo',
    revertsEventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  });
  const removed = entry({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    version: 1,
    revertedBy: { eventId: latestUndo.id, actor: latestUndo.actor, changedAt: latestUndo.changedAt },
  });
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [latestUndo, removed], count: 2, pageNumber: 1, pageSize: 25, upToVersion: 2 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={2}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByText('reports.override.history.empty')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

it.each([
  ['LegacyBoundary', 'reports.override.undo.legacy'],
  ['TargetUnavailable', 'reports.override.undo.unavailable'],
] as const)('shows %s undo availability without rendering an action', async (undoUnavailableReason, message) => {
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [entry()], count: 1, pageNumber: 1, pageSize: 25, upToVersion: 1 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={1}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
      undoCandidateId={null}
      undoDisabled
      undoUnavailableReason={undoUnavailableReason}
      onUndo={vi.fn()}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'reports.override.undo.action' })).not.toBeInTheDocument();
});

it('disables empty history without fetching even for a migrated version', () => {
  vi.mocked(getWorkUnitOverrideHistory).mockResolvedValue({
    data: { results: [], count: 0, pageNumber: 1, pageSize: 25, upToVersion: 7 },
  } as unknown as AxiosResponse<WorkUnitOverrideHistoryPage>);
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory={false}
      currentVersion={7}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
    />,
    { wrapper },
  );
  expect(getWorkUnitOverrideHistory).not.toHaveBeenCalled();
  const toggle = screen.getByRole('button', { name: 'reports.override.history.heading' });
  expect(toggle).toBeDisabled();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(getWorkUnitOverrideHistory).not.toHaveBeenCalled();
});

it('shows a busy loading status while history is being fetched', async () => {
  vi.mocked(getWorkUnitOverrideHistory).mockReturnValue(new Promise(() => undefined));
  render(
    <WorkUnitOverrideHistory
      isOpen
      canViewHistory
      hasHistory
      currentVersion={7}
      workUnitId="unit"
      organizationSlug="acme"
      resetKey={0}
      handleError={() => false}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'reports.override.history.heading' }));
  expect(await screen.findByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('reports.override.history.loading');
});
