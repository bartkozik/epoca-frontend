import { existsSync, readFileSync } from 'fs';
import { compile } from 'sass';

const sassOptions = { loadPaths: ['src'], logger: { warn: () => undefined } };
const integrationModules = [
  'src/modules/teamSettings/integrations/Integrations.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientsTable.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientFormModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientDetailsModal.module.scss',
  'src/modules/teamSettings/integrations/OneTimeCredentialsModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientConfirmationModal.module.scss',
] as const;

describe('OAuth client local visual consistency contract', () => {
  it('keeps every OAuth stylesheet local, token-based and free of tiny text', () => {
    integrationModules.forEach((modulePath) => {
      expect(existsSync(modulePath)).toBe(true);
      const source = readFileSync(modulePath, 'utf8');
      expect(source).toMatch(/@use 'core\/theme\//);
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(source).not.toMatch(/font-family\s*:/);
      expect(source).not.toMatch(/font-size:\s*(?:10|11|12|13)px/);
      expect(source).not.toMatch(/@include text\([^;]*(?:10|11|12|13)px/);
      expect(() => compile(modulePath, sassOptions)).not.toThrow();
    });
  });

  it('does not use the decorative FormHeader or the large shared Confirmation in OAuth dialogs', () => {
    [
      'src/modules/teamSettings/integrations/IntegrationClientFormModal.tsx',
      'src/modules/teamSettings/integrations/IntegrationClientDetailsModal.tsx',
      'src/modules/teamSettings/integrations/OneTimeCredentialsModal.tsx',
    ].forEach((componentPath) => {
      const source = readFileSync(componentPath, 'utf8');
      expect(source).not.toContain("from '@/core/theme/FormHeader'");
      expect(source).toContain('<h2');
    });

    expect(readFileSync('src/modules/teamSettings/integrations/Integrations.tsx', 'utf8')).not.toContain(
      "from '@/core/theme/confirmation'",
    );
    expect(readFileSync('src/modules/teamSettings/integrations/IntegrationClientFormModal.tsx', 'utf8')).not.toContain(
      "from '@/core/theme/confirmation'",
    );
  });

  it('uses existing form primitives where they fit the OAuth interaction', () => {
    const form = readFileSync('src/modules/teamSettings/integrations/IntegrationClientFormModal.tsx', 'utf8');
    const credentials = readFileSync('src/modules/teamSettings/integrations/OneTimeCredentialsModal.tsx', 'utf8');

    expect(form).toContain("from '@/core/theme/multiSearch'");
    expect(form).toContain('<MultiSearch');
    expect(credentials).toContain("from '@/core/theme/inputs'");
    expect(credentials).toContain('<Input');
  });

  it('removes the five tiny inline table actions in favor of a single accessible action area', () => {
    const table = readFileSync('src/modules/teamSettings/integrations/IntegrationClientsTable.tsx', 'utf8');

    expect(table).not.toContain('size="extraSmall"');
    expect(table).toContain('aria-expanded');
    expect(table).toContain('aria-controls');
    expect(table).toContain('role="group"');
  });

  it('defines left alignment and accessible interaction sizes inside the OAuth scope', () => {
    const combinedCss = integrationModules
      .map((modulePath) => (existsSync(modulePath) ? compile(modulePath, sassOptions).css : ''))
      .join('\n');

    expect(combinedCss).toMatch(/\.modalTitle[^}]*font-size:\s*22px/);
    expect(combinedCss).toMatch(/\.modalTitle[^}]*text-align:\s*left/);
    expect(combinedCss).toMatch(/min-height:\s*44px/);
    expect(combinedCss).toMatch(/\.detailRow[^}]*text-align:\s*left/);
    expect(combinedCss).toMatch(/\.count[^}]*text-align:\s*left/);
  });
});
