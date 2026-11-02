import { compile } from 'sass';

const css = compile('src/modules/reports/pivotTable/pivotConfiguration/PivotConfigurationModal.module.scss', {
  loadPaths: ['src'],
}).css;

const styleAt = (selector: string): CSSStyleDeclaration => {
  const styleElement = document.createElement('style');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  const collected = document.createElement('div').style;

  Array.from(styleElement.sheet?.cssRules ?? []).forEach((rule) => {
    if (rule.type !== CSSRule.STYLE_RULE) return;
    const styleRule = rule as CSSStyleRule;
    if (
      styleRule.selectorText
        .split(',')
        .map((part) => part.trim())
        .includes(selector)
    ) {
      Array.from(styleRule.style).forEach((property) => {
        collected.setProperty(property, styleRule.style.getPropertyValue(property));
      });
    }
  });

  styleElement.remove();
  return collected;
};

describe('PivotConfigurationModal width and overflow', () => {
  it('keeps the modal at a readable width for the palette and the stacked layout rows', () => {
    const style = styleAt('.modal');

    expect(style.getPropertyValue('width')).toBe('92vw');
    expect(style.getPropertyValue('max-width')).toBe('820px');
    expect(style.getPropertyValue('overflow')).toBe('visible');
  });

  it('scrolls the overlay instead of clipping tall configuration content', () => {
    const style = styleAt('.overlay');

    expect(style.getPropertyValue('overflow-y')).toBe('auto');
    expect(style.getPropertyValue('padding')).toBe('16px 0px');
  });

  it('spaces the field builder and options sections inside the body wrapper', () => {
    const style = styleAt('.body');

    expect(style.getPropertyValue('display')).toBe('flex');
    expect(style.getPropertyValue('flex-direction')).toBe('column');
    expect(style.getPropertyValue('gap')).toBe('20px');
  });
});
