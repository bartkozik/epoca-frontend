// CT-540: hoisted out of modules/{clients,organizations,projects}/types.ts. core/theme's generic
// status/type/role selects (SearchBar, Select, DataTableLayout, inputs) and
// core/utils/optionTypes.ts build dropdown option lists directly off these enum values, so core
// needs the enum itself, not just a structural shape a value satisfies (unlike the entity
// interfaces these enums live alongside, which stay module-owned). Each owning module's types.ts
// re-exports its enum(s) from here so every existing import site keeps working unchanged.
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
