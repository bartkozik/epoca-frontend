import { User } from '@/modules/users/types';
import { getUserDisplayLabel } from './getUserDisplayLabel';

const createUser = (overrides: Partial<User> = {}): User => ({
  archived: false,
  archivedAt: '',
  avatar: '',
  color: '',
  createdAt: '',
  displayedName: 'Displayed User',
  email: 'user@example.com',
  firstName: 'Full',
  fullName: 'Full User',
  id: 'user-id',
  identities: [],
  isLoggedInUser: false,
  isSuperAdmin: false,
  lastName: 'User',
  modifiedAt: '',
  projects: [],
  ...overrides,
});

describe('getUserDisplayLabel', () => {
  it('returns the trimmed full name', () => {
    expect(getUserDisplayLabel(createUser({ fullName: '  Full User  ' }), 'Unnamed user')).toBe('Full User');
  });

  it('returns the trimmed displayed name when full name is blank', () => {
    expect(getUserDisplayLabel(createUser({ fullName: '  ', displayedName: ' Displayed User ' }), 'Unnamed user')).toBe(
      'Displayed User',
    );
  });

  it('returns the trimmed email when full and displayed names are blank', () => {
    expect(
      getUserDisplayLabel(
        createUser({ fullName: ' ', displayedName: '  ', email: ' user@example.com ' }),
        'Unnamed user',
      ),
    ).toBe('user@example.com');
  });

  it('returns the fallback when all label fields are blank', () => {
    expect(getUserDisplayLabel(createUser({ fullName: ' ', displayedName: ' ', email: ' ' }), 'Unnamed user')).toBe(
      'Unnamed user',
    );
  });
});
