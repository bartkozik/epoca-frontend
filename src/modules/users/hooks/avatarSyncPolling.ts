// This file must stay free of other imports: unlike useUserQuery.ts, it's also imported directly
// from Playwright specs (a Node/ts-node context, not Vite), where pulling in requests.ts's chain
// to the Api singleton fails to evaluate.
export const AVATAR_SYNC_POLL_INTERVAL_MS = 10_000;
export const AVATAR_SYNC_MAX_POLL_ATTEMPTS = 7;
