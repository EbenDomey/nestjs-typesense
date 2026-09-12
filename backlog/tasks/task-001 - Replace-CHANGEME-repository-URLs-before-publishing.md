---
id: TASK-001
title: Replace CHANGEME repository URLs before publishing
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
labels:
  - release
  - blocker
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
package.json has placeholder GitHub URLs in repository, bugs and homepage. npm renders these on the package page, so they must point at the real personal repo before the first publish.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 repository.url, bugs.url and homepage point at the real GitHub repo
- [ ] #2 npm pack --dry-run shows no CHANGEME
<!-- AC:END -->
