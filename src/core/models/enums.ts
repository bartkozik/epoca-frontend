export enum ClientStatus {
  Active = 'Active',
  Archived = 'Archived',
}

export enum ClientType {
  Internal = 'Internal',
  External = 'External',
}

export enum ClientFilterType {
  All = 'All',
  External = ClientType.External,
  Internal = ClientType.Internal,
}

export enum OrganizationUserRole {
  Employee = 'Employee',
  External = 'External',
  Manager = 'Manager',
  Owner = 'Owner',
}

export enum ProjectStatus {
  Active = 'Active',
  Archived = 'Archived',
}

export enum ProjectUserRole {
  Owner = 'Owner',
  Member = 'Member',
}
