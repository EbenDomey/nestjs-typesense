---
id: TASK-007
title: Add multi-search support
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 21:18'
labels:
  - feature
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Typesense multi_search issues several queries in one round trip. Worth exposing with per-query result typing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 results are typed per query rather than as a union
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Built on TASK-006's typed SearchParams, so this branches off that one rather than main.

1. MultiSearchQueries<TSources> is written as a mapped type over a tuple type parameter, not as an array of a union. That is what makes TypeScript infer each element's collection separately and keeps the results positional; an array signature collapses every slot to one union of every document type in the batch, which is exactly what AC1 rules out.
2. Extract SearchResult and the response normalisation out of the client into search/result.ts. multi-search.ts needs SearchResult and the client needs multi-search's types, so leaving it in the client would be a cycle.
3. Surface per-query failures. Typesense answers 200 for multi_search and reports a failed query INSIDE its slot, so the natural implementation reports a broken query as found: 0 — indistinguishable from one that legitimately matched nothing. toSearchResult throws, naming the collection.
4. Guard AC1 with Equals assertions per slot and verify the guard fires by collapsing the tuple to a union.
5. Integration-test against the live server: order preservation, per-query filters and sorting, the single-query case, and the failed-query path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The inference is the whole feature, so it is what the guard targets. MultiSearchQueries is a mapped type over the tuple parameter (readonly [...{ [I in keyof TSources]: MultiSearchQuery<TSources[I]> }]) rather than MultiSearchQuery<...>[]; the array form typechecks fine and silently unions every slot.

Verified by reintroducing the collapse — replacing the mapped result type with SearchResult<DocumentOf<TSources[number]>>[] produced: all three per-slot Equals assertions failing, the destructured elements becoming possibly-undefined, and document.title failing to resolve because the union has no such property. Restored, clean.

Typesense answering 200 for a failed sub-query is confirmed behaviour, not a defensive guess: the integration test searches a collection that does not exist alongside a valid one and the call rejects naming it. Without the explicit error check that query would have returned found: 0.

Also moved SearchResult into search/result.ts. multi-search.ts needs it and the client needs multi-search's types, so keeping it in the client would have been an import cycle. The barrel still exports SearchResult, so this is not a breaking change for consumers.

Shipped in nestjs-typesense@0.2.0, published to npm 2026-09-12 (tag v0.2.0, commit f63a125, shasum 55b8673777ff0f2a633ecf26bf8d1a442ccd9c7a). Verified after publish by installing 0.2.0 from the registry into a clean consumer: both module conditions resolve to their own build, design:paramtypes intact in each, injection tokens shared, and the typed filter/geopoint/multiSearch/health surface exercised rather than only checked for presence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added client.multiSearch, which issues several queries in one round trip and returns results positionally, each typed to its own collection.

The typing rests on MultiSearchQueries being a mapped type over a tuple type parameter rather than an array of a union — the array form compiles but collapses every slot to a union of every document type in the batch. Verified by reintroducing that collapse: all three per-slot Equals assertions failed and document.title stopped resolving.

Per-query failures are surfaced rather than swallowed. Typesense answers 200 for multi_search and reports a failed query inside its slot, so the obvious implementation reports it as found: 0. Confirmed against the live server by searching a nonexistent collection alongside a valid one — the call rejects naming it.

Verified: 52 unit tests and 40 integration tests against live Typesense 29 (4 new: query order, per-query filters and sorting, the single-query case, the failure path), tsc --noEmit clean, biome clean, and an external consumer typechecking multiSearch off the packed tarball with the mismatched-field case correctly erroring.
<!-- SECTION:FINAL_SUMMARY:END -->
