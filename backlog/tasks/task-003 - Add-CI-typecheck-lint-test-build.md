---
id: TASK-003
title: 'Add CI: typecheck, lint, test, build'
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 11:46'
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
- [x] #1 workflow runs bun install, tsc --noEmit, biome lint, vitest run and bun run build
- [x] #2 matrix covers Node 20 and 22
- [x] #3 Integration job runs the integration suite against a Typesense service container
- [x] #4 CI fails on formatter drift, not just lint violations
- [x] #5 Node matrix includes 24, matching the engines >=20 range
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added .github/workflows/ci.yml with two jobs on push to main and pull_request.

check (matrix Node 20, 22, 24): bun install --frozen-lockfile, bun run build, bun run typecheck, biome lint, biome format, bun run test, then a node -e step that loads dist and asserts design:paramtypes survived. biome is invoked directly rather than via 'bun run lint', because that script passes --write and would rewrite the checkout instead of failing. Build runs before typecheck — see below.

integration: Typesense 29.0 started with docker run, a runner-side curl wait loop on /health, then bun run test:integration.

The first CI run failed both jobs and surfaced two genuine defects rather than workflow typos:

1. 'bun run typecheck' fails on any clean checkout with TS2307 plus nine TS7006 errors. src/typesense.integration.test.ts imports ../dist/index.js by design, so dist is an input to tsc --noEmit. It passed locally only because a stale dist was present. Reproduced locally by moving dist aside. Fixed by building before typechecking; the build uses tsconfig.build.json which excludes tests, so both steps still fail independently on real errors.

2. The Typesense service container exited(1) before binding the port. A services: container cannot override the image command, and Typesense needs --data-dir pointing at a directory that exists. Replaced with docker run using the same arguments docker-compose.yml already uses, and the wait loop now dumps docker logs on failure.

Also reformatted src/typesense.integration.test.ts, the one file failing biome format (wrapping, trailing commas, one quote-style change; verified tsc, 17 unit and 24 integration tests unchanged).

Verification, run 34691871106, all four jobs success: integration logged 'Typesense answered after 5s: {"ok":true}' then 24 tests passed — and the suite throws rather than skipping when nothing answers, so green proves the server was reached. The smoke step logged 'dist loads on node 20.20.2 / 22.23.2 / 24.20.0, 31 exports, DI metadata intact'. AC4 evidence: 'biome format src' was measured exiting 1 against a deliberately drifted file and 0 on the clean tree, and that command is a required step.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added .github/workflows/ci.yml: a hermetic 'check' job across Node 20/22/24 (install, build, typecheck, biome lint, biome format, unit tests, and a smoke step asserting the built CJS output loads with design:paramtypes intact) and an 'integration' job running the 24-test suite against Typesense 29.0 in Docker. Verified by run 34691871106, all four jobs green, with logs confirming the integration job reached a live server and the built package loaded on each Node version. CI caught two real defects on its first run: typecheck failing on any clean checkout because the integration test imports ../dist, and the Typesense service container exiting before binding its port.
<!-- SECTION:FINAL_SUMMARY:END -->
