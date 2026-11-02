import { IdentityType } from '@/core/models/auth';
import { toUser } from './modelUser';
import { RawUser } from './types';

const rawUser: RawUser = {
  archivedAt: '',
  avatar: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  firstName: 'Ada',
  id: 'user-1',
  identities: [
    {
      confirmationCode: null,
      confirmed: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      id: 'identity-1',
      main: true,
      type: IdentityType.MailAddress,
      userId: 'user-1',
      value: 'ada@example.com',
    },
  ],
  isSuperAdmin: false,
  lastName: 'Lovelace',
  modifiedAt: '2024-01-01T00:00:00.000Z',
};

describe('toUser', () => {
  it('derives fullName/displayedName/email/archived and starts with no projects', () => {
    const result = toUser(rawUser, undefined);

    expect(result.fullName).toBe('Ada Lovelace');
    expect(result.displayedName).toBe('Ada Lovelace');
    expect(result.name).toBe('Ada Lovelace');
    expect(result.email).toBe('ada@example.com');
    expect(result.archived).toBe(false);
    expect(result.projects).toEqual([]);
  });

  it('marks a user with archivedAt as archived', () => {
    const result = toUser({ ...rawUser, archivedAt: '2024-02-01T00:00:00.000Z' }, undefined);

    expect(result.archived).toBe(true);
  });

  it('marks isLoggedInUser true only when the id matches the logged in user id', () => {
    expect(toUser(rawUser, 'user-1').isLoggedInUser).toBe(true);
    expect(toUser(rawUser, 'user-2').isLoggedInUser).toBe(false);
    expect(toUser(rawUser, undefined).isLoggedInUser).toBe(false);
  });

  it('falls back to Unknown when no MailAddress identity is present', () => {
    const result = toUser({ ...rawUser, identities: [] }, undefined);

    expect(result.email).toBe('Unknown');
  });
});
