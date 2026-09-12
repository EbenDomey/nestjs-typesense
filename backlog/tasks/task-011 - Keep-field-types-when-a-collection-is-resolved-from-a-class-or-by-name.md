---
id: TASK-011
title: Keep field types when a collection is resolved from a class or by name
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-10 21:40'
updated_date: '2026-09-12 12:40'
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
- [x] #1 resolveCollection preserves the field record of a decorated class
- [x] #2 client.search accepts a decorated class directly, not just a resolved collection
- [x] #3 TypesenseCollections.get is typed against the registered collections where possible
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Key observation: for a @TypesenseSchema class there is no field record at the type level — property decorators write to reflect-metadata at runtime, not into the class's type. The type-level source of truth for that style is the class instance type itself, which is what the README already claims ('the class is the document type'). So the fix is not to recover a field record from a class, but to resolve the document type per declaration style.

1. Add DocumentOf<TSource> in decorators.ts: for a TypesenseCollection it is InferDocument<TSource>; for an abstract constructor it is { id: string } & InstanceType. Order matters — the TypesenseCollection branch must be tested first.
2. Give resolveCollection overloads so TypesenseCollection<TFields> in returns TypesenseCollection<TFields> out rather than collapsing to the default TypesenseFieldRecord (AC1).
3. Widen client.search, upsert and delete from TCollection extends TypesenseCollection to TSource extends TypesenseCollectionSource, returning SearchResult<DocumentOf<TSource>>, and call resolveCollection internally so a decorated class can be passed directly (AC2). client.ts gains an import from decorators.ts; verify no import cycle, decorators does not import client.
4. Overload TypesenseCollections.get so passing a collection or decorated class returns the registered instance with its field types intact, keeping the string form for the loose case (AC3).
5. Guard with type-level assertions in the existing style: Assert<T extends true>, plus @ts-expect-error for the negative cases. Per CLAUDE.md, verify each guard fires by reintroducing the bug and confirming tsc fails — a vacuous guard is worse than none.
6. Confirm the existing 'as unknown as' cast in the integration test is no longer needed, and drop it. Update the README's known-rough-edges entry.
7. Run typecheck, unit and integration suites; typecheck separately since vitest does not typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1 needed a reinterpretation, recorded here rather than silently: a @TypesenseSchema class has no field record at the type level and cannot be given one. Property decorators write the field map to reflect-metadata at runtime, which TypeScript cannot see, so there is nothing for resolveCollection to preserve on that path. What was preserved instead:

- For a defineCollection result, resolveCollection now genuinely keeps the field record — it was erasing it to the TypesenseFieldRecord default, which is the bug the description names.
- For a decorated class, the class instance type is the document type (already the README's claim), carried by a new exported DocumentOf<TSource>. So the outcome the description asks for — querying through the decorator style with types intact — holds, by a different mechanism.

Also fixed on the way, both consistency gaps the change exposed:
- RegisterTypesenseCollector rejected a decorated class. Worse, had it been accepted it would have read Function.name — the class name, not the collection name. It now resolves the source.
- TypesenseIndexer.reindex/sync only took a collection or a name, so the decorator style could not be indexed without a magic string.
- TypesenseCollector<T> now accepts either declaration style, so transform() is typed against a class.

Guard verification, per CLAUDE.md's 'a guard that passes vacuously is worse than none'. Each was confirmed to fire by reintroducing the bug and checking tsc failed:
1. resolveCollection overloads removed -> 2 errors in decorators.test.ts (Assert false + unused ts-expect-error).
2. DocumentOf class branch weakened to Partial -> 3 errors across client and decorators tests.
3. client.search narrowed back to TypesenseCollection -> 3 errors in typesense.client.test.ts.
4. TypesenseCollections.get overloads removed -> initially passed VACUOUSLY. The first version of the guard only read .title off the result, which still compiles against the widened record. Replaced with an invariant Equals assertion plus an explicitly annotated 'const title: string' in the integration test; both then failed as intended.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
resolveCollection, client.search/upsert/delete, TypesenseCollections.get, TypesenseIndexer.reindex/sync, RegisterTypesenseCollector and TypesenseCollector all now accept either declaration style and keep the document type.

The mechanism is a new exported DocumentOf<TSource>: InferDocument for a defineCollection result, { id: string } & instance type for a @TypesenseSchema class — a class has no field record at the type level, so the instance type is the only thing that can carry it. resolveCollection and TypesenseCollections.get gained overloads so a collection survives the round trip with its field record rather than collapsing to the TypesenseFieldRecord default.

Verified: 25 unit tests and 26 integration tests against a live Typesense 29 pass, tsc --noEmit clean, biome lint and format clean, design:paramtypes still emitted for all three DI classes. Each of the four compile-time guards was confirmed to fire by reintroducing the bug — one of them passed vacuously on the first attempt and was rewritten. The packed tarball was typechecked from a fresh external consumer under both TypeScript 5.9 and 7.0, exercising all three acceptance criteria plus the indexer and collector paths. The 'as unknown as' cast the integration test needed for the class path is gone, and the README rough edge is removed.
<!-- SECTION:FINAL_SUMMARY:END -->
