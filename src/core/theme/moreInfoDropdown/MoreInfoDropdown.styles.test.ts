import { compile } from 'sass';

it('keeps scrolling on the positioned panel that owns the dropdown background', () => {
  const css = compile('src/core/theme/moreInfoDropdown/MoreInfoDropdown.module.scss', { loadPaths: ['src'] }).css;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  try {
    const rules = Array.from(style.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE,
    );
    const panel = rules.find((rule) => rule.selectorText === '.moreListItems');
    expect(panel?.style.position).toBe('absolute');
    expect(panel?.style.getPropertyValue('overflow-y')).toBe('auto');
    expect(panel?.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(panel?.style.getPropertyValue('max-height')).not.toBe('');
  } finally {
    style.remove();
  }
});
