import { readFileSync } from 'fs';
import { compile } from 'sass';

const css = compile('src/core/theme/button/Button.module.scss', { loadPaths: ['src'] }).css;

const findStyleRule = (selector: string): CSSStyleRule | undefined => {
  const styleElement = document.createElement('style');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  const rule = Array.from(styleElement.sheet?.cssRules ?? []).find(
    (candidate): candidate is CSSStyleRule =>
      candidate.type === CSSRule.STYLE_RULE && (candidate as CSSStyleRule).selectorText === selector,
  );
  styleElement.remove();
  return rule;
};

const formerLocalFocusPatches = [
  'src/core/theme/confirmation/Confirmation.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientConfirmationModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientFormModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientsTable.module.scss',
  'src/modules/teamSettings/integrations/Integrations.module.scss',
  'src/modules/teamSettings/integrations/OneTimeCredentialsModal.module.scss',
];

describe('Button focus indicator styles', () => {
  it('shows a visible keyboard focus ring with the theme focus color', () => {
    const focusRule = findStyleRule('.root:focus-visible');

    expect(focusRule?.style.getPropertyValue('outline')).toBe('2px solid #a97135');
    expect(focusRule?.style.getPropertyValue('outline-offset')).toBe('2px');
  });

  it.each(formerLocalFocusPatches)('is not re-patched for shared buttons in %s', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).not.toMatch(/button:focus-visible/);
    expect(source).not.toMatch(
      /\.(action|actionButton|paginationButton|stateButton|copyButton)\s*\{[^}]*&:focus-visible/,
    );
  });
});
