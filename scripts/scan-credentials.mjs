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
