/* eslint-disable testing-library/no-node-access -- these tests verify compiled production CSS. */
import { readFileSync } from 'fs';
import { cleanup } from '@testing-library/react';
import { compile } from 'sass';

const sassOptions = { loadPaths: ['src'], logger: { warn: () => undefined } };
const modalModules = [
  'src/modules/teamSettings/integrations/IntegrationClientFormModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientDetailsModal.module.scss',
  'src/modules/teamSettings/integrations/OneTimeCredentialsModal.module.scss',
  'src/modules/teamSettings/integrations/IntegrationClientConfirmationModal.module.scss',
] as const;
const componentPaths = [
  'src/modules/teamSettings/integrations/IntegrationClientFormModal.tsx',
  'src/modules/teamSettings/integrations/IntegrationClientDetailsModal.tsx',
  'src/modules/teamSettings/integrations/OneTimeCredentialsModal.tsx',
] as const;

const cssByModule = new Map(modalModules.map((modulePath) => [modulePath, compile(modulePath, sassOptions).css]));

const install = (css: string): HTMLStyleElement => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
};

const element = (className: string, tag = 'div'): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  document.body.appendChild(node);
  return node;
};

describe('OAuth client OAuth modal production styles', () => {
  const styles: HTMLStyleElement[] = [];

  afterEach(() => {
    cleanup();
    styles.splice(0).forEach((style) => style.remove());
    document.body.replaceChildren();
  });

  it('keeps styles token-based and avoids inaccessible 10-13px copy', () => {
    modalModules.forEach((modulePath) => {
      const source = readFileSync(modulePath, 'utf8');
      const css = cssByModule.get(modulePath) ?? '';
      expect(source).toMatch(/@use 'core\/theme\//);
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(source).not.toMatch(/font-family\s*:/);
      expect(source).not.toMatch(/@include text\([^;]*(?:10|11|12|13)px/);
      expect(css).not.toMatch(/font-size:\s*(?:10|11|12|13)px/);
    });
  });

  it('uses a compact left-aligned Poppins title in every OAuth dialog', () => {
    componentPaths.forEach((componentPath) => {
      const source = readFileSync(componentPath, 'utf8');
      expect(source).not.toContain("from '@/core/theme/FormHeader'");
      expect(source).toContain('<h2 className={styles.modalTitle}');
    });

    modalModules.forEach((modulePath) => {
      styles.push(install(cssByModule.get(modulePath) ?? ''));
      const title = element('modalTitle', 'h2');
      const computed = getComputedStyle(title);
      expect(computed.fontFamily).toContain('Poppins');
      expect(computed.fontSize).toBe('22px');
      expect(computed.fontWeight).toBe('500');
      expect(computed.textAlign).toBe('left');
      title.remove();
    });
  });

  it('keeps form choices, confirmations and acknowledgement targets at least 44px high', () => {
    styles.push(install(cssByModule.get(modalModules[0]) ?? ''));
    expect(getComputedStyle(element('choice')).minHeight).toBe('44px');
    document.body.replaceChildren();

    styles.push(install(cssByModule.get(modalModules[2]) ?? ''));
    expect(getComputedStyle(element('acknowledgement', 'label')).minHeight).toBe('44px');
    document.body.replaceChildren();

    styles.push(install(cssByModule.get(modalModules[3]) ?? ''));
    expect(getComputedStyle(element('action', 'button')).minHeight).toBe('44px');
  });

  it('keeps checkbox keyboard focus inside the control instead of drawing a duplicate box', () => {
    styles.push(install(cssByModule.get(modalModules[0]) ?? ''));
    const choice = element('choice', 'label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    choice.appendChild(checkbox);
    checkbox.focus();

    const computed = getComputedStyle(checkbox);
    expect(computed.outlineOffset).toBe('-2px');
    expect(computed.outlineColor).toBe('rgb(37, 38, 40)');
  });

  it('presents details as readable left-aligned label-value rows', () => {
    styles.push(install(cssByModule.get(modalModules[1]) ?? ''));
    const row = element('detailRow');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    row.append(label, value);

    expect(getComputedStyle(row).gridTemplateColumns).toBe('180px minmax(0, 1fr)');
    expect(getComputedStyle(row).textAlign).toBe('left');
    expect(getComputedStyle(label).fontSize).toBe('14px');
    expect(getComputedStyle(value).fontSize).toBe('16px');
    expect(getComputedStyle(value).textAlign).toBe('left');
  });

  it('gives data-heavy OAuth dialogs enough desktop width and keeps the project picker inside the viewport', () => {
    const formSource = readFileSync(modalModules[0], 'utf8');
    const detailsSource = readFileSync(modalModules[1], 'utf8');
    const credentialsSource = readFileSync(modalModules[2], 'utf8');

    expect(formSource).toContain('width: min(640px, calc(100vw - 32px))');
    expect(formSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(formSource).toContain('max-height: min(400px, calc(100vh - 96px))');
    expect(detailsSource).toContain('width: min(680px, calc(100vw - 32px))');
    expect(credentialsSource).toContain('width: min(640px, calc(100vw - 32px))');
  });

  it('lets the project picker escape the form dialog without adding a dialog scrollbar', () => {
    const formSource = readFileSync(componentPaths[0], 'utf8');
    expect(formSource).toContain('overlayClassName={styles.overlay}');

    styles.push(install(cssByModule.get(modalModules[0]) ?? ''));
    const overlay = element('overlay');
    const modal = document.createElement('div');
    modal.className = 'modal';
    overlay.appendChild(modal);

    expect(getComputedStyle(overlay).overflowY).toBe('auto');
    expect(getComputedStyle(modal).overflowY).toBe('visible');
  });

  it('keeps narrow OAuth dialogs within the viewport and delegates scrolling to the shared overlay', () => {
    const sharedCss = compile('src/core/theme/modal/Modal.module.scss', sassOptions).css;
    expect(sharedCss).toMatch(/\.overlay\s*\{[^}]*overflow-y:\s*auto/);
    modalModules.slice(1).forEach((modulePath) => {
      const css = cssByModule.get(modulePath) ?? '';
      expect(css).not.toMatch(/\.modal\s*\{[^}]*(?:max-height:|overflow-y:\s*(?:auto|scroll))/);
      expect(css).toMatch(/@media[^{}]*max-width:\s*767px[\s\S]*?\.modal[^}]*width:\s*calc\(100vw - 16px\)/);
    });
  });
});
