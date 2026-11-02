# CT-564: Query layout after MR !359

## Requirement and decision

[CT-543](https://company-971f0f2b70.example.invalid/browse/CT-543) introduced schema/hook co-location on September 15, 2026. [CT-564](https://company-971f0f2b70.example.invalid/browse/CT-564) expanded to the whole application on September 24 and specified separate `models/`, `hooks/`, and `queryKeys.ts` files. MR !359 retained the earlier layout. Its September 29 `CLAUDE.md` amendment incorrectly called the newer requirement superseded; that amendment did not establish an agreed Jira exception.

This follow-up implements the newer CT-564 layout. It replaces the conflicting repository guidance and preserves the existing runtime behavior. CT-543's co-location paragraph describes the earlier migration stage, not the final layout implemented here. The Jira descriptions themselves are not changed by this MR.

## Ownership

| Code | Location |
| --- | --- |
| Zod schemas, parsers, schema-derived DTO types | `src/modules/<module>/models/*.model.ts` |
| Query and mutation hooks | `src/modules/<module>/hooks/*.ts` |
| Query-key factories and shared key constants | `src/modules/<module>/queryKeys.ts` |
| Response parsing and HTTP requests | The feature's `requests.ts` boundary |
| Imperative cache helpers/query services | Feature files outside `models/`, such as `queryCache.ts` |
| Session and UI workflow composition | Providers or feature orchestration hooks |

Nested features use the same layout locally: `teamSettings/billing/{models,hooks,queryKeys.ts}` and `teamSettings/integrations/hooks/`. Integration-client list hooks reuse the owning `integrationClients/queryKeys.ts`; they do not invent a second set of keys. Authentication mutations have no read cache, so they do not need an empty `auth/queryKeys.ts`.

Existing query-key values, request parameters, `enabled` conditions, retry settings, stale times, invalidation scope and response parsing are preserved. Schemas must not import React or TanStack Query. ESLint also rejects direct server-state hook imports outside `hooks/` (tests are exempt). `useQueryClient` remains available to UI workflow hooks for explicit refresh/reset operations.

## Related requirements

This layout follow-up does not introduce additional exceptions to CT-564. The session wire/domain type exception and exclusion of existing enum migration are already recorded in CT-543. Integration-client response validation continues rejecting malformed security-sensitive pages and stripping sensitive fields; reorganizing files must not weaken that validation. Existing Zod schemas and DTO derivations are preserved.

The remaining historical discrepancy between the Jira descriptions is recorded above rather than hidden by calling CT-564 obsolete. The MR implements CT-564's concrete file-layout requirement and links this decision for future reviews.

## Verification

- `yarn lint`: verifies imports and the new layout restrictions.
- `yarn typecheck` and `yarn typecheck:e2e`: verify all updated import paths and public exports.
- `yarn test`: exercises the existing schema, query, mutation and provider regression suites.
- `yarn test:e2e:mr`: exercises the existing Chromium, OAuth-client, override and pivot browser gates.
- `yarn build`: checks the production module graph.

This is an internal refactor with no new user interaction. Existing CT-564 coverage-map evidence remains applicable; the MR records the exact verification results.
