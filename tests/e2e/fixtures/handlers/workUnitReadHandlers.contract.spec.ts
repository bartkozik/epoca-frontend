import { expect, test } from '@playwright/test';
import { buildWorld } from '../../worlds';
import { createWorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, parseMockRequest } from '../mockApi';
import { workUnitReadHandlers } from './workUnitReadHandlers';

const WORK_UNITS_URL = 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/work-units';

test('ordinary work-unit reads expose effective fields without replacing source @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const response = await createMockApiDispatcher(runtime, workUnitReadHandlers).dispatch(
    parseMockRequest({ method: 'GET', url: WORK_UNITS_URL })
  );
  const results = (response.json as { workUnits: { results: Array<Record<string, unknown>> } }).workUnits.results;
  expect(results.length).toBeGreaterThan(0);
  for (const unit of results) {
    expect(unit.effectiveProjectClient).toEqual(unit.projectClient);
    expect(unit.effectiveTaskId).toBe(unit.taskId);
    expect(unit.revision).toBe(0);
  }
});

const draftIdCases = [
  { query: '?shouldReturnDraftIds=true', expected: 'drafts' },
  { query: '?shouldReturnDraftIds=false', expected: 'none' },
  { query: '', expected: 'none' },
] as const;

for (const { query, expected } of draftIdCases) {
  test(`work-unit reads return ${expected} when query is ${query || 'absent'} @mr @technical`, async () => {
    const runtime = createWorldRuntime(buildWorld('world-5'));
    const firstUnit = runtime.state.workUnits[0];
    const lastUnit = runtime.state.workUnits.at(-1);
    if (!firstUnit || !lastUnit) throw new Error('world-5 must contain work units for draft contracts');
    firstUnit.state = 'Draft';
    lastUnit.state = 'Draft';
    const expectedDraftIds = expected === 'drafts' ? [firstUnit.id, lastUnit.id] : [];
    const stateBeforeRequest = structuredClone(runtime.state);

    const response = await createMockApiDispatcher(runtime, workUnitReadHandlers).dispatch(
      parseMockRequest({ method: 'GET', url: `${WORK_UNITS_URL}${query}` })
    );

    expect(response.status).toBe(200);
    expect((response.json as { draftIds: string[] }).draftIds).toEqual(expectedDraftIds);
    expect(runtime.state).toEqual(stateBeforeRequest);
  });
}

test('work-unit reads reject invalid shouldReturnDraftIds booleans @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const stateBeforeRequest = structuredClone(runtime.state);

  const response = await createMockApiDispatcher(runtime, workUnitReadHandlers).dispatch(
    parseMockRequest({ method: 'GET', url: `${WORK_UNITS_URL}?shouldReturnDraftIds=yes` })
  );

  expect(response.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequest);
});
