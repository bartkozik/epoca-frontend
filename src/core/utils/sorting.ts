export enum SortDirection {
  Asc = 'Asc',
  Desc = 'Desc',
}

//Add to translations files common.{enumKeyName} if add SortColumn enum
export enum SortColumn {
  Client = 'Client',
  DateAdded = 'Date added',
  Members = 'Members',
  UserName = 'User name',
  Project = 'Project',
  UserRole = 'User role',
}

export interface SortObject {
  [key: string]: SortColumn;
}
