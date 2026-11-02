// scripts/scan-credentials.mjs
//
// Name-presence check: fails if the Playwright test-user credential variable NAMES
// (not values — no real test credentials are ever committed to this repo) appear
// anywhere: application source, public assets, the built bundle, or the built Docker
// image's static files. This is intentionally narrow — it is not a general secrets
// scanner.
//
// Unconditionally strict, everywhere, including compiled bundles: these names used to
// legitimately appear in src/core/config/env.ts (and the built chunk it compiles into) via a
// dynamic `import.meta.env[key]` lookup — which also meant Vite couldn't statically
// tree-shake the lookup, so it bundled every VITE_-prefixed var set at build time,
// values included, not just the ones actually read. env.ts no longer reads these two
// vars at all, and its remaining reads use static `import.meta.env.VITE_X` access (which
// Vite can tree-shake), so neither the names nor any real value set for them can end up
// in a build anymore — there is no longer a legitimate reason for these patterns to
// appear anywhere this script scans, so no allowlist is needed.
import { execFileSync } from 'node:child_process';

const FORBIDDEN_PATTERNS = [/PLAYWRIGHT_TEST_USER_EMAIL/, /PLAYWRIGHT_TEST_USER_PASSWORD/];

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/scan-credentials.mjs <dir-or-file> [...]');
  process.exit(2);
}

function grepFiles(target) {
  try {
    const output = execFileSync(
      'grep',
      ['-rl', '-E', FORBIDDEN_PATTERNS.map((p) => p.source).join('|'), target],
      { encoding: 'utf8' }
    ).trim();
    return output === '' ? [] : output.split('\n');
  } catch (error) {
    // grep exits 1 when it finds no matches — that's success for this scan, not an error.
    // Any other non-zero exit (e.g. 2 for a missing target) is a real failure: report it
    // clearly instead of letting a raw execFileSync stack trace surface.
    if (error.status === 1) return [];
    console.error(`Scanning "${target}" failed: ${error.message}`);
    process.exit(2);
  }
}

let failures = 0;
for (const target of targets) {
  for (const file of grepFiles(target)) {
    console.error(`Forbidden credential name found in: ${file}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`${failures} file(s) contain forbidden credential names.`);
  process.exit(1);
}
console.log('No forbidden credential names found.');
