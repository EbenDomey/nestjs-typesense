---
id: TASK-012
title: 'Add husky git hooks: staged check on commit, full check on push'
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-12 12:03'
updated_date: '2026-09-12 12:04'
labels:
  - infra
dependencies: []
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Local git hooks that gate code before it leaves the machine, mirroring the GitHub Actions checks so a push that passes locally does not come back red. pre-commit stays fast by checking only staged files; pre-push runs the same hermetic pipeline as the CI check job. The integration suite is deliberately excluded from pre-push because it throws rather than skips when no Typesense answers, which would block every push made while the local server is down.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 husky is a devDependency and prepare installs the hooks without breaking installs where devDependencies are absent
- [x] #2 pre-commit blocks a commit whose staged src file fails biome, and allows commits touching only non-src files
- [x] #3 pre-push runs build, typecheck, lint, format and unit tests, and blocks the push when any fails
- [x] #4 CI does not attempt to install hooks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
husky 9.1.7 added as a devDependency; prepare is 'husky || true' so installing this package from a git URL, where devDependencies are absent, does not fail on a missing binary. CI sets HUSKY=0 at the workflow level.

pre-commit runs 'biome check --staged --no-errors-on-unmatched'. --staged required adding a vcs block to biome.jsonc. --no-errors-on-unmatched was not optional: biome's files.includes is src/**/*.ts, so a commit touching only docs, workflows or backlog files matches nothing and biome exits 1, blocking a good commit. Found by testing the hook rather than by reading it — the husky commit itself was exactly that case, 6 files with none under src.

pre-push mirrors the CI check job: build, typecheck, lint, format, unit tests. Build precedes typecheck because the integration test imports ../dist by design. Integration tests excluded on purpose; the suite throws rather than skips with no server, so it would block pushes whenever local Typesense is down.

No lint-staged dependency: biome 2.x supports --staged natively.

Verification, measured exit codes rather than inspection. pre-commit: 0 with only non-src staged, 0 with nothing staged, 1 with a badly formatted src file staged, 0 once formatted. pre-push: 0 on a clean tree, 2 with a deliberate type error. Both hooks then fired for real on commit 3595f75 — the commit was accepted and the push printed all five pre-push stages ending 'pre-push: ok'. A negative commit attempt earlier was blocked with 'husky - pre-commit script failed (code 1)' and HEAD did not move. CI run 34692421565 green on all four jobs with HUSKY=0 set.

Also documented in the README's new Contributing section, which ships in the npm tarball.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added husky 9.1.7 with two hooks: pre-commit runs biome against staged files only (sub-second), pre-push runs the hermetic CI pipeline (build, typecheck, lint, format, unit tests). No lint-staged needed since biome 2.x supports --staged natively, which required a vcs block in biome.jsonc. Verified by measuring hook exit codes across the matrix of cases and by observing both hooks fire on a real commit and push; CI stays green with HUSKY=0. Testing surfaced a bug that inspection would have missed: biome exits 1 when no staged file matches its includes, so any docs-only commit would have been blocked until --no-errors-on-unmatched was added. Documented in the README's Contributing section.
<!-- SECTION:FINAL_SUMMARY:END -->
