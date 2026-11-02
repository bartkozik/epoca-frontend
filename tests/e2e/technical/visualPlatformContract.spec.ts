import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

const visualSpec = readFileSync(path.resolve(__dirname, '../specs/visual-regressions.spec.ts'), 'utf8');
const e2eOperatorGuide = readFileSync(
  path.resolve(__dirname, '../../../docs/testing/e2e.md'),
  'utf8'
);

test('keeps Chromium semantics host-safe and pixel checks explicitly pinned @full @technical', () => {
  expect(visualSpec).toMatch(
    /const PINNED_VISUAL_PLATFORM = 'playwright-1\.49\.1-noble';\s*const shouldComparePinnedVisual =\s*process\.env\.EPOCA_E2E_VISUAL_PLATFORM === PINNED_VISUAL_PLATFORM;/
  );
  expect(visualSpec).toMatch(
    /if \(shouldComparePinnedVisual\) {\s*await expect\(tooltip\)\.toHaveScreenshot\('project-description-info-tooltip\.png'\);\s*}/
  );
  expect(visualSpec).not.toMatch(/test\.skip\([\s\S]*?EPOCA_E2E_VISUAL_PLATFORM/);
  expect(visualSpec.match(/toHaveScreenshot/g)).toHaveLength(1);

  const semanticAssertion = visualSpec.indexOf('expect(fontEvidence.check).toBe(true);');
  const pixelGate = visualSpec.indexOf('if (shouldComparePinnedVisual)');
  expect(semanticAssertion).toBeGreaterThan(-1);
  expect(pixelGate).toBeGreaterThan(semanticAssertion);
  expect(e2eOperatorGuide).toContain(
    'EPOCA_E2E_VISUAL_PLATFORM=playwright-1.49.1-noble node .yarn/releases/yarn-4.18.0.cjs playwright test tests/e2e/specs/visual-regressions.spec.ts --project=mock-chromium --update-snapshots'
  );
});
