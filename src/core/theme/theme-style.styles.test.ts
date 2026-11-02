import { compile } from 'sass';

const css = compile('src/core/theme/theme-style.scss', { loadPaths: ['src'] }).css;

const styleFor = (selector: string): CSSStyleDeclaration => {
  const styleElement = document.createElement('style');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  const style = document.createElement('div').style;

  Array.from(styleElement.sheet?.cssRules ?? []).forEach((rule) => {
    if (rule.type === CSSRule.STYLE_RULE) {
      const styleRule = rule as CSSStyleRule;
      if (styleRule.selectorText === selector) {
        Array.from(styleRule.style).forEach((property) => {
          style.setProperty(property, styleRule.style.getPropertyValue(property));
        });
      }
    }
  });

  styleElement.remove();
  return style;
};

describe('theme-style overscroll', () => {
  it.each(['html', 'body'])(
    'disables horizontal overscroll on %s so a trackpad swipe during drag-and-drop cannot trigger browser back/forward navigation',
    (selector) => {
      expect(styleFor(selector).getPropertyValue('overscroll-behavior-x')).toBe('none');
    },
  );
});
