---
id: TASK-011
title: Keep field types when a collection is resolved from a class or by name
status: To Do
assignee: []
created_date: '2026-09-10 21:40'
labels:
  - feature
  - dx
dependencies: []
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveCollection() and TypesenseCollections.get() both return the non-generic TypesenseCollection, so InferDocument collapses and client.search returns documents with no usable properties — callers need an 'as unknown as' cast. This makes the decorator API declare-only: you can register a @TypesenseSchema class but cannot query through it with types intact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveCollection preserves the field record of a decorated class
- [ ] #2 client.search accepts a decorated class directly, not just a resolved collection
- [ ] #3 TypesenseCollections.get is typed against the registered collections where possible
<!-- AC:END -->
