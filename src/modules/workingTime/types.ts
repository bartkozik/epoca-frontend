import { ApiResponse } from '@/core/api';
import { z } from 'zod';
import type {
  ClientProjectSchema,
  RawReportedUnitResultsSchema,
  RawReportedUnitSchema,
  RawUnitResultsSchema,
  RawUnitSchema,
  RawUnitsOrderSchema,
  UnitDtoSchema,
  UnitEditDtoSchema,
  UnitsDtoSchema,
} from './models/unitDto.model';

export enum UnitState {
  Inactive = 'Inactive',
  Deleted = 'Deleted',
  GdprAnonymized = 'GdprAnonymized',
  Archived = 'Archived',
  Draft = 'Draft',
  Active = 'Active',
}

export enum WorkUnitEntryType {
  Worklog = 'Worklog',
  Note = 'Note',
}

export interface ProjectClientReportedData {
  hours: number;
  color: string;
}

export type ClientProject = z.infer<typeof ClientProjectSchema>;

export type UnitDto = z.infer<typeof UnitDtoSchema>;

export type UnitsDto = z.infer<typeof UnitsDtoSchema>;

export type UnitEditDto = z.infer<typeof UnitEditDtoSchema>;

export type RawUnit = z.infer<typeof RawUnitSchema>;
export type RawUnitsOrder = z.infer<typeof RawUnitsOrderSchema>;
export type RawUnitResults = z.infer<typeof RawUnitResultsSchema>;
export type RawReportedUnit = z.infer<typeof RawReportedUnitSchema>;
export type RawReportedUnitResults = z.infer<typeof RawReportedUnitResultsSchema>;

export interface UnitFormatting {
  formattedDuration: string;
  formattedReportDuration: string;
  formattedCreatedAt: string;
  formattedDate: string;
  userFullName: string | undefined;
  convertedDate: Date;
  sequenceIndex: number;
}

export type Unit = Omit<RawUnit, 'userFullName'> & UnitFormatting;
export type ReportedUnit = Omit<RawReportedUnit, 'userFullName'> & UnitFormatting;

export type UnitReturn = ApiResponse<RawUnit>;
export type UnitsReturn = ApiResponse<RawUnitResults>;
export type ReportedUnitsReturn = ApiResponse<RawReportedUnitResults>;
