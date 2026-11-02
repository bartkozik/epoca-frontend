import { CreateIntegrationClientInputSchema } from './integrationClientCreate.model';

const validInput = {
  name: 'Reporting warehouse',
  scopes: ['reports:read'] as const,
  projectAccess: { mode: 'AllProjects' as const },
};

describe('CreateIntegrationClientInputSchema', () => {
  it('rejects a request with no scopes', () => {
    expect(() => CreateIntegrationClientInputSchema.parse({ ...validInput, scopes: [] })).toThrow();
  });
});
