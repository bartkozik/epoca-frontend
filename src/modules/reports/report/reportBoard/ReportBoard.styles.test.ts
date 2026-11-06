import { compile } from 'sass';

interface ActionColumnState {
  display: string;
  paddingRight: string;
  width: string;
}

interface DesktopColumnWidths {
  actions: string;
  description: string;
  tableLayout: string;
}

interface ResponsivePmRowState {
  action: string;
  mobileActions: string;
  more: string;
  project: string;
  taskId: string;
}

const reportBoardCss = compile('src/modules/reports/report/reportBoard/ReportBoard.module.scss', {
  loadPaths: ['src'],
}).css;
const moreInfoDropdownCss = compile('src/core/theme/moreInfoDropdown/MoreInfoDropdown.module.scss', {
  loadPaths: ['src'],
}).css;

const mediaMatches = (condition: string, width: number): boolean => {
  if (condition === 'print') return false;
  const min = condition.match(/min-width:\s*(\d+)px/);
  const max = condition.match(/max-width:\s*(\d+)px/);

  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

const responsiveReportRowStateAt = (width: number): ResponsivePmRowState => {
  const styleElement = document.createElement('style');
  styleElement.textContent = reportBoardCss;
  document.head.appendChild(styleElement);
  const state: ResponsivePmRowState = {
    action: actionColumnStateAt(width).display,
    mobileActions: 'block',
    more: moreInfoDisplayAt(width),
    project: 'table-cell',
    taskId: 'table-cell',
  };

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.style.display !== 'none') return;
        if (styleRule.selectorText.includes('.btnBoxMobile')) state.mobileActions = 'none';
        if (
          styleRule.selectorText.includes(
            'td:not(:nth-child(1)):not(:nth-child(2)):not(:nth-child(3)):not(:nth-child(4)):not(:last-child)',
          )
        ) {
          state.taskId = 'none';
        }
        if (
          styleRule.selectorText.includes('td:not(:nth-child(1)):not(:nth-child(2)):not(:nth-child(3))') &&
          !styleRule.selectorText.includes(':nth-child(4)')
        ) {
          state.project = 'none';
          state.taskId = 'none';
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

const moreInfoDisplayAt = (width: number): string => {
  const styleElement = document.createElement('style');
  styleElement.textContent = moreInfoDropdownCss;
  document.head.appendChild(styleElement);
  let display = 'block';

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.selectorText === '.root') display = styleRule.style.display || display;
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
  return display;
};

const sourceProjectMoreDisplayAt = (width: number, withActions: boolean): string => {
  const styleElement = document.createElement('style');
  styleElement.textContent = moreInfoDropdownCss;
  document.head.appendChild(styleElement);
  const panel = document.createElement('div');
  panel.className = 'moreListItems';
  if (withActions) panel.appendChild(document.createElement('div'));
  const list = document.createElement('ul');
  const sourceProject = document.createElement('li');
  list.appendChild(sourceProject);
  panel.appendChild(list);
  document.body.appendChild(panel);
  let display = 'list-item';

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.style.display === 'none' && sourceProject.matches(styleRule.selectorText)) display = 'none';
      }
      if (rule.type === CSSRule.MEDIA_RULE) {
        const mediaRule = rule as CSSMediaRule;
        const condition = mediaRule.conditionText ?? mediaRule.media.mediaText;
        if (mediaMatches(condition, width)) applyRules(mediaRule.cssRules);
      }
    });
  };

  applyRules(styleElement.sheet?.cssRules ?? ({} as CSSRuleList));
  panel.remove();
  styleElement.remove();
  return display;
};

const morePanelTextColors = (): { itemLabel: string } => {
  const styleElement = document.createElement('style');
  styleElement.textContent = `${reportBoardCss}\n${moreInfoDropdownCss}`;
  document.head.appendChild(styleElement);
  const panel = document.createElement('div');
  panel.className = 'moreListItems';
  const list = document.createElement('ul');
  const item = document.createElement('li');
  const itemLabel = document.createElement('span');
  itemLabel.textContent = 'Project:';
  item.appendChild(itemLabel);
  list.appendChild(item);
  panel.appendChild(list);
  document.body.appendChild(panel);

  const colors = {
    itemLabel: getComputedStyle(itemLabel).color,
  };
  panel.remove();
  styleElement.remove();
  return colors;
};

const actionColumnStateAt = (width: number): ActionColumnState => {
  const styleElement = document.createElement('style');
  styleElement.textContent = reportBoardCss;
  document.head.appendChild(styleElement);
  const state: ActionColumnState = { display: 'table-cell', paddingRight: '', width: '' };

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        if (styleRule.selectorText?.includes('td[data-th=Actions]')) {
          state.display = styleRule.style.getPropertyValue('display').trim() || state.display;
          state.paddingRight = styleRule.style.getPropertyValue('padding-right').trim() || state.paddingRight;
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

const desktopColumnWidths = (): DesktopColumnWidths => {
  const styleElement = document.createElement('style');
  styleElement.textContent = reportBoardCss;
  document.head.appendChild(styleElement);
  const widths: DesktopColumnWidths = { actions: '', description: '', tableLayout: '' };

  Array.from(styleElement.sheet?.cssRules ?? []).forEach((rule) => {
    if (rule.type !== CSSRule.STYLE_RULE) return;
    const styleRule = rule as CSSStyleRule;
    const width = styleRule.style.getPropertyValue('width').trim();
    if (styleRule.selectorText === '.tableCustom') {
      widths.tableLayout = styleRule.style.getPropertyValue('table-layout').trim() || widths.tableLayout;
    }
    if (
      styleRule.selectorText?.includes('.tableCustom td[data-th=Actions]') &&
      !styleRule.selectorText.includes('.tableCustomPl')
    ) {
      widths.actions = width || widths.actions;
    }
    if (
      styleRule.selectorText?.includes('.tableCustom td[data-th="Description of activity"]') &&
      !styleRule.selectorText.includes('.tableCustomPl')
    ) {
      widths.description = width || widths.description;
    }
  });

  styleElement.remove();
  return widths;
};

const mobileActionPointerStateAt = (width: number): { child: string; wrapper: string; wrapperPosition: string } => {
  const styleElement = document.createElement('style');
  styleElement.textContent = reportBoardCss;
  document.head.appendChild(styleElement);
  const state = { child: '', wrapper: '', wrapperPosition: '' };

  const applyRules = (rules: CSSRuleList): void => {
    Array.from(rules).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        const pointerEvents = styleRule.style.getPropertyValue('pointer-events').trim();
        if (styleRule.selectorText === '.btnBoxMobile') {
          state.wrapper = pointerEvents || state.wrapper;
          state.wrapperPosition = styleRule.style.getPropertyValue('position').trim() || state.wrapperPosition;
        }
        if (styleRule.selectorText === '.btnBoxMobile .btnBox') {
          state.child = pointerEvents || state.child;
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

const hidesActionColumnInPrint = (): boolean => {
  const styleElement = document.createElement('style');
  styleElement.textContent = reportBoardCss;
  document.head.appendChild(styleElement);
  let hidden = false;

  Array.from(styleElement.sheet?.cssRules ?? []).forEach((rule) => {
    if (rule.type !== CSSRule.MEDIA_RULE) return;
    const mediaRule = rule as CSSMediaRule;
    if ((mediaRule.conditionText ?? mediaRule.media.mediaText) !== 'print') return;

    Array.from(mediaRule.cssRules).forEach((printRule) => {
      if (printRule.type !== CSSRule.STYLE_RULE) return;
      const styleRule = printRule as CSSStyleRule;
      if (styleRule.selectorText?.includes('td[data-th=Actions]') && styleRule.style.display === 'none') hidden = true;
    });
  });

  styleElement.remove();
  return hidden;
};

describe('ReportBoard compact layout', () => {
  it('keeps a tall report edit modal reachable without scrolling the modal itself', () => {
    const styleElement = document.createElement('style');
    styleElement.textContent = reportBoardCss;
    document.head.appendChild(styleElement);
    const rules = Array.from(styleElement.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE,
    );
    const overlayRule = rules.find((rule) => rule.selectorText === '.modalOverlay');
    const modalRule = rules.find((rule) => rule.selectorText === '.modal');

    expect(overlayRule?.style.getPropertyValue('overflow-y')).toBe('auto');
    expect(overlayRule?.style.getPropertyValue('padding')).toBe('16px 0px');
    expect(modalRule?.style.getPropertyValue('margin')).toBe('auto 0px');
    expect(modalRule?.style.getPropertyValue('overflow')).toBe('visible');
    styleElement.remove();
  });

  it.each([
    [1440, { action: 'table-cell', mobileActions: 'none', more: 'none', project: 'table-cell', taskId: 'table-cell' }],
    [1200, { action: 'table-cell', mobileActions: 'none', more: 'none', project: 'table-cell', taskId: 'table-cell' }],
    [768, { action: 'table-cell', mobileActions: 'none', more: 'block', project: 'table-cell', taskId: 'none' }],
    [767, { action: 'none', mobileActions: 'block', more: 'block', project: 'none', taskId: 'none' }],
    [390, { action: 'none', mobileActions: 'block', more: 'block', project: 'none', taskId: 'none' }],
    [320, { action: 'none', mobileActions: 'block', more: 'block', project: 'none', taskId: 'none' }],
  ] as const)('moves report values from table cells into mobile More at %ipx', (width, expected) => {
    expect(responsiveReportRowStateAt(width)).toEqual(expected);
  });

  it.each([
    [1440, { display: 'table-cell', paddingRight: '12px', width: '9%' }],
    [1200, { display: 'table-cell', paddingRight: '12px', width: '9%' }],
    [768, { display: 'table-cell', paddingRight: '12px', width: '20%' }],
    [767, { display: 'none', paddingRight: '', width: '20%' }],
    [390, { display: 'none', paddingRight: '', width: '20%' }],
    [320, { display: 'none', paddingRight: '', width: '20%' }],
  ] as const)('keeps the report action slot stable at %ipx', (width, expected) => {
    expect(actionColumnStateAt(width)).toEqual(expected);
  });

  it('keeps a stable column budget while long report values cannot resize it', () => {
    expect(desktopColumnWidths()).toEqual({ actions: '9%', description: '15%', tableLayout: 'fixed' });
  });

  it('does not reserve the report action slot in printed reports', () => {
    expect(hidesActionColumnInPrint()).toBe(true);
  });

  it.each([767, 390, 320])('keeps mobile More clickable beside the row actions at %ipx', (width) => {
    expect(mobileActionPointerStateAt(width)).toEqual({
      child: 'auto',
      wrapper: 'auto',
      wrapperPosition: 'static',
    });
  });

  it.each([768, 900, 1199])('keeps the duplicate source Project hidden with More actions at %ipx', (width) => {
    expect(sourceProjectMoreDisplayAt(width, true)).toBe('none');
  });

  it('styles More item labels with the primary color', () => {
    expect(morePanelTextColors()).toEqual({
      itemLabel: 'rgb(160, 114, 65)',
    });
  });
});
