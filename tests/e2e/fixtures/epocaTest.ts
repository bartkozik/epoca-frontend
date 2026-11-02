import { expect, test as base } from '@playwright/test';
import { buildWorld, type ActorName, type BuiltWorld, type WorldFailure, type WorldName } from '../worlds';
import { createWorldRuntime, type WorldRuntime } from '../worlds/runtime';
import { installActorSession } from './auth';
import { installMockApi } from './mockApi';

type Options = {
  world: WorldName;
  actor: ActorName;
  failure: WorldFailure['key'] | null;
  // Opt-in allowlist for the pageerror safety-net below; default [] keeps every test strict. Keep
  // the value an object, not a bare array -- Playwright's fixture resolver reads a 2-element array
  // whose 2nd item is itself an object (a RegExp included) as a [value, options] tuple.
  ignoredPageErrors: { patterns: RegExp[] };
};

type Fixtures = {
  worldData: BuiltWorld;
  runtime: WorldRuntime;
};

const MAX_ATTACHED_REQUESTS = 100;

// WebKit reports any interrupted dynamic import with this generic, module-less message; Firefox
// names the module instead.
export const WEBKIT_INTERRUPTED_MODULE_IMPORT_ERROR = /^Importing a module script failed\.$/;

export const test = base.extend<Options & Fixtures>({
  world: ['world-3', { option: true }],
  actor: ['owner', { option: true }],
  failure: [null, { option: true }],
  ignoredPageErrors: [{ patterns: [] }, { option: true }],
  worldData: async ({ world }, use) => use(buildWorld(world)),
  runtime: async ({ worldData, actor, failure }, use) => {
    const runtime = createWorldRuntime(worldData);
    runtime.setActor(actor);
    runtime.activateFailure(failure);
    await use(runtime);
  },
  page: async ({ page, context, worldData, actor, runtime, ignoredPageErrors }, use, testInfo) => {
    await installActorSession(context, worldData, actor);
    await installMockApi(page, runtime);
    await page.clock.install({ time: new Date(worldData.clock) });
    // Vite serves the app as native ES modules with no CRA-style single bundle.js; a stray
    // CommonJS `require()` call (fine under webpack, fatal under Vite), an unhandled promise
    // rejection, or any other broken module graph surfaces as an uncaught page error rather than a
    // failed assertion, so every test using this fixture fails on one automatically instead of
    // silently rendering a blank page.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    await testInfo.attach('e2e-context.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            world: worldData.name,
            actor: runtime.actor,
            configuredActor: actor,
            requests: runtime.journal.entries.slice(-MAX_ATTACHED_REQUESTS),
          },
          null,
          2
        )
      ),
      contentType: 'application/json',
    });
    const unexpectedPageErrors = pageErrors.filter(
      (message) => !ignoredPageErrors.patterns.some((pattern) => pattern.test(message))
    );
    expect(unexpectedPageErrors, 'page must not throw uncaught errors').toEqual([]);
  },
});

export { expect };
