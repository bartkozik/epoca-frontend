import api from '@/core/api';
import { IdentityType } from '@/core/models/auth';
import type { MockedFunction } from 'vitest';
import { createUser, deleteUser, getUser, getUsers, updateUser } from './requests';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// api mock, see src/modules/integrationClients/requests.test.ts for the full rationale.
// eslint-disable-next-line vitest/unbound-method
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method
const postMock = api.post as MockedFunction<typeof api.post>;
// eslint-disable-next-line vitest/unbound-method
const patchMock = api.patch as MockedFunction<typeof api.patch>;
// eslint-disable-next-line vitest/unbound-method
const deleteMock = api.delete as MockedFunction<typeof api.delete>;

const rawUser = {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('users requests', () => {
  it('parses a plain-array user list, stripping unrecognized fields', async () => {
    getMock.mockResolvedValueOnce({ data: [{ ...rawUser, futureField: 'ignored' }] });

    const { data } = await getUsers();

    expect(getMock).toHaveBeenCalledWith('/users');
    expect(data).toEqual([rawUser]);
  });

  it('drops a user with a malformed load-bearing field instead of rejecting the whole list', async () => {
    getMock.mockResolvedValueOnce({ data: [rawUser, { ...rawUser, id: undefined }] });

    const { data } = await getUsers();

    expect(data).toEqual([rawUser]);
  });

  // GET /users/:id returns a single user, not an array -- getUser previously mistyped this as
  // UsersReturn (an array), a pre-existing bug never exercised because nothing calls getUser
  // anywhere in the app.
  it('gets and parses a single user by id, not an array', async () => {
    getMock.mockResolvedValueOnce({ data: rawUser });

    const { data } = await getUser('user-1');

    expect(getMock).toHaveBeenCalledWith('/users/user-1');
    expect(data).toEqual(rawUser);
  });

  it('creates a user and parses the response', async () => {
    postMock.mockResolvedValueOnce({ data: { user: rawUser, recoveryCodes: ['code-1', 'code-2'] } });

    const { data } = await createUser('Ada', 'Lovelace', 'ada@example.com');

    expect(postMock).toHaveBeenCalledWith('/users', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: null,
      superAdminKey: null,
    });
    expect(data).toEqual(rawUser);
  });

  // updateUser returns Promise<void> (see requests.ts) -- no caller reads the response body, only
  // the PATCH request itself and the boundary validation it triggers matter here.
  it('updates a user, validating the response as a boundary check', async () => {
    patchMock.mockResolvedValueOnce({ data: rawUser });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await updateUser('user-1', 'Ada Renamed');

    expect(patchMock).toHaveBeenCalledWith('/users/user-1', { name: 'Ada Renamed' });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Regression guard: useUpdateUserMutation discards this value (see userUpdate.model.ts) -- it
  // only drives cache invalidation, so an empty/partial PATCH echo must not throw and fail an
  // edit the backend actually applied. It's still surfaced to the console.
  it('logs instead of throwing when the update response body is empty', async () => {
    patchMock.mockResolvedValueOnce({ data: {} });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(updateUser('user-1', 'Ada Renamed')).resolves.not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('deletes a user', async () => {
    deleteMock.mockResolvedValueOnce({ data: undefined });

    await deleteUser('user-1');

    expect(deleteMock).toHaveBeenCalledWith('/users/user-1');
  });
});
