---
id: TASK-006
title: Add a typed filter_by builder
status: To Do
assignee: []
created_date: '2026-09-09 13:29'
labels:
  - feature
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
filter_by is currently a raw string, so field names and operators are unchecked. A builder driven by the collection definition would catch typos and wrong-typed comparisons at compile time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 field names are constrained to the collection's declared fields
- [ ] #2 comparison values are checked against the field type
<!-- AC:END -->
