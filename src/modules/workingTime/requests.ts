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
  const parsed = RawUnitSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}

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
