import api from '@/core/api/Api';
import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction } from 'vitest';
import { addUnit, deleteUnit, editUnit, getReportedUnits, getUnits, updateUnitDate } from './requests';
import { UnitState, WorkUnitEntryType } from './types';

vi.mock('@/core/api/Api', () => ({
  __esModule: true,
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

// requests.ts calls i18n.t() directly (not through react-i18next's useTranslation), and nothing in
// this test initializes the real i18n singleton -- stub it to return the key, matching
// clients/requests.test.ts's precedent for the same reason.
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

// api mock, see src/modules/integrationClients/requests.test.ts for the full rationale.
// eslint-disable-next-line vitest/unbound-method
const deleteMock = api.delete as MockedFunction<typeof api.delete>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const patchMock = api.patch as MockedFunction<typeof api.patch>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const postMock = api.post as MockedFunction<typeof api.post>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

const rawProjectClient = {
  projectName: 'Epoca',
  clientId: 'client-1',
  projectId: 'project-1',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const rawUnit = {
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient: rawProjectClient,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
};

const rawUnitResults = {
  workUnits: { count: 1, results: [rawUnit] },
  orders: [],
  draftIds: [],
};

// RawReportedUnitSchema.projectClient reuses WorkUnitOverrideResponseSchema's
// WorkUnitProjectClientSchema (see models/unitDto.model.ts), which validates clientId/projectId as
// CanonicalUuidSchema -- unlike RawUnitSchema's ClientProjectSchema, plain strings like 'client-1'
// don't pass, so reported-unit fixtures need real UUIDs.
const rawReportedProjectClient = {
  projectName: 'Epoca',
  clientId: '123e4567-e89b-12d3-a456-426614174000',
  projectId: '123e4567-e89b-12d3-a456-426614174001',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const rawReportedUnit = {
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient: rawReportedProjectClient,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
};

const rawReportedUnitResults = {
  workUnits: { count: 1, results: [rawReportedUnit] },
  orders: [],
  draftIds: [],
};

describe('working time requests', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getUnits', () => {
    it('validates and returns the parsed results', async () => {
      getMock.mockResolvedValueOnce({ data: rawUnitResults });

      const response = await getUnits('acme', {});

      expect(getMock).toHaveBeenCalledWith('/organizations/acme/work-units', {
        params: { shouldReturnDraftIds: true },
      });
      expect(response.data).toEqual(rawUnitResults);
    });

    it('throws when the response is not shaped like RawUnitResults', async () => {
      getMock.mockResolvedValueOnce({ data: { garbage: true } });

      await expect(getUnits('acme', {})).rejects.toThrow();
    });

    it('drops a unit with a malformed load-bearing field instead of rejecting the whole page', async () => {
      const { projectClient, ...unitWithoutProjectClient } = rawUnit;
      // mockResolvedValue (not Once): count (2) still exceeds the one valid result after the
      // malformed entry is dropped, so getUnits retries once against the same data.
      getMock.mockResolvedValue({
        data: {
          ...rawUnitResults,
          workUnits: { count: 2, results: [rawUnit, unitWithoutProjectClient] },
        },
      });

      const response = await getUnits('acme', {});

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(response.data.workUnits.results).toEqual([rawUnit]);
    });

    it('keeps a unit whose project description is null and normalizes its description', async () => {
      const unitWithoutProjectDescription = {
        ...rawUnit,
        projectClient: { ...rawProjectClient, projectDescription: null },
      };
      getMock.mockResolvedValueOnce({
        data: { ...rawUnitResults, workUnits: { count: 1, results: [unitWithoutProjectDescription] } },
      });

      const response = await getUnits('acme', {});

      expect(response.data.workUnits.results).toEqual([
        { ...rawUnit, projectClient: { ...rawProjectClient, projectDescription: '' } },
      ]);
    });
  });

  describe('getReportedUnits', () => {
    it('validates and returns the parsed results with a single request', async () => {
      getMock.mockResolvedValueOnce({ data: rawReportedUnitResults });

      const response = await getReportedUnits('acme', {});

      expect(getMock).toHaveBeenCalledWith('/organizations/acme/work-units', {
        params: { shouldReturnDraftIds: true },
      });
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(response.data).toEqual(rawReportedUnitResults);
      expect(addToastMock).not.toHaveBeenCalled();
    });

    it('drops a unit with a malformed load-bearing field instead of rejecting the whole page', async () => {
      const { projectClient, ...unitWithoutProjectClient } = rawReportedUnit;
      // mockResolvedValue (not Once): count (2) still exceeds the one valid result after the
      // malformed entry is dropped, so getReportedUnits retries once against the same data.
      getMock.mockResolvedValue({
        data: {
          ...rawReportedUnitResults,
          workUnits: { count: 2, results: [rawReportedUnit, unitWithoutProjectClient] },
        },
      });

      const response = await getReportedUnits('acme', {});

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(response.data.workUnits.results).toEqual([rawReportedUnit]);
    });

    it('retries once, shows a non-blocking warning toast, and still returns the partial data when still incomplete', async () => {
      getMock.mockResolvedValue({
        data: { ...rawReportedUnitResults, workUnits: { count: 2, results: [rawReportedUnit] } },
      });

      const response = await getReportedUnits('acme', {});

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(response.data.workUnits).toEqual({ count: 2, results: [rawReportedUnit] });
      expect(addToastMock).toHaveBeenCalledTimes(1);
      expect(addToastMock).toHaveBeenCalledWith({
        content: 'toast_message.working_time.incomplete_list',
        type: 'warning',
      });
    });
  });

  describe('addUnit', () => {
    const dto = {
      entryType: WorkUnitEntryType.Worklog,
      projectId: 'project-1',
      date: '2026-07-28',
      duration: '01:30',
      description: 'Implementation',
      taskId: 'CT-514',
    };

    it('sends an idempotency key, preserves the active unit payload, and returns the parsed unit', async () => {
      postMock.mockResolvedValueOnce({ data: rawUnit });

      const response = await addUnit('acme', dto, false, 'add-key');

      expect(postMock).toHaveBeenCalledWith(
        '/organizations/acme/work-units',
        { ...dto, isDraft: false },
        { headers: { 'Idempotency-Key': 'add-key' } },
      );
      expect(response.data).toEqual(rawUnit);
    });

    it('throws when the response is not a valid unit', async () => {
      postMock.mockResolvedValueOnce({ data: { garbage: true } });

      await expect(addUnit('acme', dto, false, 'add-key')).rejects.toThrow();
    });

    it('returns a saved unit when its project description is null', async () => {
      postMock.mockResolvedValueOnce({
        data: { ...rawUnit, projectClient: { ...rawProjectClient, projectDescription: null } },
      });

      const response = await addUnit('acme', dto, false, 'add-key');

      expect(response.data).toEqual({
        ...rawUnit,
        projectClient: { ...rawProjectClient, projectDescription: '' },
      });
    });
  });

  describe('editUnit', () => {
    const dto = {
      projectId: 'project-1',
      duration: '02:00',
      description: 'Review',
      taskId: 'CT-515',
      date: '2026-07-28',
    };

    it('sends an idempotency key and preserves taskId in the edit payload', async () => {
      patchMock.mockResolvedValueOnce({ data: rawUnit });

      await editUnit('acme', 'unit-1', dto, true, 'edit-key');

      expect(patchMock).toHaveBeenCalledWith(
        '/organizations/acme/work-units/unit-1',
        { ...dto, shouldFinalize: true },
        { headers: { 'Idempotency-Key': 'edit-key' } },
      );
    });

    // editUnit returns Promise<void> (see requests.ts) -- no caller reads the response body, only
    // the PATCH request itself and the boundary validation it triggers matter here.
    it('validates the response as a boundary check without throwing', async () => {
      patchMock.mockResolvedValueOnce({ data: rawUnit });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(editUnit('acme', 'unit-1', dto, true, 'edit-key')).resolves.toBeUndefined();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    // Regression guard: nobody reads editUnit's resolved value, so a malformed PATCH echo must be
    // logged, never thrown -- throwing here would fail an edit the backend actually applied.
    it('logs, but does not throw, when the response echo is malformed', async () => {
      patchMock.mockResolvedValueOnce({ data: { garbage: true } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(editUnit('acme', 'unit-1', dto, true, 'edit-key')).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateUnitDate', () => {
    it('does not attach an idempotency header to a drag-and-drop date update', async () => {
      patchMock.mockResolvedValueOnce({ data: rawUnit });

      await updateUnitDate('acme', 'unit-1', '2026-07-29');

      expect(patchMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1', {
        date: '2026-07-29',
        shouldFinalize: false,
      });
    });

    it('logs, but does not throw, when the response echo is malformed', async () => {
      patchMock.mockResolvedValueOnce({ data: { garbage: true } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(updateUnitDate('acme', 'unit-1', '2026-07-29')).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteUnit', () => {
    it('sends the delete request', async () => {
      deleteMock.mockResolvedValueOnce({ data: undefined });

      await deleteUnit('acme', 'unit-1');

      expect(deleteMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1');
    });
  });
});
