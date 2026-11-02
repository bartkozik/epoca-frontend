import { ClientType } from '@/core/models/enums';
import { RawClientResultsSchema, RawClientSchema } from './clientDto.model';

const validRawClient = {
  archivedAt: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  createdByDetails: { id: 'user-1', firstName: 'A' },
  id: 'client-1',
  logo: '',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  modifiedByDetails: { id: 'user-1', firstName: 'A' },
  name: 'Acme',
  organizationId: 'org-1',
  projectCount: 3,
  texture: 'texture-1',
  type: ClientType.External,
};

describe('RawClientSchema', () => {
  it('parses a well-formed client', () => {
    expect(RawClientSchema.parse(validRawClient)).toEqual(validRawClient);
  });

  it('throws when a load-bearing field (id) is missing', () => {
    const { id, ...rest } = validRawClient;
    expect(() => RawClientSchema.parse(rest)).toThrow();
  });

  it('throws when name is empty', () => {
    expect(() => RawClientSchema.parse({ ...validRawClient, name: '' })).toThrow();
  });

  it('falls back to External when type is not a known ClientType instead of throwing', () => {
    const result = RawClientSchema.parse({ ...validRawClient, type: 'Unknown' });
    expect(result.type).toBe(ClientType.External);
  });

  it('falls back on a malformed non-load-bearing field instead of throwing', () => {
    const result = RawClientSchema.parse({
      ...validRawClient,
      projectCount: 'not-a-number',
      modifiedBy: null,
      color: null,
      logo: null,
      texture: null,
    });
    expect(result.projectCount).toBe(0);
    expect(result.modifiedBy).toBe('');
    expect(result.color).toBe('');
    expect(result.logo).toBe('');
    expect(result.texture).toBe('');
  });

  it('strips unrecognized fields instead of passing them through', () => {
    const result = RawClientSchema.parse({ ...validRawClient, futureField: 'value' });
    expect(result).not.toHaveProperty('futureField');
  });
});

describe('RawClientResultsSchema', () => {
  it('parses a paginated client list', () => {
    const payload = { count: 1, results: [validRawClient] };
    expect(RawClientResultsSchema.parse(payload)).toEqual(payload);
  });

  it('drops a client with a malformed load-bearing field instead of rejecting the whole page', () => {
    const malformedClient = { ...validRawClient, id: undefined };
    const result = RawClientResultsSchema.parse({ count: 2, results: [validRawClient, malformedClient] });
    expect(result.results).toEqual([validRawClient]);
  });
});
