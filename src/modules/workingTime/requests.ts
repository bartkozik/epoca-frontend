import api from '@/core/api/Api';
import { fetchPaginatedWithRetry, notifyIncompleteList } from '@/core/utils/helpers';
import { RawReportedUnitResultsSchema, RawUnitResultsSchema, RawUnitSchema } from './models/unitDto.model';
import { ReportedUnitsReturn, UnitDto, UnitEditDto, UnitReturn, UnitsDto, UnitsReturn } from './types';

export async function getUnits(organizationSlug: string, options: UnitsDto): UnitsReturn {
  const defaultOptions = {
    shouldReturnDraftIds: true,
  };

  const params = { ...defaultOptions, ...options };

  const fetchAndParse = async (): Promise<Awaited<UnitsReturn>> => {
    const response = await api.get<unknown>(`/organizations/${organizationSlug}/work-units`, { params });
    return { ...response, data: RawUnitResultsSchema.parse(response.data) };
  };

  return fetchPaginatedWithRetry(
    fetchAndParse,
    (result) => result.data.workUnits,
    () => notifyIncompleteList('toast_message.working_time.incomplete_list'),
  );
}

export async function getReportedUnits(organizationSlug: string, options: UnitsDto): ReportedUnitsReturn {
  const fetchAndParse = async (): Promise<Awaited<ReportedUnitsReturn>> => {
    const response = await api.get<unknown>(`/organizations/${organizationSlug}/work-units`, {
      params: { shouldReturnDraftIds: true, ...options },
    });
    return { ...response, data: RawReportedUnitResultsSchema.parse(response.data) };
  };

  return fetchPaginatedWithRetry(
    fetchAndParse,
    (result) => result.data.workUnits,
    () => notifyIncompleteList('toast_message.working_time.incomplete_list'),
  );
}

export function changeUnitsOrder(organizationSlug: string, date: string, workUnitIds: string[]): Promise<void> {
  return api.put(`/organizations/${organizationSlug}/work-units/order`, { date, workUnitIds });
}

export async function addUnit(
  organizationSlug: string,
  dto: UnitDto,
  isDraft: boolean,
  idempotencyKey: string,
): UnitReturn {
  const dtoWithDraft = { ...dto, isDraft };

  const response = await api.post<unknown>(`/organizations/${organizationSlug}/work-units`, dtoWithDraft, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return { ...response, data: RawUnitSchema.parse(response.data) };
}

export function deleteUnit(organizationSlug: string, workUnitId: string): Promise<void> {
  return api.delete(`/organizations/${organizationSlug}/work-units/${workUnitId}`);
}

// Promise<void>, not a unit-returning type: useEditUnitMutation only invalidates the units query on
// success and never reads this response body, so the return type doesn't promise a validated
// RawUnit nobody gets. See clients/requests.ts's editClient for the precedent.
export async function editUnit(
  organizationSlug: string,
  workUnitId: string,
  dto: UnitEditDto,
  shouldFinalize: boolean,
  idempotencyKey: string,
): Promise<void> {
  const dtoWithFinalize = { ...dto, shouldFinalize };

  const response = await api.patch<unknown>(
    `/organizations/${organizationSlug}/work-units/${workUnitId}`,
    dtoWithFinalize,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  // Still validated as a boundary check (CLAUDE.md's response-validation convention) -- a
  // malformed or empty PATCH echo is logged, not thrown, since no caller reads this value and
  // throwing here would fail an edit the backend actually applied.
  const parsed = RawUnitSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}

// Promise<void> for the same reason as editUnit above -- models/unitReorder.model.ts's mutations
// (the reorder/move-to-date flows) chain off this only for its side effect, never its data.
export async function updateUnitDate(organizationSlug: string, workUnitId: string, date: string): Promise<void> {
  const response = await api.patch<unknown>(`/organizations/${organizationSlug}/work-units/${workUnitId}`, {
    date,
    shouldFinalize: false,
  });
  const parsed = RawUnitSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}
