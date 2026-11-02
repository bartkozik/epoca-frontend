import { compile } from 'sass';

interface FlexState {
  direction: string;
  wrap: string;
}

interface ContainerState {
  marginTop: string;
  maxWidth: string;
  width: string;
}

const css = compile('src/modules/reports/filterPanel/FilterPanel.module.scss', { loadPaths: ['src'] }).css;

const mediaMatches = (condition: string, width: number): boolean => {
  const min = condition.match(/min-width:\s*(\d+)px/);
  const max = condition.match(/max-width:\s*(\d+)px/);

  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

const applyFlexDeclarations = (style: CSSStyleDeclaration, state: FlexState): void => {
  Array.from(style).forEach((property) => {
    if (property === 'flex-flow') {
      const [direction, wrap] = style.getPropertyValue(property).trim().split(/\s+/);
      state.direction = direction;
      state.wrap = wrap;
    }
    if (property === 'flex-direction') state.direction = style.getPropertyValue(property).trim();
    if (property === 'flex-wrap') state.wrap = style.getPropertyValue(property).trim();
  });
};

const flexStateAt = (selector: string, width: number): FlexState => {
  const styleElement = document.createElement('style');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  const state: FlexState = { direction: 'row', wrap: 'nowrap' };

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.selectorText === selector) applyFlexDeclarations(styleRule.style, state);
      }
      if (rule.type === CSSRule.MEDIA_RULE) {
        const mediaRule = rule as CSSMediaRule;
        const condition = mediaRule.conditionText ?? mediaRule.media.mediaText;
        if (mediaMatches(condition, width)) applyRules(mediaRule.cssRules);
      }
    });
  };

  applyRules(styleElement.sheet?.cssRules ?? ({} as CSSRuleList));
  styleElement.remove();
  return state;
};

const containerStateAt = (selector: string, width: number): ContainerState => {
  const styleElement = document.createElement('style');
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  const state: ContainerState = { marginTop: '', maxWidth: '', width: '' };

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.selectorText === selector) {
          state.marginTop = styleRule.style.getPropertyValue('margin-top').trim() || state.marginTop;
          state.maxWidth = styleRule.style.getPropertyValue('max-width').trim() || state.maxWidth;
          state.width = styleRule.style.getPropertyValue('width').trim() || state.width;
        }
      }
      if (rule.type === CSSRule.MEDIA_RULE) {
        const mediaRule = rule as CSSMediaRule;
        const condition = mediaRule.conditionText ?? mediaRule.media.mediaText;
        if (mediaMatches(condition, width)) applyRules(mediaRule.cssRules);
      }
    });
  };

  applyRules(styleElement.sheet?.cssRules ?? ({} as CSSRuleList));
  styleElement.remove();
  return state;
};

describe('FilterPanel responsive layout', () => {
  it.each([1536, 1440, 1200])('keeps the period and the entity filters in one wrapping row at %ipx', (width) => {
    expect(flexStateAt('.filterRow', width)).toEqual({ direction: 'row', wrap: 'wrap' });
  });

  it.each([1199, 1024, 768, 390])('stacks the period above the entity filters below 1200px (%ipx)', (width) => {
    expect(flexStateAt('.filterRow', width).direction).toBe('column');
  });

  it.each([1440, 1024, 390])('lets the entity filters wrap at %ipx', (width) => {
    expect(flexStateAt('.entityFilters', width)).toEqual({ direction: 'row', wrap: 'wrap' });
  });

  it.each([
    [1440, '220px'],
    [768, '220px'],
    [767, 'auto'],
    [390, 'auto'],
  ])('sizes each entity filter at %ipx', (width, expected) => {
    expect(containerStateAt('.entityFilter', width).width).toBe(expected);
  });
});
