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
  // Optional so ReportBoard.tsx's report-view usage (out of scope here) keeps compiling: its daily-
  // hours cap check just degrades to "no other units known" when omitted.
  units?: Unit[];
  // Optional so ReportBoard.tsx keeps compiling unchanged; falls back to this component's own hook
  // instance below when omitted. Calendar.tsx passes its shared instance so DraftsBoard's loading
  // indicator reflects the same submission.
  submission?: UseWorkUnitSubmissionResult;
  // Only meaningful for a genuinely new add; ReportBoard.tsx's report-view usage never adds units.
  onUnitAdded?: (unit: RawUnit) => void;
}
