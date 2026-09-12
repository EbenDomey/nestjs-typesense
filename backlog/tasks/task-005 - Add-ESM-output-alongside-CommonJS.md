---
id: TASK-005
title: Add ESM output alongside CommonJS
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
labels:
  - build
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v0.1.0 ships CJS only. Adding ESM is non-breaking. Must keep using tsc rather than esbuild: esbuild drops emitDecoratorMetadata, which NestJS constructor injection depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package exposes an exports map with require and import conditions
- [ ] #2 design:paramtypes still present in both outputs
<!-- AC:END -->
