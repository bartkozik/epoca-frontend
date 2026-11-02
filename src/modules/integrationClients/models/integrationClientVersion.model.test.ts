import { IntegrationClientVersionInputSchema } from './integrationClientVersion.model';

describe('IntegrationClientVersionInputSchema', () => {
  it('rejects a non-positive expectedVersion', () => {
    expect(() => IntegrationClientVersionInputSchema.parse({ expectedVersion: 0 })).toThrow();
  });
});
