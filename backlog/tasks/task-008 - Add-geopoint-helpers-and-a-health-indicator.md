---
id: TASK-008
title: Add geopoint helpers and a health indicator
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
labels:
  - feature
dependencies: []
priority: low
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two small conveniences: createGeopoint/parseGeopoint transformers, and a @nestjs/terminus health indicator that reports cluster reachability.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 geopoint helpers round-trip lat/lng
- [ ] #2 health indicator is optional and does not force a terminus dependency
<!-- AC:END -->
