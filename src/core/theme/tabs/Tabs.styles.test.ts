import { compile } from 'sass';

const css = compile('src/core/theme/tabs/Tabs.module.scss', { loadPaths: ['src'] }).css;

const declarationsFor = (selector: string): string[] =>
  Array.from(css.matchAll(new RegExp(`\\${selector} \\{([^}]*)\\}`, 'g')), ([, declarations]) =>
    declarations.replace(/\s+/g, ' ').trim(),
  );

describe('Tabs responsive styles', () => {
  it('preserves the desktop vertical tab column', () => {
    const [desktopStyles] = declarationsFor('.detailsOptions');

    expect(desktopStyles).toContain('flex-flow: column');
    expect(desktopStyles).not.toContain('overflow-x');
  });

  it('keeps every tab operable in a horizontally scrollable strip at 320px', () => {
    const [, mobileTabListStyles] = declarationsFor('.detailsOptions');
    const [, mobileTabStyles] = declarationsFor('.headline');

    expect(css).toContain('@media only screen and (max-width: 767px)');
    expect(mobileTabListStyles).toContain('flex-flow: row');
    expect(mobileTabListStyles).toContain('max-width: 100%');
    expect(mobileTabListStyles).toContain('overflow-x: auto');
    expect(mobileTabListStyles).toContain('overflow-y: hidden');
    expect(mobileTabListStyles).toContain('height: auto');
    expect(mobileTabListStyles).toContain('gap: 16px');
    expect(mobileTabListStyles).toContain('padding: 4px 4px 12px');
    expect(mobileTabStyles).toContain('flex: 0 0 auto');
    expect(mobileTabStyles).toContain('margin: 0');
  });
});
