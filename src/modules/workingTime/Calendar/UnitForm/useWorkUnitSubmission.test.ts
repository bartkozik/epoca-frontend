import { showToastForError } from '@/core/utils/helpers';
import { createElement, type ReactElement, type ReactNode } from 'react';
import type { AxiosError, AxiosResponse } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import * as requests from '../../requests';
import { RawUnit, UnitDto, UnitEditDto, UnitState, WorkUnitEntryType } from '../../types';
import { useWorkUnitSubmission } from './useWorkUnitSubmission';

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('i18next', () => {
  const i18nextMock = {
    init: vi.fn(),
    t: (key: string) => key,
    use: vi.fn(),
  };
  i18nextMock.use.mockReturnValue(i18nextMock);

  return { __esModule: true, default: i18nextMock };
});

vi.mock('@/core/api/utils', () => ({
  isNetworkError: (error: AxiosError) =>
    Boolean(
      error?.isAxiosError && (!error.response || error.message === 'Network Error' || error.code === 'ECONNABORTED'),
    ),
}));

vi.mock('@/core/utils/helpers/show-toasts-for-error', () => ({
  showToastForError: vi.fn(),
}));

vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({ getReportedUnits: vi.fn() }));

vi.mock('../../requests', () => ({
  addUnit: vi.fn(),
  editUnit: vi.fn(),
}));

const addUnitMock = requests.addUnit as MockedFunction<typeof requests.addUnit>;
const editUnitMock = requests.editUnit as MockedFunction<typeof requests.editUnit>;
const showToastForErrorMock = showToastForError as MockedFunction<typeof showToastForError>;

const addDto: UnitDto = {
  entryType: WorkUnitEntryType.Worklog,
  projectId: 'project-1',
  date: '2026-07-28',
  duration: 'PT8H',
  description: 'Implement CT-514',
  taskId: 'CT-514',
};

const editDto: UnitEditDto = {
  projectId: 'project-1',
  date: '2026-07-28',
  duration: 'PT8H',
  description: 'Implement CT-514',
  taskId: 'CT-514',
};

const rawUnit: RawUnit = {
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient: {
    projectName: 'Epoca',
    clientId: 'client-1',
    projectId: 'project-1',
    clientName: 'Iterators',
    clientColor: '#123456',
    clientTexture: '',
    projectDescription: 'Time reporting',
  },
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
};

const addResponse = (unit: RawUnit = rawUnit): AxiosResponse<RawUnit> =>
  ({ data: unit, status: 200 }) as AxiosResponse<RawUnit>;

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

interface AxiosErrorFixtureOptions {
  code?: string;
  message?: string;
  status?: number;
  type?: string;
}

const axiosError = ({ code, message = 'Request failed', status, type }: AxiosErrorFixtureOptions = {}): AxiosError =>
  ({
    code,
    config: {},
    isAxiosError: true,
    message,
    name: 'AxiosError',
    request: {},
    response:
      status === undefined
        ? undefined
        : {
            config: {},
            data: {
              detail: 'Work unit submission failed',
              instance: '/organizations/acme/work-units',
              status,
              title: 'Work unit submission failed',
              ...(type === undefined ? {} : { type }),
            },
            headers: {},
            status,
            statusText: 'Request failed',
          },
    toJSON: () => ({}),
  }) as AxiosError;

const getAddKey = (callIndex: number): string => addUnitMock.mock.calls[callIndex][3];
const getEditKey = (callIndex: number): string => editUnitMock.mock.calls[callIndex][4];

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

const renderSubmission = (
  onBlocked?: () => void,
): ReturnType<typeof renderHook<ReturnType<typeof useWorkUnitSubmission>, unknown>> =>
  renderHook(() => useWorkUnitSubmission(onBlocked), { wrapper });

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.clearAllMocks();
});

describe('useWorkUnitSubmission add identity', () => {
  it('returns the created unit and uses a fresh key for an identical submission after a reset', async () => {
    addUnitMock.mockResolvedValueOnce(addResponse()).mockResolvedValueOnce(addResponse({ ...rawUnit, id: 'unit-2' }));
    const { result } = renderSubmission();

    let created: RawUnit | undefined;
    await act(async () => {
      created = await result.current.submitAdd(addDto, false);
    });

    expect(created).toEqual(rawUnit);
    expect(result.current.isSubmitting).toBe(false);
    const firstKey = getAddKey(0);

    act(() => result.current.resetSubmissionState());
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).not.toBe(firstKey);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('reuses the same key after a network error and shows no toast', async () => {
    addUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).toBe(getAddKey(0));
    expect(showToastForErrorMock).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it.each<[string, Partial<UnitDto>]>([
    ['project', { projectId: 'project-2' }],
    ['date', { date: '2026-07-29' }],
    ['duration', { duration: 'PT7H30M' }],
    ['description', { description: 'Changed description' }],
    ['task ID', { taskId: 'CT-999' }],
  ])('uses a fresh add key when the %s changes after a failed attempt', async (_, change) => {
    addUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd({ ...addDto, ...change }, false);
    });

    expect(getAddKey(1)).not.toBe(getAddKey(0));
  });

  it('reuses the key of a failed draft add for an unchanged retry', async () => {
    addUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, true);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, true);
    });

    expect(addUnitMock).toHaveBeenNthCalledWith(1, 'acme', addDto, true, getAddKey(0));
    expect(getAddKey(1)).toBe(getAddKey(0));
  });
});

describe('useWorkUnitSubmission edit result', () => {
  it('resolves true on a successful edit and false after a handled error', async () => {
    editUnitMock.mockResolvedValueOnce(undefined);
    const { result } = renderSubmission();

    let successResult: boolean | undefined;
    await act(async () => {
      successResult = await result.current.submitEdit('unit-1', editDto, false);
    });
    expect(successResult).toBe(true);

    editUnitMock.mockRejectedValueOnce(axiosError({ message: 'Network Error' }));
    let failureResult: boolean | undefined;
    await act(async () => {
      failureResult = await result.current.submitEdit('unit-1', editDto, false);
    });
    expect(failureResult).toBe(false);
  });
});

describe('useWorkUnitSubmission edit identity', () => {
  it('reuses the key for an unchanged edit retry', async () => {
    editUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitEdit('unit-1', editDto, false);
    });
    await act(async () => {
      await result.current.submitEdit('unit-1', editDto, false);
    });

    expect(getEditKey(1)).toBe(getEditKey(0));
    expect(result.current.isSubmitting).toBe(false);
  });

  it('includes draft finalization in the edit identity and keeps each command retryable', async () => {
    editUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitEdit('draft-1', editDto, false);
    });
    await act(async () => {
      await result.current.submitEdit('draft-1', editDto, false);
    });
    const draftEditKey = getEditKey(0);
    expect(getEditKey(1)).toBe(draftEditKey);

    await act(async () => {
      await result.current.submitEdit('draft-1', editDto, true);
    });
    const finalizeKey = getEditKey(2);
    await act(async () => {
      await result.current.submitEdit('draft-1', editDto, true);
    });

    expect(finalizeKey).not.toBe(draftEditKey);
    expect(getEditKey(3)).toBe(finalizeKey);
  });
});

describe('useWorkUnitSubmission error classification', () => {
  it('rotates the key for a deterministic application 4xx', async () => {
    addUnitMock.mockRejectedValue(axiosError({ status: 400, type: 'result:validation-error' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).not.toBe(getAddKey(0));
    expect(showToastForErrorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({
          400: 'toast_message.working_time.add_new_unit_no_duration_error',
        }),
      }),
    );
  });

  it('rotates the key and selects the dedicated toast for an idempotency conflict', async () => {
    addUnitMock.mockRejectedValue(axiosError({ status: 409, type: 'result:work-unit:idempotency-key-conflict' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).not.toBe(getAddKey(0));
    expect(showToastForErrorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({ 409: 'toast_message.working_time.idempotency_conflict' }),
      }),
    );
  });

  it('retains the key and the status toast mapping for a 4xx without a stable result type', async () => {
    addUnitMock.mockRejectedValue(axiosError({ status: 400 }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).toBe(getAddKey(0));
    expect(showToastForErrorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({
          400: 'toast_message.working_time.add_new_unit_no_duration_error',
        }),
      }),
    );
  });

  it.each([408, 429, 500, 503, 599])('uses the retryable toast and keeps the key for HTTP %i', async (status) => {
    addUnitMock.mockRejectedValue(axiosError({ status, type: 'result:temporary-failure' }));
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(getAddKey(1)).toBe(getAddKey(0));
    expect(showToastForErrorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({
          [status]: 'toast_message.working_time.retryable_save_error',
        }),
      }),
    );
  });

  it('does not attempt a toast for a non-Axios failure', async () => {
    addUnitMock.mockRejectedValue(new Error('Unexpected failure'));
    const { result } = renderSubmission();

    let created: RawUnit | undefined = rawUnit;
    await act(async () => {
      created = await result.current.submitAdd(addDto, false);
    });

    expect(created).toBeUndefined();
    expect(showToastForErrorMock).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('useWorkUnitSubmission retry blocking', () => {
  it('blocks retries and reports the expired reason when the idempotency result expired', async () => {
    const onBlocked = vi.fn();
    addUnitMock.mockRejectedValue(axiosError({ status: 410, type: 'result:work-unit:idempotency-result-expired' }));
    const { result } = renderSubmission(onBlocked);

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });
    const expiredKey = getAddKey(0);

    expect(result.current.isRetryBlocked).toBe(true);
    expect(result.current.retryBlockReason).toBe('expired');
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(showToastForErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({
          410: 'toast_message.working_time.idempotency_result_expired',
        }),
      }),
    );

    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(addUnitMock).toHaveBeenCalledTimes(1);

    addUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    act(() => result.current.resetSubmissionState());
    await act(async () => {
      await result.current.submitAdd(addDto, false);
    });

    expect(result.current.isRetryBlocked).toBe(false);
    expect(result.current.retryBlockReason).toBeNull();
    expect(getAddKey(1)).not.toBe(expiredKey);
  });

  it('blocks retries and reports the version-unsupported reason, cleared only by a reset', async () => {
    const onBlocked = vi.fn();
    editUnitMock.mockRejectedValue(
      axiosError({ status: 409, type: 'result:work-unit:idempotency-version-unsupported' }),
    );
    const { result } = renderSubmission(onBlocked);

    await act(async () => {
      await result.current.submitEdit('unit-1', editDto, false);
    });
    const unsupportedKey = getEditKey(0);

    expect(result.current.isRetryBlocked).toBe(true);
    expect(result.current.retryBlockReason).toBe('version-unsupported');
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(showToastForErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        errorMessageMap: expect.objectContaining({
          409: 'toast_message.working_time.idempotency_version_unsupported',
        }),
      }),
    );

    await act(async () => {
      await result.current.submitEdit('unit-1', editDto, false);
    });

    expect(editUnitMock).toHaveBeenCalledTimes(1);

    editUnitMock.mockRejectedValue(axiosError({ message: 'Network Error' }));
    act(() => result.current.resetSubmissionState());
    await act(async () => {
      await result.current.submitEdit('unit-1', editDto, false);
    });

    expect(result.current.isRetryBlocked).toBe(false);
    expect(result.current.retryBlockReason).toBeNull();
    expect(getEditKey(1)).not.toBe(unsupportedKey);
  });

  it('does not let a late expired error block a newer form session', async () => {
    const onBlocked = vi.fn();
    const pendingAdd = createDeferred<AxiosResponse<RawUnit>>();
    addUnitMock.mockReturnValue(pendingAdd.promise);
    const { result } = renderSubmission(onBlocked);

    let submission!: Promise<RawUnit | undefined>;
    act(() => {
      submission = result.current.submitAdd(addDto, false);
    });
    await waitFor(() => expect(addUnitMock).toHaveBeenCalledTimes(1));

    act(() => result.current.resetSubmissionState());
    pendingAdd.reject(axiosError({ status: 410, type: 'result:work-unit:idempotency-result-expired' }));
    await act(async () => {
      await submission;
    });

    expect(result.current.isRetryBlocked).toBe(false);
    expect(result.current.retryBlockReason).toBeNull();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(showToastForErrorMock).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does not let a late version-unsupported error block a newer edit session', async () => {
    const onBlocked = vi.fn();
    const pendingEdit = createDeferred<void>();
    editUnitMock.mockReturnValue(pendingEdit.promise);
    const { result } = renderSubmission(onBlocked);

    let submission!: Promise<boolean>;
    act(() => {
      submission = result.current.submitEdit('unit-1', editDto, false);
    });
    await waitFor(() => expect(editUnitMock).toHaveBeenCalledTimes(1));

    act(() => result.current.resetSubmissionState());
    pendingEdit.reject(axiosError({ status: 409, type: 'result:work-unit:idempotency-version-unsupported' }));
    await act(async () => {
      await submission;
    });

    expect(result.current.isRetryBlocked).toBe(false);
    expect(result.current.retryBlockReason).toBeNull();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('useWorkUnitSubmission in-flight guard', () => {
  it('deduplicates a concurrent add while the first transport request is pending', async () => {
    const pendingAdd = createDeferred<AxiosResponse<RawUnit>>();
    addUnitMock.mockReturnValue(pendingAdd.promise);
    const { result } = renderSubmission();

    let first!: Promise<RawUnit | undefined>;
    let duplicate!: Promise<RawUnit | undefined>;
    act(() => {
      first = result.current.submitAdd(addDto, false);
      duplicate = result.current.submitAdd(addDto, false);
    });

    await waitFor(() => expect(addUnitMock).toHaveBeenCalledTimes(1));
    expect(result.current.isSubmitting).toBe(true);

    pendingAdd.resolve(addResponse());
    let results: (RawUnit | undefined)[] = [];
    await act(async () => {
      results = await Promise.all([first, duplicate]);
    });

    expect(addUnitMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([rawUnit, undefined]);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('shares one guard between add and edit, so an in-flight add drops a concurrent edit', async () => {
    const pendingAdd = createDeferred<AxiosResponse<RawUnit>>();
    addUnitMock.mockReturnValue(pendingAdd.promise);
    const { result } = renderSubmission();

    let first!: Promise<RawUnit | undefined>;
    let concurrentEdit!: Promise<boolean>;
    act(() => {
      first = result.current.submitAdd(addDto, false);
      concurrentEdit = result.current.submitEdit('unit-1', editDto, false);
    });

    await waitFor(() => expect(addUnitMock).toHaveBeenCalledTimes(1));
    expect(editUnitMock).not.toHaveBeenCalled();

    pendingAdd.resolve(addResponse());
    await act(async () => {
      await Promise.all([first, concurrentEdit]);
    });

    expect(result.current.isSubmitting).toBe(false);
  });
});
