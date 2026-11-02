import { runLiveFixtureCli } from './live-fixture.mjs';

runLiveFixtureCli().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Live fixture setup failed');
  process.exitCode = 1;
});
