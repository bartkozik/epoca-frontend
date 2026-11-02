import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

// Duplicating `@font-face` into every CSS Module previously caused Vite's dev server to serve
// broken, unresolved relative font URLs from most of the app -- see `_font-faces.scss` for why.
const fontFacesScss = readFileSync(path.resolve(__dirname, '../../../src/core/theme/_font-faces.scss'), 'utf8');
const commonFontScss = readFileSync(path.resolve(__dirname, '../../../src/core/theme/_common-font.scss'), 'utf8');

const fontFace = (family: string, file: string, weight: number): RegExp =>
  new RegExp(
    String.raw`@font-face\s*{[^}]*font-family:\s*['"]${family}['"]\s*;[^}]*src:\s*url\(['"]?\./fonts/${file}\.ttf['"]?\)\s*format\(['"]truetype['"]\)\s*;[^}]*font-weight:\s*${weight}\s*;[^}]*font-style:\s*normal\s*;[^}]*}`,
    's'
  );

test('keeps bundled font declarations canonical @full @technical', () => {
  expect(fontFacesScss).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  expect(fontFacesScss).not.toMatch(/font-family:\s*['"][^'"]+['"]\s*,/);
  expect(fontFacesScss).not.toMatch(/format\(['"]ttf['"]\)/);
  expect(fontFacesScss).toMatch(fontFace('Playfair Display', 'PlayfairDisplay-Bold', 700));
  expect(fontFacesScss).toMatch(fontFace('Playfair Display', 'PlayfairDisplay-Regular', 400));
  expect(fontFacesScss).toMatch(fontFace('Poppins', 'Poppins-Regular', 400));
  expect(fontFacesScss).toMatch(fontFace('Poppins', 'Poppins-Medium', 500));
  // An actual `@font-face` at-rule must not have crept back into the widely-`@use`d
  // mixins/variables partial (a mention in a comment, as above, is fine).
  expect(commonFontScss).not.toMatch(/@font-face\s*\{/);
});
