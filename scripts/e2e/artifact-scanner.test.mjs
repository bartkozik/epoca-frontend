import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, appendFile, mkdir, mkdtemp, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ArtifactScanError, createLinuxDescriptorTraversalAdapter } from './artifact-scanner.mjs';
import * as productionScanner from './artifact-scanner.mjs';
import { scanAndPublishArtifactsForTest as scanAndPublishArtifacts } from './artifact-scanner.test-support.mjs';

const sandbox = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'epoca-artifact-scan-'));
  return {
    root,
    source: path.join(root, 'results'),
    safe: path.join(root, 'safe-artifacts'),
    quarantine: path.join(root, 'quarantine'),
  };
};

void test('production scanner exports and CLI source expose only the secure Linux boundary', async () => {
  assert.deepEqual(Object.keys(productionScanner).sort(), [
    'ArtifactScanError',
    'createLinuxDescriptorTraversalAdapter',
    'scanAndPublishArtifacts',
  ]);
  const productionSource = await readFile(fileURLToPath(new URL('./artifact-scanner.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(productionSource, /test-support|ForTest|ControlledTest|traversalAdapter/);
  const ciSource = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../..', '.gitlab-ci.yml'),
    'utf8',
  );
  assert.doesNotMatch(ciSource, /artifact-scanner\.test-support\.mjs/);
});

void test('quarantines raw URL-encoded Base64 JSON-escaped and known-prefix representations without leaking values', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const secret = ['fixture', 'quote"', 'slash\\', 'unicode-ł'].join('-');
  const representations = {
    raw: secret,
    urlEncoded: encodeURIComponent(secret),
    base64: Buffer.from(secret).toString('base64'),
    jsonEscaped: JSON.stringify(secret).slice(1, -1),
    oauthCredentialPrefix: ['epc', 'secret', 'v1', 'fixture', 'credential'].join('_'),
    base64OAuthCredentialPrefix: Buffer.from(['epc', 'secret', 'v1', 'encoded', 'fixture'].join('_')).toString(
      'base64',
    ),
    basicAuthorization: `${['Authorization', 'Basic'].join(': ')} ${Buffer.from('fixture-pair').toString('base64')}`,
    bearerJwtShape: `${['Bearer', 'eyJmaXh0dXJl'].join(' ')}.eyJjb250cmFjdCI.e30`,
    clientSecretField: ['client', 'secret'].join('_') + ': "fixture-value"',
    legacySentinelPrefix: ['CT521', 'SECRET', 'SENTINEL'].join('_'),
    deterministicSentinelPrefix: ['OAUTH_CLIENT', 'SECRET', 'SENTINEL'].join('_'),
  };
  await Promise.all(
    Object.entries(representations).map(([name, value]) => writeFile(path.join(paths.source, `${name}.txt`), value)),
  );

  let failure;
  try {
    await scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [secret],
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ArtifactScanError);
  assert.deepEqual(
    new Set(failure.categories),
    new Set(['raw', 'url-encoded', 'base64', 'base64url', 'json-escaped', 'credential-prefix', 'credential-field']),
  );
  assert.ok(failure.locations.length >= Object.keys(representations).length);
  assert.equal(failure.message.includes(secret), false);
  for (const value of Object.values(representations)) {
    assert.equal(failure.message.includes(value), false);
  }
  await assert.rejects(readFile(paths.source), /ENOENT|EISDIR/);
  await assert.rejects(readFile(paths.safe), /ENOENT|EISDIR/);
  assert.match(await readFile(path.join(paths.quarantine, 'source-1', 'raw.txt'), 'utf8'), /^fixture-/);
});

void test('copies only a clean scan into a newly-created safe-artifacts directory', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  await writeFile(path.join(paths.source, 'junit.xml'), '<testsuite tests="1" failures="0"/>');
  await writeFile(path.join(paths.source, 'private-run-state.json'), '{"ownedIds":["fixture-id"]}');

  const result = await scanAndPublishArtifacts({
    sources: [paths.source],
    safeDirectory: paths.safe,
    quarantineDirectory: paths.quarantine,
    secrets: [['not', 'present'].join('-')],
    publishFiles: ['results/junit.xml'],
  });

  assert.equal(result.findings, 0);
  assert.equal(
    await readFile(path.join(paths.safe, 'results', 'junit.xml'), 'utf8'),
    '<testsuite tests="1" failures="0"/>',
  );
  await assert.rejects(access(path.join(paths.safe, 'results', 'private-run-state.json')), /ENOENT/);
});

void test('rejects overlapping or ambiguous artifact path roles before deleting source evidence', async () => {
  /** @type {Array<(paths: {root: string, source: string}) => import("./artifact-scanner-core.mjs").RunArtifactScanOptions>} */
  const cases = [
    ({ root, source }) => ({ sources: [source], safeDirectory: source, quarantineDirectory: path.join(root, 'q') }),
    ({ root, source }) => ({ sources: [source], safeDirectory: path.join(root, 'safe'), quarantineDirectory: source }),
    ({ root, source }) => ({
      sources: [source],
      safeDirectory: path.join(source, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
    ({ root }) => ({
      sources: [path.join(root, 'safe', 'source')],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
    ({ root, source }) => ({
      sources: [source],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(source, 'q'),
    }),
    ({ root }) => ({
      sources: [path.join(root, 'q', 'source')],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
    ({ root, source }) => ({
      sources: [source],
      safeDirectory: path.join(root, 'artifacts'),
      quarantineDirectory: path.join(root, 'artifacts', 'q'),
    }),
    ({ root, source }) => ({
      sources: [source],
      safeDirectory: path.join(root, 'artifacts', 'safe'),
      quarantineDirectory: path.join(root, 'artifacts'),
    }),
    ({ root, source }) => ({
      sources: [source, path.join(source, '.')],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
    ({ root, source }) => ({
      sources: [`${source}${path.sep}.`],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
    ({ root, source }) => ({
      sources: [`${source}${path.sep}child${path.sep}..`],
      safeDirectory: path.join(root, 'safe'),
      quarantineDirectory: path.join(root, 'q'),
    }),
  ];

  for (const [caseIndex, configure] of cases.entries()) {
    const paths = await sandbox();
    const options = configure(paths);
    const evidenceSource = path.resolve(options.sources[0]);
    await mkdir(evidenceSource, { recursive: true });
    const evidence = path.join(evidenceSource, 'evidence.txt');
    await writeFile(evidence, 'must remain');

    await assert.rejects(
      scanAndPublishArtifacts({ ...options, secrets: [] }),
      (error) => error instanceof ArtifactScanError && error.categories.includes('path-contract'),
      `path-role case ${caseIndex + 1}`,
    );
    assert.equal(await readFile(evidence, 'utf8'), 'must remain');
  }
});

void test('fails closed on symbolic links and configured scan bounds', async () => {
  const linked = await sandbox();
  await mkdir(linked.source, { recursive: true });
  await writeFile(path.join(linked.root, 'outside.txt'), 'safe');
  await symlink(path.join(linked.root, 'outside.txt'), path.join(linked.source, 'linked.txt'));
  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [linked.source],
      safeDirectory: linked.safe,
      quarantineDirectory: linked.quarantine,
      secrets: [],
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('symbolic-link'),
  );

  const bounded = await sandbox();
  await mkdir(bounded.source, { recursive: true });
  await writeFile(path.join(bounded.source, 'large.txt'), 'bounded fixture content');
  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [bounded.source],
      safeDirectory: bounded.safe,
      quarantineDirectory: bounded.quarantine,
      secrets: [],
      limits: { maxFiles: 10, maxFileBytes: 4, maxTotalBytes: 32 },
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('scan-bound'),
  );
});

void test('quarantines Basic serialization and credential field vocabulary across casing and separators', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const fixtures = {
    basicJson: JSON.stringify({ authorization: `Basic ${Buffer.from('fixture-pair').toString('base64')}` }),
    basicHeaderValue: `Basic ${Buffer.from('standalone-fixture').toString('base64')}`,
    basicShortValue: 'Basic Og==',
    clientCamel: JSON.stringify({ clientSecret: 'fixture-value' }),
    clientSnake: JSON.stringify({ client_secret: 'fixture-value' }),
    clientKebab: 'client-secret=fixture-value',
    clientSpaced: 'CLIENT SECRET: fixture-value',
    accessCamel: JSON.stringify({ accessToken: 'fixture-value' }),
    accessSnake: JSON.stringify({ access_token: 'fixture-value' }),
    refreshCamel: JSON.stringify({ refreshToken: 'fixture-value' }),
    refreshSnake: JSON.stringify({ refresh_token: 'fixture-value' }),
    refreshKebab: 'refresh-token=fixture-value',
    refreshSpaced: 'Refresh Token: fixture-value',
    passwordUpper: 'PASSWORD: fixture-value',
    authorizationField: 'authorization = fixture-value',
  };
  await Promise.all(
    Object.entries(fixtures).map(([name, value]) => writeFile(path.join(paths.source, `${name}.txt`), value)),
  );

  let failure;
  try {
    await scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ArtifactScanError);
  assert.ok(failure.locations.length >= Object.keys(fixtures).length);
  for (const [name, value] of Object.entries(fixtures)) {
    assert.equal(failure.message.includes(name), false);
    assert.equal(failure.message.includes(value), false);
  }
  await assert.rejects(access(paths.safe), /ENOENT/);
  assert.equal(await access(path.join(paths.quarantine, 'source-1')).then(() => true), true);
});

void test('quarantines form-plus lowercase-percent and Base64url secret representations', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const secret = ['fixture', 'space', '\u{10ffff}'].join(' ');
  const fixtures = {
    form: new URLSearchParams({ value: secret }).toString().slice('value='.length),
    lowerPercent: encodeURIComponent(secret).replace(/%[0-9A-F]{2}/g, (value) => value.toLowerCase()),
    base64url: Buffer.from(secret).toString('base64url'),
  };
  await Promise.all(
    Object.entries(fixtures).map(([name, value]) => writeFile(path.join(paths.source, `${name}.txt`), value)),
  );

  let failure;
  try {
    await scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [secret],
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ArtifactScanError);
  assert.deepEqual(new Set(failure.categories), new Set(['form-url-encoded', 'lowercase-percent', 'base64url']));
});

void test('decodes URL-safe runtime credential prefixes whose Base64 and Base64url encodings differ', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const runtimeCredential = ['epc', 'secret', 'v1', '~AA'].join('_');
  const standard = Buffer.from(runtimeCredential).toString('base64');
  const urlSafe = Buffer.from(runtimeCredential).toString('base64url');
  assert.notEqual(standard, urlSafe);
  await writeFile(path.join(paths.source, 'encoded.txt'), urlSafe);

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('credential-prefix'),
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('quarantines credential-bearing path components without exposing unsafe filenames', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const unsafeComponent = ['epc', 'secret', 'v1', 'filename', 'fixture'].join('_');
  await writeFile(path.join(paths.source, `${unsafeComponent}.txt`), 'otherwise clean');

  let failure;
  try {
    await scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ArtifactScanError);
  assert.ok(failure.categories.includes('credential-prefix'));
  assert.match(failure.message, /source-1:entry-[a-f0-9]{12}/);
  assert.equal(failure.message.includes(unsafeComponent), false);
  assert.equal(
    failure.locations.some((location) => location.includes(unsafeComponent)),
    false,
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('scans every configured source path component without exposing an unsafe parent directory', async () => {
  const paths = await sandbox();
  const unsafeParent = ['epc', 'secret', 'v1', 'parent', 'fixture'].join('_');
  const nestedSource = path.join(paths.root, unsafeParent, 'results');
  await mkdir(nestedSource, { recursive: true });
  await writeFile(path.join(nestedSource, 'clean.txt'), 'otherwise clean');

  let failure;
  try {
    await scanAndPublishArtifacts({
      sources: [nestedSource],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ArtifactScanError);
  assert.ok(failure.categories.includes('credential-prefix'));
  assert.equal(failure.message.includes(unsafeParent), false);
  assert.equal(
    failure.locations.some((location) => location.includes(unsafeParent)),
    false,
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('publishes a private snapshot when the live source mutates afterward', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const report = path.join(paths.source, 'junit.xml');
  await writeFile(report, '<testsuite name="snapshot"/>');
  let hookCalled = false;

  await scanAndPublishArtifacts({
    sources: [paths.source],
    safeDirectory: paths.safe,
    quarantineDirectory: paths.quarantine,
    secrets: [],
    onSnapshotReady: async () => {
      hookCalled = true;
      await writeFile(report, ['epc', 'secret', 'v1', 'late', 'mutation'].join('_'));
    },
  });

  assert.equal(hookCalled, true);
  assert.equal(await readFile(path.join(paths.safe, 'results', 'junit.xml'), 'utf8'), '<testsuite name="snapshot"/>');
});

void test('a later publication failure removes stale and partially-built safe output', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  await mkdir(paths.safe, { recursive: true });
  await writeFile(path.join(paths.safe, 'stale.txt'), 'stale');
  await writeFile(path.join(paths.source, 'first.xml'), '<testsuite/>');

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      publishFiles: ['results/first.xml', 'results/missing.xml'],
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('publish-contract'),
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('applies configured file bounds across all source trees', async () => {
  const paths = await sandbox();
  const second = path.join(paths.root, 'second-results');
  await mkdir(paths.source, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(path.join(paths.source, 'one.txt'), 'one');
  await writeFile(path.join(second, 'two.txt'), 'two');

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source, second],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      limits: { maxFiles: 1, maxFileBytes: 16, maxTotalBytes: 16 },
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('scan-bound'),
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('applies configured total byte bounds across all source trees', async () => {
  const paths = await sandbox();
  const second = path.join(paths.root, 'second-results');
  await mkdir(paths.source, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(path.join(paths.source, 'one.txt'), '123456');
  await writeFile(path.join(second, 'two.txt'), 'abcdef');

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source, second],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      limits: { maxFiles: 10, maxFileBytes: 16, maxTotalBytes: 10 },
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('scan-bound'),
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('a finding in a later source quarantines every source without publishing the earlier source', async () => {
  const paths = await sandbox();
  const second = path.join(paths.root, 'second-results');
  await mkdir(paths.source, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(path.join(paths.source, 'clean.txt'), 'clean');
  await writeFile(path.join(second, 'unsafe.txt'), ['epc', 'secret', 'v1', 'later', 'source'].join('_'));

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source, second],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
    }),
    ArtifactScanError,
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
  assert.equal(await access(path.join(paths.quarantine, 'source-1')).then(() => true), true);
  assert.equal(await access(path.join(paths.quarantine, 'source-2')).then(() => true), true);
});

void test('rejects a parent directory swapped to a symlink during traversal without publishing escaped content', async () => {
  const paths = await sandbox();
  const nested = path.join(paths.source, 'nested');
  const displaced = path.join(paths.source, 'nested-original');
  const outside = path.join(paths.root, 'outside');
  await mkdir(nested, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(nested, 'inside.txt'), 'inside snapshot fixture');
  await writeFile(path.join(outside, 'outside.txt'), 'outside-only fixture');
  let swapped = false;

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      traversalHooks: {
        onBeforeDirectoryRead: async ({ relativePath }) => {
          if (relativePath !== 'nested' || swapped) return;
          swapped = true;
          await rename(nested, displaced);
          await symlink(outside, nested);
        },
      },
    }),
    (error) =>
      error instanceof ArtifactScanError &&
      (error.categories.includes('symbolic-link') || error.categories.includes('snapshot-race')),
  );
  assert.equal(swapped, true);
  await assert.rejects(access(paths.safe), /ENOENT/);
  assert.equal(await readFile(path.join(outside, 'outside.txt'), 'utf8'), 'outside-only fixture');
});

void test('rejects a same-inode file growth during bounded reading without reading beyond configured capacity', async () => {
  const paths = await sandbox();
  await mkdir(paths.source, { recursive: true });
  const growing = path.join(paths.source, 'growing.txt');
  await writeFile(growing, '1234');
  let grew = false;

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      limits: { maxFiles: 4, maxEntries: 8, maxFileBytes: 4, maxTotalBytes: 4 },
      traversalHooks: {
        onFileOpened: async ({ relativePath }) => {
          if (relativePath !== 'growing.txt' || grew) return;
          grew = true;
          await appendFile(growing, '5');
        },
      },
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('scan-bound'),
  );
  assert.equal(grew, true);
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('bounds deeply and widely nested empty directory entries across the whole source set', async () => {
  const paths = await sandbox();
  await mkdir(path.join(paths.source, 'a', 'b', 'c'), { recursive: true });
  await mkdir(path.join(paths.source, 'd'), { recursive: true });

  await assert.rejects(
    scanAndPublishArtifacts({
      sources: [paths.source],
      safeDirectory: paths.safe,
      quarantineDirectory: paths.quarantine,
      secrets: [],
      limits: { maxFiles: 10, maxEntries: 4, maxDepth: 8, maxPathBytes: 128 },
    }),
    (error) => error instanceof ArtifactScanError && error.categories.includes('scan-bound'),
  );
  await assert.rejects(access(paths.safe), /ENOENT/);
});

void test('publishes an unchanged tree after bounded entry traversal and final identity checks', async () => {
  const paths = await sandbox();
  await mkdir(path.join(paths.source, 'nested'), { recursive: true });
  await writeFile(path.join(paths.source, 'nested', 'clean.txt'), 'stable fixture');

  const result = await scanAndPublishArtifacts({
    sources: [paths.source],
    safeDirectory: paths.safe,
    quarantineDirectory: paths.quarantine,
    secrets: [],
    limits: { maxFiles: 2, maxEntries: 4, maxDepth: 4, maxPathBytes: 128, maxFileBytes: 64, maxTotalBytes: 64 },
  });

  assert.deepEqual(result, { filesScanned: 1, findings: 0 });
  assert.equal(await readFile(path.join(paths.safe, 'results', 'nested', 'clean.txt'), 'utf8'), 'stable fixture');
});

void test(
  'Linux production adapter enumerates and opens children through an anchored proc descriptor',
  { skip: process.platform === 'linux' ? false : 'Linux /proc/self/fd descriptor traversal is unavailable' },
  async () => {
    const paths = await sandbox();
    await mkdir(path.join(paths.source, 'nested'), { recursive: true });
    await writeFile(path.join(paths.source, 'nested', 'clean.txt'), 'descriptor fixture');
    const adapter = createLinuxDescriptorTraversalAdapter();
    const root = await adapter.openRoot(paths.source);
    try {
      assert.match(adapter.descriptorPath(root), /^\/proc\/self\/fd\/\d+$/);
      const rootEntries = [];
      for await (const entry of adapter.entries(root)) rootEntries.push(entry);
      assert.deepEqual(rootEntries, ['nested']);
      const nested = await adapter.openChild(root, 'nested');
      try {
        const nestedEntries = [];
        for await (const entry of adapter.entries(nested)) nestedEntries.push(entry);
        assert.deepEqual(nestedEntries, ['clean.txt']);
        const file = await adapter.openChild(nested, 'clean.txt');
        try {
          assert.equal((await file.handle.stat()).isFile(), true);
        } finally {
          await adapter.close(file);
        }
      } finally {
        await adapter.close(nested);
      }
    } finally {
      await adapter.close(root);
    }
  },
);

void test(
  'artifact scanner CLI fails closed where Linux descriptor-relative traversal is unavailable',
  { skip: process.platform === 'linux' ? 'Linux provides the required production adapter' : false },
  async () => {
    const paths = await sandbox();
    await mkdir(paths.source, { recursive: true });
    await mkdir(paths.safe, { recursive: true });
    await writeFile(path.join(paths.source, 'clean.txt'), 'clean fixture');
    await writeFile(path.join(paths.safe, 'stale.txt'), 'must not remain publishable');
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./artifact-scanner.mjs', import.meta.url)), paths.safe, paths.quarantine, paths.source],
      { encoding: 'utf8', timeout: 5_000 },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires Linux \/proc\/self\/fd support/);
    assert.equal(result.stdout, '');
    await assert.rejects(access(paths.safe), /ENOENT/);
  },
);
