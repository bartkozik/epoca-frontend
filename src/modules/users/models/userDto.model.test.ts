import { IdentityType } from '@/core/models/auth';
import { RawUserSchema, UserIdentitySchema } from './userDto.model';

const validIdentity = {
  confirmationCode: null,
  confirmed: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  id: 'identity-1',
  main: true,
  type: IdentityType.MailAddress,
  userId: 'user-1',
  value: 'ada@example.com',
};

const validRawUser = {
  archivedAt: '',
  avatar: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  firstName: 'Ada',
  id: 'user-1',
  identities: [validIdentity],
  isSuperAdmin: false,
  lastName: 'Lovelace',
  modifiedAt: '2024-01-01T00:00:00.000Z',
};

describe('UserIdentitySchema', () => {
  it('parses a well-formed identity', () => {
    expect(UserIdentitySchema.parse(validIdentity)).toEqual(validIdentity);
  });

  it('keeps an unrecognized type verbatim instead of dropping it', () => {
    expect(UserIdentitySchema.parse({ ...validIdentity, type: 'Unknown' }).type).toBe('Unknown');
  });

  it('throws when type is missing', () => {
    const { type: _type, ...rest } = validIdentity;
    expect(() => UserIdentitySchema.parse(rest)).toThrow();
  });

  it('throws when value is not a string', () => {
    expect(() => UserIdentitySchema.parse({ ...validIdentity, value: null })).toThrow();
  });

  it('falls back on malformed non-load-bearing fields instead of throwing', () => {
    const result = UserIdentitySchema.parse({
      ...validIdentity,
      confirmed: 'yes',
      createdAt: null,
      id: null,
      main: null,
      userId: null,
    });
    expect(result.confirmed).toBe(false);
    expect(result.createdAt).toBe('');
    expect(result.id).toBe('');
    expect(result.main).toBe(false);
    expect(result.userId).toBe('');
  });
});

describe('RawUserSchema', () => {
  it('parses a well-formed user', () => {
    expect(RawUserSchema.parse(validRawUser)).toEqual(validRawUser);
  });

  it('throws when the load-bearing field (id) is missing', () => {
    const { id, ...rest } = validRawUser;
    expect(() => RawUserSchema.parse(rest)).toThrow();
  });

  it('falls back on a malformed non-load-bearing field instead of throwing', () => {
    const result = RawUserSchema.parse({
      ...validRawUser,
      firstName: null,
      lastName: null,
      archivedAt: null,
      avatar: null,
      color: null,
      isSuperAdmin: 'yes',
    });
    expect(result.firstName).toBe('');
    expect(result.lastName).toBe('');
    expect(result.archivedAt).toBe('');
    expect(result.avatar).toBe('');
    expect(result.color).toBe('');
    expect(result.isSuperAdmin).toBe(false);
  });

  it('drops a malformed identity instead of blanking the whole array', () => {
    const result = RawUserSchema.parse({
      ...validRawUser,
      identities: [validIdentity, { ...validIdentity, value: null }],
    });
    expect(result.identities).toEqual([validIdentity]);
  });

  it('defaults identities to [] when the field is missing or malformed', () => {
    const result = RawUserSchema.parse({ ...validRawUser, identities: undefined });
    expect(result.identities).toEqual([]);
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = RawUserSchema.parse({ ...validRawUser, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });

  it('defaults avatar to "" when the field is entirely absent', () => {
    const { avatar: _avatar, ...rest } = validRawUser;
    expect(RawUserSchema.parse(rest).avatar).toBe('');
  });
});
