---
id: TASK-003
title: 'Add CI: typecheck, lint, test, build'
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
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
<!-- AC:END -->
