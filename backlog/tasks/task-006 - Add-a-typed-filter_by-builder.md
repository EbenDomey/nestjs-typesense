---
id: TASK-006
title: Add a typed filter_by builder
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 13:04'
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
- [x] #1 field names are constrained to the collection's declared fields
- [x] #2 comparison values are checked against the field type
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Scope confirmed with the user: filter_by becomes an inline object predicate on the search params (no separate builder import), a raw string stays accepted as the escape hatch, and query_by/sort_by/facet_by become strict too — the README lists all four as one rough edge. Strictness is breaking, so this ships as 0.2.0.

1. Derive field names from DocumentOf<TSource>, not from the field record. DocumentOf already unifies both declaration styles, so one set of types covers defineCollection results and @TypesenseSchema classes without branching. It also means id is filterable, which is correct.

2. FilterFor<TValue> maps a field's VALUE type to its operator set: geopoint tuple first (a [number, number] is assignable to number[], so testing it late would swallow geopoints into the array branch), then arrays, then string/number/bool. Each accepts a bare value as shorthand.

3. compileFilter needs no schema at runtime. Worth noting because it is not obvious: eq on a string and has on a string[] both compile to field:=value, and eq-many and hasAny both compile to field:=[a,b], so the operator keys alone determine the output. That keeps the compiler decoupled from the collection.

4. String values are backtick-wrapped so commas and spaces cannot break out of the expression. Backticks inside a value are the open question — Typesense documents no escape for them — so the behaviour is decided from an integration test against a live server rather than guessed, and the test records what the server actually does.

5. query_by/sort_by/facet_by accept a field name or an array of them rather than a comma-separated string. Validating a CSV string needs the literal captured in a generic type parameter on search, which makes the signature and its error messages considerably worse. The array form is checked per element, autocompletes, and is joined internally. A CSV string will no longer compile — call that out in the PR and the README migration note.

6. Guard with type-level assertions in the existing Assert/@ts-expect-error style, and verify each fires by reintroducing the bug, per CLAUDE.md.

7. Integration-test the compiled filters against live Typesense — a filter that typechecks but that Typesense rejects is the failure mode that matters here.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design decisions worth recording, each with the reason it went the way it did.

1. Field names derive from DocumentOf<TSource>, not from the collection's field record. DocumentOf already unifies both declaration styles, so one set of types covers defineCollection results and @TypesenseSchema classes with no branching, and id comes along for free as a filterable field.

2. The geopoint branch in FilterFor must be tested BEFORE the array branch. A [number, number] is assignable to number[], so the obvious ordering silently offers has/hasAny on a coordinate pair. There is a dedicated guard for this and it was confirmed to fire by swapping the branches.

3. compileFilter needs no collection at runtime. eq on a string and has on a string[] both render field:=value; eq-with-many and hasAny both render field:=[a,b]. The operator keys alone determine the output, so the compiler stays decoupled.

4. No $not. Typesense has no general negation in filter_by, only per-field !=. Honouring $not would mean a De Morgan push-down onto the leaves, and match and has have no negated form at all — so it would either throw at runtime for expressions that typecheck, or quietly mean something else. Documented in the type and the README.

5. Backticks. All string values are wrapped, not just risky-looking ones, so a value containing a comma, space or && is data rather than syntax. A value CONTAINING a backtick is refused: Typesense documents no escape for one inside a quoted value, so no correct rendering exists. Throwing beats emitting a filter that means something else.

6. query_by/sort_by/facet_by take a field name or an array, not a CSV string. Validating a CSV requires capturing the literal in a generic type parameter on search, which degrades the signature and much more so the error messages. This is the breaking part of 0.2.0; the README documents the migration and the FieldSelection cast for dynamically built lists.

Guard verification per CLAUDE.md, each confirmed to fire by reintroducing the bug:
- SearchFieldName widened to string: 47 errors.
- FilterFor collapsed to unknown: 8 errors, all unused-@ts-expect-error.
- Geopoint branch moved after the array branch: the geo-specific guard failed, exactly the assertion written for it.

The live integration suite is the other half. Unit tests pin the compiled string; the 10 integration tests assert WHICH DOCUMENTS come back for every operator against a real server, because the failure that matters is a filter that typechecks, compiles to a plausible string, and is rejected or silently matches nothing. Includes the $or grouping regression (asserting the un-parenthesised form would return an extra document) and values containing && and commas.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
filter_by now accepts a typed object predicate on the search params, and query_by/sort_by/facet_by are constrained to the collection's declared fields. Raw filter strings still work as the escape hatch.

Operators are selected from each field's TypeScript value type, so a string field offers no range comparisons, has/hasAny/hasAll appear only on arrays, and a geopoint offers near/within. Both declaration styles are covered by the same types because field names come from DocumentOf.

Verified: 50 unit tests (14 pinning the compiled string, 11 type-level) and 36 integration tests against live Typesense 29, of which 10 assert which documents each operator actually returns — the failure mode types cannot catch. Three type guards were each confirmed to fire by reintroducing the bug. Packed the tarball and typechecked a fresh external consumer where all 8 negative cases error and the positive cases compile.

Breaking: query_by/sort_by/facet_by no longer take a comma-separated string. Version bumped to 0.2.0 and the README carries an upgrade note.
<!-- SECTION:FINAL_SUMMARY:END -->
