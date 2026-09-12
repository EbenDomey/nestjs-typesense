---
id: TASK-009
title: Consume the package from damsyn-ai-api
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
labels:
  - validation
dependencies: []
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Validate the API in a real application: define a collection, implement a Postgres-backed collector and run a reindex. This is the real test of whether the collector interface is ergonomic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a collection and collector exist in the consuming app
- [ ] #2 reindex and incremental sync both run against real data
<!-- AC:END -->
