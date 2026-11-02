import { UpdateIntegrationClientInputSchema } from './integrationClientUpdate.model';

describe('UpdateIntegrationClientInputSchema', () => {
  it('rejects an expectedVersion-only no-op patch', () => {
    expect(() => UpdateIntegrationClientInputSchema.parse({ expectedVersion: 4 })).toThrow();
  });

  it('carries an i18n key, not a resolved string, on the no-op rejection', () => {
    const result = UpdateIntegrationClientInputSchema.safeParse({ expectedVersion: 4 });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      'integration_clients.error.at_least_one_field_required',
    );
  });

  it('treats an explicit null expiration as a real patch', () => {
    expect(UpdateIntegrationClientInputSchema.parse({ expectedVersion: 4, expiresAt: null })).toEqual({
      expectedVersion: 4,
      expiresAt: null,
    });
  });
});
