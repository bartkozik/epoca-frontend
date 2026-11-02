import { compile } from 'sass';

const cssProperty = (css: string, selector: string, property: string): string => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const value = Array.from(style.sheet?.cssRules ?? [])
    .filter(
      (candidate): candidate is CSSStyleRule =>
        candidate instanceof CSSStyleRule && candidate.selectorText === selector,
    )
    .map((rule) => rule.style.getPropertyValue(property))
    .find(Boolean);
  style.remove();
  return value ?? '';
};

it('renders each history event as a separate bordered card in a spaced vertical list', () => {
  const css = compile('src/modules/reports/report/workUnitOverride/WorkUnitOverrideHistory.module.scss', {
    loadPaths: ['src'],
  }).css;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  try {
    const rules = Array.from(style.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE,
    );
    const card = rules.find((rule) => rule.selectorText === '.entry');
    const list = rules.find((rule) => rule.selectorText === '.list');
    const undoAction = rules.find((rule) => rule.selectorText === '.undoAction');
    expect(card?.style.getPropertyValue('border-radius')).toBe('8px');
    expect(card?.style.getPropertyValue('border')).toContain('1px solid');
    expect(card?.style.padding).toBe('12px');
    expect(list?.style.getPropertyValue('flex-direction')).toBe('column');
    expect(list?.style.gap).toBe('12px');
    expect(undoAction?.style.marginTop).toBe('12px');
  } finally {
    style.remove();
  }
});

it('expands history and the report edit modal while the shared overlay owns vertical scrolling', () => {
  const historyCss = compile('src/modules/reports/report/workUnitOverride/WorkUnitOverrideHistory.module.scss', {
    loadPaths: ['src'],
  }).css;
  const formCss = compile('src/modules/reports/report/workUnitOverride/WorkUnitOverrideForm.module.scss', {
    loadPaths: ['src'],
  }).css;

  const modalCss = compile('src/core/theme/modal/Modal.module.scss', { loadPaths: ['src'] }).css;

  expect(cssProperty(historyCss, '.content', 'max-height')).toBe('');
  expect(cssProperty(historyCss, '.content', 'overflow')).toBe('');
  expect(cssProperty(historyCss, '.content', 'overflow-y')).toBe('');
  expect(cssProperty(formCss, '.reportEditModal[role=dialog]', 'overflow')).toBe('visible');
  expect(cssProperty(formCss, '.reportEditModal[role=dialog]', 'max-height')).toBe('');
  expect(cssProperty(modalCss, '.overlay', 'overflow-y')).toBe('auto');
  expect(cssProperty(modalCss, '.overlay', 'height')).toBe('100dvh');
});
