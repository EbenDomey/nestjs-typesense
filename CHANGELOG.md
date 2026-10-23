# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semver](https://semver.org/) (pre-1.0: a minor bump may change types).

## [0.3.0] - 2026-10-23

Verified against Typesense 30.2.

### Added

- **Auto-embedding fields.** `field.embedding({ from, model, ... })` and the
  `@TypesenseEmbedding` decorator emit a `float[]` field with an `embed` block. Both produce
  identical field objects and hashes. `from` is checked at compile time against the
  collection's `string` / `string[]` fields. Optional `apiKey`, `url`, `indexingPrefix`,
  `queryPrefix` and `numDim` are supported. None are required for `ts/` models.
- `InferDocument` types embedding fields as optional `TypesenseEmbeddingVector`. The new
  `WritableDocument` / `WritableDocumentOf` types strip them, so `client.upsert` and
  `TypesenseCollector.transform` neither require nor accept a computed embedding.
- **`diffSchema(collection, live)`** compares a declaration with
  `collections(name).retrieve()`, property by property. It ignores keys the server fills in
  (`num_dim`, `hnsw_params`, `vec_dist`, ...), so a live embedding field matches its
  declaration. It returns `{ added, removed, changed, inSync }`.
- **`vectorQuery(field, { id | vector, k, distanceThreshold, alpha, ef, flatSearchCutoff })`**
  and a typed `vector_query` on `SearchParams`, restricted to the collection's `float[]`
  fields. Hits carry `vector_distance`.
- **Sort builders.** `sortEval(filter, dir)`, `sortEvalWeighted([{ filter, score }], dir)`
  and `sortTextMatch({ buckets } | { bucketSize }, dir)`, plus `_vector_distance:asc|desc`
  in `SortExpression`. `_eval` filters are typed filters, and the collection is inferred from
  the surrounding `sort_by`.
- `sort_by` rejects a second `_eval` or a fourth expression: at compile time for literals,
  and at runtime (quoting Typesense's limit) for lists built dynamically.

### Changed

- `SortSelection` is a tuple of at most three expressions with at most one `_eval`. A
  `sort_by` held in a `SortExpression[]` variable must become a tuple or be cast.
- `client.upsert` and `TypesenseCollector.transform` take `WritableDocumentOf<TSource>`.
  This is identical to `DocumentOf<TSource>` for collections without embedding fields.
- The bootstrap migrator computes drift with `diffSchema`. Its behaviour is unchanged: it
  still acts only on added and removed fields.
- `docker-compose.yml` runs Typesense 30.2.

### Unchanged on purpose

- Schema hashes of existing collections. `toSchema` emits `embed` / `num_dim` only on
  embedding fields, and a test pins a 0.2.0 hash. Embedding API keys are excluded from the
  hash, so rotating one does not change it.

## [0.2.0]

- Typed `filter_by` (`compileFilter`), and `query_by` / `sort_by` / `facet_by` checked
  against the collection, multi-search, geopoint helpers, a health indicator, document
  types kept through both declaration styles, and ESM output alongside CommonJS.
