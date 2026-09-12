---
id: TASK-004
title: Integration test against a real Typesense instance
status: Done
assignee: []
created_date: '2026-09-09 13:29'
updated_date: '2026-09-10 21:40'
labels:
  - testing
dependencies: []
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current tests cover schema inference and hashing only. The client, the bootstrap migrator and the indexer have no coverage against a real server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docker compose spins up typesense for the test run
- [x] #2 covers create, alter and recreate migration strategies
- [x] #3 covers indexer reindex and sync including deletions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added src/typesense.integration.test.ts (24 tests) + vitest.integration.config.ts + docker-compose.yml, run via 'npm run test:integration'. Imports ../dist rather than src: vitest's esbuild transform drops emitDecoratorMetadata, so Nest cannot resolve constructor injection from source. Suite throws rather than skips when no server answers.

Found and fixed three real defects that unit tests could not have caught:
1. 'alter' migration 400'd on every drifted collection — toSchema emits an implicit 'id' field that Typesense never echoes from retrieve() and refuses in update(). Now excluded from both sides of the diff.
2. TypesenseClient.upsert's failure branch was dead code — typesense-js throws ImportError instead of returning per-document results, so onError never fired. Failures now routed through onError; transport errors still rethrow.
3. Typesense rejects adding a required field to a populated collection. Now warns with an actionable message and skips, matching the 'create' branch, instead of taking bootstrap down with a raw 400.
<!-- SECTION:NOTES:END -->
