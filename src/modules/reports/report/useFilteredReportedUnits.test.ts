import { SelectedItemsMap } from '@/modules/reports/filterPanel/types';
import { ReportedUnit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { renderHook } from '@testing-library/react';
import { useFilteredReportedUnits } from './useFilteredReportedUnits';

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
  description: 'Worklog',
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
  effectiveProjectClient: sourceProjectClient,
  effectiveTaskId: 'CT-509',
  userFullName: 'Test User',
  userId: 'user-1',
  ...overrides,
});

describe('useFilteredReportedUnits', () => {
  it('matches project and client filters against effective values without changing the source', () => {
    const source = createUnit();
    const effectiveProjectClient = {
      ...sourceProjectClient,
      projectId: 'corrected-project',
      clientId: 'corrected-client',
    };
    const unit = createUnit({ effectiveProjectClient, effectiveTaskId: null });
    const initialSelectedProjects: SelectedItemsMap = { 'corrected-project': 'Corrected project' };

    const { result, rerender } = renderHook(
      ({ selectedProjects }: { selectedProjects: SelectedItemsMap }) =>
        useFilteredReportedUnits({
          reportedUnits: [unit],
          selectedClients: {},
          selectedProjects,
          selectedUsers: {},
          isLoadingReportData: false,
        }),
      { initialProps: { selectedProjects: initialSelectedProjects } },
    );

    expect(result.current.filteredReportedUnits.map(({ id }) => id)).toEqual(['unit-1']);
    expect(result.current.filteredUnitsDurationSum).toBe('08:00');
    expect(unit.projectClient).toEqual(source.projectClient);

    rerender({ selectedProjects: { 'project-1': 'Source project' } });
    expect(result.current.filteredReportedUnits).toEqual([]);
  });

  it('leaves notes out of the report rows and the duration sum', () => {
    const worklog = createUnit();
    const note = createUnit({
      duration: 'PT4H',
      entryType: WorkUnitEntryType.Note,
      formattedDuration: '4:00',
      formattedReportDuration: '4:00',
      id: 'note-1',
    });

    const { result } = renderHook(() =>
      useFilteredReportedUnits({
        reportedUnits: [worklog, note],
        selectedClients: {},
        selectedProjects: {},
        selectedUsers: {},
        isLoadingReportData: false,
      }),
    );

    expect(result.current.filteredReportedUnits.map(({ id }) => id)).toEqual(['unit-1']);
    expect(result.current.filteredUnitsDurationSum).toBe('08:00');
  });

  it('reports no-filtered-units only once loading has finished', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) =>
        useFilteredReportedUnits({
          reportedUnits: [createUnit()],
          selectedClients: { other: 'x' },
          selectedProjects: {},
          selectedUsers: {},
          isLoadingReportData: isLoading,
        }),
      { initialProps: { isLoading: true } },
    );

    expect(result.current.isNotLoadingAndHasNoFilteredUnits).toBe(false);
    rerender({ isLoading: false });
    expect(result.current.isNotLoadingAndHasNoFilteredUnits).toBe(true);
  });
});
