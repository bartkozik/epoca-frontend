import { ValidUnitFormData } from './UnitForm/types';

export interface UnitSubmitParams {
  validFormData: ValidUnitFormData;
  id?: string;
  draftId?: string;
}
