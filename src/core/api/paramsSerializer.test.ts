import { serializeParams } from './paramsSerializer';

describe('serializeParams', () => {
  it('repeats array keys and keeps scalar values', () => {
    expect(
      serializeParams({
        projectIds: ['project 1', 'project&2'],
        page: 2,
        includeArchived: false,
      }),
    ).toBe('projectIds=project%201&projectIds=project%262&page=2&includeArchived=false');
  });

  it('preserves the existing empty and missing-value behavior', () => {
    expect(serializeParams({ empty: [], nullable: null, omitted: undefined })).toBe('nullable=');
  });

  it('preserves nested object serialization', () => {
    expect(serializeParams({ filter: { owner: 'Ada Lovelace' } })).toBe('filter%5Bowner%5D=Ada%20Lovelace');
  });
});
