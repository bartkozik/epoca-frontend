import { filterNonNullItems } from '@/core/utils/helpers';
import { UnitState, WorkUnitEntryType } from '../types';
import {
  ClientProjectSchema,
  RawReportedUnitResultsSchema,
  RawUnitResultsSchema,
  RawUnitSchema,
  RawUnitsOrderSchema,
  UnitDtoSchema,
  UnitEditDtoSchema,
  UnitsDtoSchema,
} from './unitDto.model';

it('validates unit operation DTOs while retaining optional fields and nullable task IDs', () => {
  expect(UnitDtoSchema.parse({ entryType: WorkUnitEntryType.Note, projectId: 'project-1', taskId: null })).toEqual({
    entryType: WorkUnitEntryType.Note,
    projectId: 'project-1',
    taskId: null,
  });
  expect(UnitEditDtoSchema.parse({ projectId: 'project-1', duration: 'PT1H', description: '' })).toEqual({
    projectId: 'project-1',
    duration: 'PT1H',
    description: '',
  });
  expect(UnitsDtoSchema.parse({ state: UnitState.Draft, userId: ['user-1'] })).toEqual({
    state: UnitState.Draft,
    userId: ['user-1'],
  });
  expect(UnitDtoSchema.safeParse({ entryType: 'FutureType', projectId: 'project-1' }).success).toBe(false);
});

const validClientProject = {
  projectName: 'Epoca',
  clientId: 'client-1',
  projectId: 'project-1',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const validRawUnit = {
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient: validClientProject,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  userFullName: 'Test User',
  state: UnitState.Active,
};

describe('ClientProjectSchema', () => {
  it('parses a well-formed client project', () => {
    expect(ClientProjectSchema.parse(validClientProject)).toEqual(validClientProject);
  });

  it('normalizes a missing project description to an empty string', () => {
    expect(ClientProjectSchema.parse({ ...validClientProject, projectDescription: null }).projectDescription).toBe('');
  });

  it('throws when a required field is missing', () => {
    const { clientId, ...rest } = validClientProject;
    expect(() => ClientProjectSchema.parse(rest)).toThrow();
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = ClientProjectSchema.parse({ ...validClientProject, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });
});

describe('RawUnitSchema', () => {
  it.each([{ active: true, version: 3 }, 'malformed'])(
    'strips obsolete PM classification without dropping the unit: %j',
    (pmClassification) => {
      expect(RawUnitSchema.parse({ ...validRawUnit, pmClassification })).toEqual(validRawUnit);
    },
  );

  it('parses a well-formed unit', () => {
    expect(RawUnitSchema.parse(validRawUnit)).toEqual(validRawUnit);
  });

  it('throws when id is missing', () => {
    const { id, ...rest } = validRawUnit;
    expect(() => RawUnitSchema.parse(rest)).toThrow();
  });

  it('throws when id is empty', () => {
    expect(() => RawUnitSchema.parse({ ...validRawUnit, id: '' })).toThrow();
  });

  // Equivalence with WorkingTimeStore's current filterNonNullItems(data.workUnits.results,
  // 'projectClient') behavior: a unit whose projectClient is missing must fail to parse (and get
  // dropped by the enclosing tolerantArray), just as filterNonNullItems would exclude it.
  it('throws when projectClient is missing, matching filterNonNullItems exclusion', () => {
    const { projectClient, ...unitWithoutProjectClient } = validRawUnit;

    expect(() => RawUnitSchema.parse(unitWithoutProjectClient)).toThrow();
    expect(filterNonNullItems([unitWithoutProjectClient] as (typeof validRawUnit)[], 'projectClient')).toEqual([]);
  });

  it('throws when projectClient is malformed', () => {
    expect(() => RawUnitSchema.parse({ ...validRawUnit, projectClient: { clientId: 'client-1' } })).toThrow();
  });

  it('throws when state is not a known UnitState instead of defaulting it', () => {
    expect(() => RawUnitSchema.parse({ ...validRawUnit, state: 'Unknown' })).toThrow();
  });

  it('throws when entryType is not a known WorkUnitEntryType instead of defaulting it', () => {
    expect(() => RawUnitSchema.parse({ ...validRawUnit, entryType: 'Unknown' })).toThrow();
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = RawUnitSchema.parse({
      ...validRawUnit,
      modifiedAt: null,
      duration: null,
      description: null,
      createdAt: null,
      userId: null,
    });

    expect(result.modifiedAt).toBe('');
    expect(result.duration).toBe('');
    expect(result.description).toBe('');
    expect(result.createdAt).toBe('');
    expect(result.userId).toBe('');
  });

  it('leaves taskId/userFullName undefined when absent', () => {
    const { taskId, userFullName, ...rest } = validRawUnit;
    const result = RawUnitSchema.parse(rest);

    expect(result.taskId).toBeUndefined();
    expect(result.userFullName).toBeUndefined();
  });

  it('defaults taskId/userFullName to undefined instead of throwing when malformed', () => {
    const result = RawUnitSchema.parse({
      ...validRawUnit,
      taskId: 123,
      userFullName: false,
    });

    expect(result.taskId).toBeUndefined();
    expect(result.userFullName).toBeUndefined();
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = RawUnitSchema.parse({ ...validRawUnit, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });
});

describe('RawUnitsOrderSchema', () => {
  it('parses a well-formed order', () => {
    const order = { date: '2026-07-28', ids: ['unit-1', 'unit-2'] };
    expect(RawUnitsOrderSchema.parse(order)).toEqual(order);
  });

  it('falls back date to an empty string instead of throwing', () => {
    const result = RawUnitsOrderSchema.parse({ date: null, ids: [] });
    expect(result.date).toBe('');
  });

  it('drops a non-string id instead of rejecting the whole order', () => {
    const result = RawUnitsOrderSchema.parse({ date: '2026-07-28', ids: ['unit-1', 42, 'unit-2'] });
    expect(result.ids).toEqual(['unit-1', 'unit-2']);
  });
});

describe('RawUnitResultsSchema', () => {
  const validResults = {
    workUnits: { count: 1, results: [validRawUnit] },
    orders: [{ date: '2026-07-28', ids: ['unit-1'] }],
    draftIds: ['draft-1'],
  };

  it('parses a well-formed results payload', () => {
    expect(RawUnitResultsSchema.parse(validResults)).toEqual(validResults);
  });

  it('drops a unit with a missing projectClient instead of the whole page rejecting', () => {
    const { projectClient, ...unitWithoutProjectClient } = validRawUnit;
    const result = RawUnitResultsSchema.parse({
      ...validResults,
      workUnits: { count: 2, results: [validRawUnit, unitWithoutProjectClient] },
    });

    expect(result.workUnits.results).toEqual([validRawUnit]);
  });

  it('drops a unit with an unrecognized state instead of the whole page rejecting', () => {
    const malformedUnit = { ...validRawUnit, id: 'unit-2', state: 'Unknown' };
    const result = RawUnitResultsSchema.parse({
      ...validResults,
      workUnits: { count: 2, results: [validRawUnit, malformedUnit] },
    });

    expect(result.workUnits.results).toEqual([validRawUnit]);
  });

  it('defaults draftIds to [] when missing or malformed instead of throwing', () => {
    const { draftIds, ...rest } = validResults;
    expect(RawUnitResultsSchema.parse(rest).draftIds).toEqual([]);
    expect(RawUnitResultsSchema.parse({ ...validResults, draftIds: 'not-an-array' }).draftIds).toEqual([]);
  });

  it('defaults orders to [] when malformed, dropping only invalid entries', () => {
    const result = RawUnitResultsSchema.parse({ ...validResults, orders: 'not-an-array' });
    expect(result.orders).toEqual([]);
  });

  it('throws when workUnits.count is malformed', () => {
    expect(() =>
      RawUnitResultsSchema.parse({ ...validResults, workUnits: { count: 'not-a-number', results: [] } }),
    ).toThrow();
  });
});

describe('RawReportedUnitResultsSchema descriptive field tolerance', () => {
  it.each(['taskId', 'userFullName'])('keeps a report row with malformed %s', (field) => {
    const projectClient = {
      ...validClientProject,
      clientId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
    };
    const parsed = RawReportedUnitResultsSchema.parse({
      workUnits: { count: 1, results: [{ ...validRawUnit, projectClient, [field]: 123 }] },
      orders: [],
      draftIds: [],
    });
    expect(parsed.workUnits.count).toBe(1);
    expect(parsed.workUnits.results).toHaveLength(1);
    expect(parsed.workUnits.results[0]).toMatchObject({ id: validRawUnit.id, [field]: undefined });
  });
});
