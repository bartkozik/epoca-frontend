import { compile } from 'sass';

const css = compile('src/modules/reports/pivotTable/pivotOptions/PivotOptions.module.scss', {
  loadPaths: ['src'],
}).css;

const declarationsFor = (selector: string): string[] =>
  Array.from(css.matchAll(new RegExp(`\\${selector} \\{([^}]*)\\}`, 'g')), ([, declarations]) =>
    declarations.replace(/\s+/g, ' ').trim(),
  );

describe('PivotOptions responsive styles', () => {
  it('stacks the heading above the toggle group', () => {
    const [optionsStyles] = declarationsFor('.options');

    expect(optionsStyles).toContain('flex-direction: column');
  });

  it('lays the toggles out in a wrapping row by default', () => {
    const [desktopStyles] = declarationsFor('.options .toggles');

    expect(desktopStyles).toContain('flex-direction: row');
    expect(desktopStyles).toContain('flex-wrap: wrap');
  });

  it('stacks row subtotals, column subtotals, and grand totals on top of each other at or below 831px, before a toggle would wrap', () => {
    const [, mobileStyles] = declarationsFor('.options .toggles');

    expect(css).toContain('@media only screen and (max-width: 831px)');
    expect(mobileStyles).toContain('flex-direction: column');
  });
});
