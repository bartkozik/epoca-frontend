import { ReportedUnit, Unit } from '@/modules/workingTime/types';

interface EmptyModalConfig {
  isOpen: false;
  type: null;
  date: null;
  unit: null;
}

interface AddModalConfig {
  isOpen: true;
  type: 'add';
  date: Date;
  draft?: Unit;
}

interface EditModalConfig {
  isOpen: true;
  type: 'edit';
  date: Date;
  unit: Unit;
}

interface DeleteConfirmationModalConfig {
  isOpen: true;
  type: 'deleteConfirmation';
  date: Date;
  unit: Unit;
}

interface ReportEditModalConfig {
  isOpen: true;
  type: 'reportEdit';
  date: Date;
  unit: ReportedUnit;
}

export type ModalConfig =
  EmptyModalConfig | AddModalConfig | EditModalConfig | DeleteConfirmationModalConfig | ReportEditModalConfig;
