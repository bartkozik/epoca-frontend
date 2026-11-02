import { PIVOT_KEY, PIVOT_VALUE, type PivotKey, type PivotValue } from '@/modules/reports/pivotTable/constants';
import { parsePivotDuration } from '@/modules/reports/pivotTable/parsePivotDuration';
import type {
  PivotCell,
  PivotCoordinate,
  PivotFilterMembers,
  PivotFilterValue,
  PivotMetricValues,
  WorkUnitPivotQueryRequest,
  WorkUnitPivotQueryResponse,
} from '@/modules/reports/pivotTable/types';
import { z } from 'zod';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONTH_YEAR_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const PivotKeySchema = z.enum([
  PIVOT_KEY.USER,
  PIVOT_KEY.PROJECT,
  PIVOT_KEY.CLIENT,
  PIVOT_KEY.YEAR,
  PIVOT_KEY.MONTH_YEAR,
  PIVOT_KEY.DATE,
  PIVOT_KEY.ENTRY_TYPE,
  PIVOT_KEY.TASK,
]);

const RawPathSegmentSchema = z
  .object({
    key: PivotKeySchema,
    value: z.union([z.string(), z.number(), z.null()]),
  })
  .strict();

const RawCoordinateSchema = z
  .object({
    kind: z.enum(['Leaf', 'Subtotal', 'GrandTotal']),
    path: z.array(RawPathSegmentSchema),
  })
  .strict();

const RawMetricValuesSchema = z
  .object({
    durationSum: z.string().optional(),
    durationAvg: z.string().nullable().optional(),
    entriesCount: z.number().int().nonnegative().safe().optional(),
  })
  .strict();

const RawCellSchema = z
  .object({
    row: RawCoordinateSchema,
    column: RawCoordinateSchema,
    values: RawMetricValuesSchema,
  })
  .strict();

const RawFilterMembersSchema = z
  .object({
    key: PivotKeySchema,
    members: z.array(
      z
        .object({
          value: z.union([z.string(), z.number(), z.null()]),
          available: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

const RawResponseSchema = z
  .object({
    cells: z.array(RawCellSchema),
    filterMembers: z.array(RawFilterMembersSchema),
    result: z
      .object({
        cellCount: z.number().int().nonnegative().safe(),
        displayValueCellCount: z.number().int().nonnegative().safe(),
        maxDisplayValueCellCount: z.number().int().nonnegative().safe(),
      })
      .strict(),
  })
  .strict();

type RawCoordinate = z.infer<typeof RawCoordinateSchema>;

type RawMetricValues = z.infer<typeof RawMetricValuesSchema>;

type RawFilterMembers = z.infer<typeof RawFilterMembersSchema>;

const invalidResponse = (message: string): Error => new Error(`Invalid pivot response: ${message}`);

const isCalendarDate = (value: string): boolean => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const validateFieldValue = (key: PivotKey, value: PivotFilterValue): void => {
  switch (key) {
    case PIVOT_KEY.USER:
    case PIVOT_KEY.PROJECT:
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return;
      break;
    case PIVOT_KEY.CLIENT:
      if (value === null || (typeof value === 'string' && UUID_PATTERN.test(value))) return;
      break;
    case PIVOT_KEY.YEAR:
      if (typeof value === 'number' && Number.isSafeInteger(value)) return;
      break;
    case PIVOT_KEY.MONTH_YEAR:
      if (typeof value === 'string' && MONTH_YEAR_PATTERN.test(value)) return;
      break;
    case PIVOT_KEY.DATE:
      if (typeof value === 'string' && isCalendarDate(value)) return;
      break;
    case PIVOT_KEY.ENTRY_TYPE:
      if (value === 'Worklog' || value === 'Note') return;
      break;
    case PIVOT_KEY.TASK:
      if (value === null || typeof value === 'string') return;
      break;
  }

  throw invalidResponse(`invalid ${key} value`);
};

const parseCoordinate = (coordinate: RawCoordinate, axis: PivotKey[], area: 'row' | 'column'): PivotCoordinate => {
  const pathLength = coordinate.path.length;

  if (axis.length === 0) {
    if (coordinate.kind !== 'Leaf' || pathLength !== 0) {
      throw invalidResponse(`${area} empty axis must use an empty Leaf coordinate`);
    }
  } else {
    const isValidKindAndLength =
      (coordinate.kind === 'Leaf' && pathLength === axis.length) ||
      (coordinate.kind === 'Subtotal' && pathLength > 0 && pathLength < axis.length) ||
      (coordinate.kind === 'GrandTotal' && pathLength === 0);

    if (!isValidKindAndLength) throw invalidResponse(`${area} coordinate kind/path mismatch`);
  }

  coordinate.path.forEach((segment, index) => {
    if (segment.key !== axis[index]) throw invalidResponse(`${area} coordinate is not an axis prefix`);
    validateFieldValue(segment.key, segment.value);
  });

  return coordinate;
};

const METRIC_PROPERTY_BY_VALUE = {
  [PIVOT_VALUE.DURATION_SUM]: 'durationSum',
  [PIVOT_VALUE.DURATION_AVG]: 'durationAvg',
  [PIVOT_VALUE.ENTRIES_COUNT]: 'entriesCount',
} as const satisfies Record<PivotValue, keyof RawMetricValues>;

const hasOwn = (value: object, property: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, property);

const parseMetricValues = (rawValues: RawMetricValues, requestedValues: PivotValue[]): PivotMetricValues => {
  const requestedProperties = new Set(requestedValues.map((value) => METRIC_PROPERTY_BY_VALUE[value]));

  Object.values(METRIC_PROPERTY_BY_VALUE).forEach((property) => {
    if (hasOwn(rawValues, property) !== requestedProperties.has(property)) {
      throw invalidResponse(`metric ${property} does not match requested Values`);
    }
  });

  const values: PivotMetricValues = {};
  if (rawValues.durationSum !== undefined) values.durationSum = parsePivotDuration(rawValues.durationSum);
  if (hasOwn(rawValues, 'durationAvg')) {
    values.durationAvg = rawValues.durationAvg === null ? null : parsePivotDuration(rawValues.durationAvg as string);
  }
  if (rawValues.entriesCount !== undefined) values.entriesCount = rawValues.entriesCount;
  return values;
};

const parseFilterMembers = (
  rawFilterMembers: RawFilterMembers[],
  request: WorkUnitPivotQueryRequest,
): PivotFilterMembers[] => {
  if (rawFilterMembers.length !== request.filters.length) {
    throw invalidResponse('filterMembers must match requested Filters');
  }

  return rawFilterMembers.map((group, index) => {
    if (group.key !== request.filters[index].key) throw invalidResponse('filterMembers order does not match Filters');

    const seenValues = new Set<string>();
    const selectedValues = request.filters[index].includedValues;
    const selectedIdentities = new Set(selectedValues?.map((value) => JSON.stringify(value)) ?? []);
    const members = group.members.map((member) => {
      validateFieldValue(group.key, member.value);
      const identity = JSON.stringify(member.value);
      if (seenValues.has(identity)) throw invalidResponse(`duplicate ${group.key} filter member`);
      if (!member.available && !selectedIdentities.has(identity)) {
        throw invalidResponse(`unavailable ${group.key} filter member was not selected`);
      }
      seenValues.add(identity);
      return member;
    });

    selectedValues?.forEach((selectedValue) => {
      if (!seenValues.has(JSON.stringify(selectedValue))) {
        throw invalidResponse(`selected ${group.key} filter member is missing`);
      }
    });

    return { key: group.key, members };
  });
};

export const parsePivotResponse = (data: unknown, request: WorkUnitPivotQueryRequest): WorkUnitPivotQueryResponse => {
  const rawResponse = RawResponseSchema.parse(data);
  const coordinatePairs = new Set<string>();
  const rowCoordinates = new Set<string>();
  const columnCoordinates = new Set<string>();

  const cells: PivotCell[] = rawResponse.cells.map((rawCell) => {
    const row = parseCoordinate(rawCell.row, request.rows, 'row');
    const column = parseCoordinate(rawCell.column, request.columns, 'column');
    const identity = JSON.stringify([row, column]);
    if (coordinatePairs.has(identity)) throw invalidResponse('duplicate coordinate pair');
    coordinatePairs.add(identity);
    rowCoordinates.add(JSON.stringify(row));
    columnCoordinates.add(JSON.stringify(column));

    return {
      row,
      column,
      values: parseMetricValues(rawCell.values, request.values),
    };
  });

  if (rawResponse.result.cellCount !== cells.length) throw invalidResponse('cellCount does not match cells');
  const expectedDisplayValueCellCount = rowCoordinates.size * columnCoordinates.size * request.values.length;
  if (cells.length > 0 && rawResponse.result.displayValueCellCount !== expectedDisplayValueCellCount) {
    throw invalidResponse('displayValueCellCount does not match the coordinate matrix');
  }
  if (rawResponse.result.displayValueCellCount > rawResponse.result.maxDisplayValueCellCount) {
    throw invalidResponse('displayValueCellCount exceeds maxDisplayValueCellCount');
  }

  return {
    cells,
    filterMembers: parseFilterMembers(rawResponse.filterMembers, request),
    result: rawResponse.result,
  };
};
