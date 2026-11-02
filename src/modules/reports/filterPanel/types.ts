import { ReportDateRangeSnapshot } from './reportDateRange';

export type SelectedItemsMap = Record<string, string>;

export type FilterCategory = 'clients' | 'projects' | 'users';

export interface ReportQuerySnapshot extends ReportDateRangeSnapshot {
  projectIds: string[];
  userIds: string[];
  clientIds: string[];
}

export interface UpdateSelectedOptionProps {
  newSelectedClients: SelectedItemsMap;
  newSelectedProjects: SelectedItemsMap;
  newSelectedUsers: SelectedItemsMap;
}
