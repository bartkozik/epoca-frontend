import {
  useReplaceWorkUnitOverrideMutation,
  useUndoWorkUnitOverrideMutation,
} from '@/modules/reports/hooks/useReplaceWorkUnitOverrideMutation';
import type {
  ReplaceWorkUnitOverrideRequest,
  UndoWorkUnitOverrideRequest,
} from '@/modules/reports/models/workUnitOverride.model';
import { overrideFixture } from '@/modules/reports/report/workUnitOverride/overrideTestFixtures';
import * as requests from '@/modules/reports/report/workUnitOverride/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { MockedFunction } from 'vitest';

vi.mock('@/modules/reports/report/workUnitOverride/requests', () => ({
  replaceWorkUnitOverride: vi.fn(),
  undoWorkUnitOverride: vi.fn(),
}));

const replaceMock = requests.replaceWorkUnitOverride as MockedFunction<typeof requests.replaceWorkUnitOverride>;
const undoMock = requests.undoWorkUnitOverride as MockedFunction<typeof requests.undoWorkUnitOverride>;

const replaceDto: ReplaceWorkUnitOverrideRequest = {
  expectedRevision: 0,
  projectId: null,
  taskId: { mode: 'Inherit' },
};
const undoDto: UndoWorkUnitOverrideRequest = {
  expectedRevision: 0,
  targetEventId: '11111111-1111-4111-8111-111111111111',
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useReplaceWorkUnitOverrideMutation', () => {
  it('calls replaceWorkUnitOverride and resolves with the response data, without any onSuccess/onError side effect', async () => {
    const data = overrideFixture();
    replaceMock.mockResolvedValueOnce({ data } as Awaited<ReturnType<typeof requests.replaceWorkUnitOverride>>);

    const { result } = renderHook(() => useReplaceWorkUnitOverrideMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', workUnitId: 'wu-1', dto: replaceDto });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(replaceMock).toHaveBeenCalledWith('acme', 'wu-1', replaceDto);
    expect(result.current.data).toEqual(data);
  });

  it('rejects mutateAsync when the request fails, without swallowing the error', async () => {
    replaceMock.mockRejectedValueOnce({ response: { status: 409 } });

    const { result } = renderHook(() => useReplaceWorkUnitOverrideMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({ organizationSlug: 'acme', workUnitId: 'wu-1', dto: replaceDto }),
    ).rejects.toEqual({ response: { status: 409 } });
  });
});

describe('useUndoWorkUnitOverrideMutation', () => {
  it('calls undoWorkUnitOverride and resolves with the response data', async () => {
    const data = overrideFixture();
    undoMock.mockResolvedValueOnce({ data } as Awaited<ReturnType<typeof requests.undoWorkUnitOverride>>);

    const { result } = renderHook(() => useUndoWorkUnitOverrideMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', workUnitId: 'wu-1', dto: undoDto });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(undoMock).toHaveBeenCalledWith('acme', 'wu-1', undoDto);
    expect(result.current.data).toEqual(data);
  });
});
