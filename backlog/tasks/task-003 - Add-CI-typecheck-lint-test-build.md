---
id: TASK-003
title: 'Add CI: typecheck, lint, test, build'
status: In Progress
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 11:39'
labels:
  - infra
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions workflow running on push and PR. Must run the typecheck separately from the test run: vitest transpiles without typechecking, which is how the optional-field inference bug stayed invisible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 workflow runs bun install, tsc --noEmit, biome lint, vitest run and bun run build
- [ ] #2 matrix covers Node 20 and 22
- [ ] #3 Integration job runs the integration suite against a Typesense service container
- [ ] #4 CI fails on formatter drift, not just lint violations
- [ ] #5 Node matrix includes 24, matching the engines >=20 range
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reformat src/typesense.integration.test.ts with biome (formatting only, no logic change) so the repo is format-clean before CI starts enforcing it.
2. Add .github/workflows/ci.yml with two jobs, triggered on push to main and on pull_request.
3. Job 'check' — hermetic, matrix over Node 20, 22 and 24: setup-bun + setup-node, 'bun install --frozen-lockfile', 'bun run typecheck' (tsc --noEmit, kept separate from the test run because vitest transpiles without typechecking), 'biome lint src' and 'biome format src' invoked directly rather than via 'bun run lint' (the repo script passes --write, which mutates the checkout instead of failing), 'bun run test', 'bun run build', then a 'node -e require(./dist)' smoke step so the Node matrix actually proves the CommonJS build loads on each version the engines field promises.
4. Job 'integration' — typesense/typesense:29.0 as a service container on 8108 configured via TYPESENSE_* env vars, a runner-side curl wait-loop for /health rather than a container healthcheck (the image is not guaranteed to ship curl), then 'bun run test:integration' which builds dist first and runs the 24 integration tests.
5. Verify by pushing and watching the real run with 'gh run watch', not by reading the YAML. Confirm the integration job genuinely connects — the suite throws rather than skipping when no server answers, so a green run proves the server was hit.
6. Record results in notes, then finalize against the acceptance criteria.
<!-- SECTION:PLAN:END -->
