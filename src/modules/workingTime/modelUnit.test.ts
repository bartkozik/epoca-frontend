import { OrganizationUser, OrganizationUserRole } from '@/modules/organizations/types';
import { modelUnit } from './modelUnit';
import { RawUnit, UnitState, WorkUnitEntryType } from './types';

// boundaries/ignore excludes test files from the module -> module lint rule (eslint.config.js), so
// importing OrganizationUser here directly is fine even though modelUnit.ts itself can't.
const createOrganizationUser = (overrides: Partial<OrganizationUser> = {}): OrganizationUser => ({
  archived: false,
  avatar: '',
  displayedName: 'Test User',
  email: 'user@example.com',
  firstName: 'Test',
  fullName: 'Test User',
  id: 'user-1',
  identities: [],
  lastName: 'User',
  organizationRoles: [OrganizationUserRole.Employee],
  projects: [],
  ...overrides,
});

const projectClient = {
  projectName: 'Epoca',
  clientId: 'client-1',
  projectId: 'project-1',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const createRawUnit = (overrides: Partial<RawUnit> = {}): RawUnit => ({
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
  ...overrides,
});

const contextOrganizationUsers = [createOrganizationUser()];

describe('modelUnit', () => {
  it('resolves userFullName from the org directory by userId', () => {
    const unit = modelUnit(createRawUnit(), contextOrganizationUsers);
    expect(unit.userFullName).toBe('Test User');
  });

  it('falls back to the user email when the directory entry has no fullName', () => {
    const unit = modelUnit(createRawUnit(), [createOrganizationUser({ fullName: '' })]);
    expect(unit.userFullName).toBe('user@example.com');
  });

  // Preserves the API snapshot when a historical user is no longer in the organization directory
  // -- moved from WorkingTimeStore.test.ts (CT-560), now exercising the pure function directly.
  it('preserves the API snapshot userFullName when the user is not in the org directory', () => {
    const unit = modelUnit(
      createRawUnit({ userId: 'archived-user', userFullName: 'Archived Historical User' }),
      contextOrganizationUsers,
    );

    expect(unit.userFullName).toBe('Archived Historical User');
  });

  it('formats duration, report duration, createdAt and date', () => {
    const unit = modelUnit(createRawUnit(), contextOrganizationUsers);

    expect(unit.formattedDuration).toBe('08:00');
    expect(unit.formattedReportDuration).toBe('08:00');
    expect(unit.formattedCreatedAt).toBe('28.07.2026');
    expect(unit.formattedDate).toBe('28.07.2026');
    expect(unit.convertedDate).toEqual(new Date('2026-07-28'));
  });

  it('defaults sequenceIndex to 0 when no index is given, and uses the given index otherwise', () => {
    expect(modelUnit(createRawUnit(), contextOrganizationUsers).sequenceIndex).toBe(0);
    expect(modelUnit(createRawUnit(), contextOrganizationUsers, 3).sequenceIndex).toBe(3);
  });

  it('spreads the raw unit fields onto the modeled unit', () => {
    const raw = createRawUnit({ taskId: 'CT-999' });
    const unit = modelUnit(raw, contextOrganizationUsers);

    expect(unit.id).toBe(raw.id);
    expect(unit.projectClient).toEqual(raw.projectClient);
    expect(unit.taskId).toBe('CT-999');
    expect(unit.state).toBe(UnitState.Active);
  });
});
