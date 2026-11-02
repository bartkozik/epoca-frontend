import { createContext, useContext } from 'react';
import type { ModalConfig } from './Calendar/ModalConfig';
import type { ClientAndProjectOption } from './Calendar/UnitForm/ClientAndProjectDropdown';
import type { FormErrors, UnitFormDto } from './Calendar/UnitForm/types';
import type { ReportedUnit, Unit, WorkUnitEntryType } from './types';

export interface UnitWorkspaceState {
  isArchiveDraftConfirmOpen: boolean;
  isArchiveReportedUnitConfirmOpen: boolean;
  isArchiveUnitConfirmOpen: boolean;
  isFormError: boolean;
  isNoRequiredFieldsInFormError: boolean;
  isUnreportedDraftsModalOpen: boolean;
  isUnreportedDraftsWarningOpen: boolean;
  modalConfig: ModalConfig;
  reportedHours: string;
  selectedClientAndProject: ClientAndProjectOption | undefined;
  selectedEntryType: WorkUnitEntryType;
  selectedUnit: ReportedUnit | undefined;
  taskId: string;
  unitCreatorId: string;
  unitDescription: string;
  unitFormErrors: FormErrors;
}

export type UnitWorkspaceValue = UnitWorkspaceState & {
  clientAndProjectOptions: ClientAndProjectOption[];
  reportedUnitsClientAndProjectOptions: ClientAndProjectOption[];
  getCurrentSnapshot: () => UnitWorkspaceState;
  getContextualClientProject: (isUnit: boolean) => {
    description: string;
    id: string;
    archived: boolean;
    unitCreatorIsNoProjectMember: boolean;
  };
  initializeUnitFormData: (unit: ReportedUnit) => void;
  closeModal: () => void;
  openArchiveReportedUnitConfirm: (unit: ReportedUnit, date: Date) => void;
  closeArchiveReportedUnitConfirm: () => void;
  closeEditUnitModal: () => void;
  openArchiveUnitConfirmation: (unit: ReportedUnit) => void;
  closeArchiveUnitConfirmation: () => void;
  openArchiveDraftConfirmation: (unit: Unit) => void;
  closeArchiveDraftConfirmation: () => void;
  setIsNoRequiredFieldsInFormError: (value: boolean) => void;
  setUnitFormErrors: (errors: FormErrors) => void;
  resetFormErrors: () => void;
  clearError: (fieldName: keyof UnitFormDto) => void;
  openDeleteUnitConfirmation: (unit: Unit, date: Date) => void;
  handleUnitEditFormOpen: (unit: Unit) => void;
  handleReportedUnitEditFormOpen: (unit: ReportedUnit) => void;
  handleArchiveSelectedUnit: () => void;
  handleUnitAddFormOpen: (date: Date) => void;
  handleDeleteConfirmationCancel: () => void;
  openUnreportedDraftsWarning: (warn: boolean) => void;
  closeUnreportedDraftsWarning: () => void;
  openUnreportedDraftsModal: () => void;
  closeUnreportedDraftsModal: () => void;
  setSelectedClientAndProjectOption: (option: ClientAndProjectOption) => void;
  setSelectedEntryType: (type: WorkUnitEntryType) => void;
  setReportedHours: (hours: string) => void;
  setUnitDescription: (description: string) => void;
  setTaskId: (id: string) => void;
  setUnitCreatorId: (id: string) => void;
};

export const UnitWorkspaceContext = createContext<UnitWorkspaceValue | undefined>(undefined);

export function useUnitWorkspace(): UnitWorkspaceValue {
  const context = useContext(UnitWorkspaceContext);
  if (!context) throw new Error('useUnitWorkspace must be used within UnitWorkspaceProvider');
  return context;
}
