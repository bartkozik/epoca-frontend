import { compile } from 'sass';

it('keeps original entry text readable on its tinted background', () => {
  const css = compile('src/modules/reports/report/workUnitOverride/WorkUnitOverrideForm.module.scss', {
    loadPaths: ['src'],
  }).css;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const rules = Array.from(style.sheet?.cssRules ?? []).filter(
    (rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE,
  );
  const root = rules.find((rule) => rule.selectorText === '.root');
  const original = rules.find((rule) => rule.selectorText === '.original');
  const luminance = (color: string): number => {
    const channels = color
      .match(/\d+/g)
      ?.slice(0, 3)
      .map((number) => Number(number) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    if (!channels || channels.length !== 3) return NaN;
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const foreground = luminance(root?.style.color ?? '');
  const background = luminance(original?.style.background ?? '');
  style.remove();
  expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(
    4.5,
  );
});
