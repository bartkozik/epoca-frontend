import { ClientAndProjectOption } from '@/modules/workingTime/Calendar/UnitForm/ClientAndProjectDropdown';
import type { RawUnit, ReportedUnit, Unit, UnitEditDto } from '@/modules/workingTime/types';
import type React from 'react';
import { NoteFormValues, WorklogFormValues } from './models/unitForm.model';
import type { UseWorkUnitSubmissionResult } from './useWorkUnitSubmission';

export interface UnitFormDto {
  projectId?: ClientAndProjectOption;
  description?: string;
  duration?: string;
}

export type FormError = {
  message?: string;
};

export type FormErrors = {
  [key in keyof UnitFormDto]?: FormError;
};
export type ValidUnitFormData = WorklogFormValues | NoteFormValues;

export interface UnitFormProps {
  date: Date;
  unit?: Unit | ReportedUnit;
  isFormInReportView?: boolean;
  onRequestClose?: () => void;
  onSaveSuccess?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  interactionBlocked?: () => boolean;
  editAdapter?: {
    project: ClientAndProjectOption | undefined;
    projectOptions: ClientAndProjectOption[];
    projectDescription?: string;
    onProjectChange: (option: ClientAndProjectOption) => void;
    taskId: string;
    onTaskIdChange: (value: string) => void;
    sourceReadOnly: boolean;
    assignmentReadOnly: boolean;
    disabled: boolean;
    saveDisabled: boolean;
    savedVersion: number;
    sourceSnapshot: { date: string; duration: string; description: string };
    onSubmit: (dto: UnitEditDto) => Promise<void>;
    extraActions?: React.ReactNode;
  };
  units?: Unit[];
  submission?: UseWorkUnitSubmissionResult;
  onUnitAdded?: (unit: RawUnit) => void;
}
