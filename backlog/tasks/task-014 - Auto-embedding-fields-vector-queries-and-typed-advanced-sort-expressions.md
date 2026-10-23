---
id: TASK-014
title: 'Auto-embedding fields, vector queries and typed advanced sort expressions'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-23 22:30'
updated_date: '2026-10-23 22:49'
labels: []
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The DAMSYN API (nestjs-typesense ^0.2.0) needs Typesense 30.2 auto-embedding fields, similar-item vector queries and _eval / _text_match(buckets) / _vector_distance sorts, and currently reaches them through string casts in the consumer. The package should express them typed. Verified against Typesense 30.2: live embed fields come back with num_dim, hnsw_params, vec_dist and other server defaults; only one _eval per sort_by; weighted _eval scores by the FIRST matching clause (not sum, not max); max 3 sort fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 field.embedding and a TypesenseEmbedding decorator emit identical float[] fields with an embed block; from is type-checked against the collection's string/string[] fields
- [x] #2 InferDocument treats embedding fields as optional; the typed upsert API rejects documents carrying them
- [x] #3 A schema comparison helper treats a live embedding field (as returned by Typesense 30.2) as matching its declaration
- [x] #4 vectorQuery helper and typed vector_query on SearchParams, restricted to float[] fields; hits carry vector_distance
- [x] #5 sortEval, sortEvalWeighted, sortTextMatch and _vector_distance are accepted by sort_by without casts; compile rejects a second _eval or more than 3 sort fields with a clear error
- [x] #6 id is filterable through compileFilter, and merged multi-field clauses are pinned by a test
- [x] #7 Integration test against live Typesense 30.2 covers embedding create, similar-to-id vector query, weighted _eval and id exclusion
- [x] #8 README sections, CHANGELOG entry and a minor version bump
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. schema: TypesenseField gains optional embed/numDim; createEmbeddingField shared by field.embedding and @TypesenseEmbedding; toSchema emits embed + num_dim only when present so existing hashes are unchanged.
2. Types: embedding fields optional in InferDocument; WritableDocumentOf strips them (upsert + collector.transform). Validate `from` in defineCollection without constraining TFields (re-run the optional-literal guard).
3. diffSchema(collection, live): compare only declared properties, ignore server defaults; reconcile reuses it.
4. search: vectorQuery + typed vector_query; vector_distance on hits; sortEval / sortEvalWeighted / sortTextMatch / _vector_distance; runtime one-_eval + 3-field checks in compileSearchParams.
5. Tests: unit strings, type guards (verify each fires by reintroducing the bug), integration on live 30.2.
6. README, CHANGELOG, 0.3.0.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on Typesense 30.2 (brew, localhost:8108) before designing: live embed field adds num_dim 384, hnsw_params, vec_dist, infix, stem, store, truncate_len; embed.from on an int32 is a 400; weighted _eval scores by FIRST matching clause (verified against both sum and max); "Only one sorting eval expression is allowed."; "Only upto 3 sort fields are allowed."; first create downloads the 128 MB model (~43s).
Decisions: from-check is an intersection on the defineCollection parameter (EmbedSourceCheck), not a TFields constraint — optional-literal guards still pass. Embedding api_key excluded from the hash (rotation is not drift) and from diffSchema. WritableDocument returns the document type unchanged when there are no embedding fields, so existing upsert types are identical. sortEval infers its collection from the sort_by contextual return type via a covariant brand. Omit<SearchParams> loses that context (index signature) — documented; use Pick.
Verification: bun run typecheck clean; bun run lint clean; vitest 112 passed; npm run test:integration 56 passed on live 30.2; design:paramtypes present in 8 dist files (cjs+esm). Every new type guard was mutation-tested (bug reintroduced -> typecheck failed). 0.2.0 hash pinned (e12074aa0bdb62eb) and unchanged.
Release: version bumped to 0.3.0; merge/tag/npm publish pending owner action.

Released: nestjs-typesense@0.3.0 published to npm 2026-10-23 (dist-tag latest), tag v0.3.0 on main, CI green. Smoke-tested the published tarball: CJS require and ESM import both expose vectorQuery, sortEvalWeighted, diffSchema, TypesenseEmbedding.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added auto-embedding fields (field.embedding / @TypesenseEmbedding, from checked at compile time, write path refuses the computed vector), diffSchema tolerant of Typesense's server-filled keys, typed vectorQuery + vector_distance, and sortEval / sortEvalWeighted / sortTextMatch / _vector_distance with compile- and run-time enforcement of Typesense's one-_eval and three-field limits. Verified by typecheck, 112 unit tests, mutation-tested type guards, and 56 integration tests against live Typesense 30.2. README, CHANGELOG and 0.3.0 bump included.
<!-- SECTION:FINAL_SUMMARY:END -->
