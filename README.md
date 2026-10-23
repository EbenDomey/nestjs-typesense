# nestjs-typesense

An unofficial NestJS module for [Typesense](https://typesense.org): typed collection schemas,
declarative collection migrations, and **database-agnostic** index syncing.

> Not affiliated with or endorsed by Typesense Inc. "Typesense" is their trademark.

## Why

The existing NestJS integrations either sync from MongoDB change streams — unusable if your
data lives anywhere else — or pull an opinionated pagination and error envelope into your API
responses. This module does neither. Indexing is expressed as ordinary queries against your own
store, and nothing about your HTTP contract is dictated.

## Install

```bash
npm i nestjs-typesense typesense
```

Peer dependencies: `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `typesense`.

## Define a collection

Field declarations drive both the Typesense schema and the TypeScript document type.

```ts
import { defineCollection, field } from 'nestjs-typesense'

export const videoCollection = defineCollection({
  name: 'videos',
  fields: {
    title: field.string(),
    description: field.string({ optional: true }),
    durationMs: field.int32({ sort: true }),
    tags: field.stringArray({ facet: true }),
    thumbnailUrl: field.string({ index: false, optional: true }),
  },
  defaultSortingField: 'durationMs',
})
```

`InferDocument` gives you the document type, with `id` always present and `optional` fields
genuinely optional:

```ts
import type { InferDocument } from 'nestjs-typesense'

type VideoDocument = InferDocument<typeof videoCollection>
// { id: string; title: string; durationMs: number; tags: string[]
//   description?: string; thumbnailUrl?: string }
```

### Or declare it with decorators

If you prefer the `@nestjs/mongoose` style, decorate a class instead. The class *is* the
document type, so there is no `InferDocument` step:

```ts
import {
  TypesenseArray,
  TypesenseInt32,
  TypesenseSchema,
  TypesenseString,
} from 'nestjs-typesense'

@TypesenseSchema({ name: 'videos', defaultSortingField: 'durationMs' })
export class VideoDocument {
  @TypesenseString() title!: string
  @TypesenseString({ optional: true }) description?: string
  @TypesenseInt32({ sort: true }) durationMs!: number
  @TypesenseArray({ type: 'string', facet: true }) tags!: string[]
  @TypesenseString({ index: false, optional: true }) thumbnailUrl?: string
}
```

Both forms produce the same collection, schema hash included, and either can be passed
wherever a collection is expected.

Unlike `@nestjs/mongoose`'s `@Prop()`, these decorators check the field against the property
they annotate. Every one of these fails to compile:

```ts
@TypesenseInt32() title!: string                     // int32 on a string property
@TypesenseString() thumbnailUrl?: string             // required field, optional property
@TypesenseArray({ type: 'string' }) tags!: number[]  // element type disagrees
@TypesenseArray({ type: 'string' }) tags!: string    // not an array at all
@TypesenseArray({ type: 'typo' }) tags!: string[]    // not a field type
```

There is one decorator per scalar type — `TypesenseString`, `TypesenseInt32`,
`TypesenseInt64`, `TypesenseFloat`, `TypesenseBool`, `TypesenseGeopoint`, `TypesenseObject`
and `TypesenseAuto` — plus `TypesenseArray({ type })` covering all seven array types, and
`TypesenseProp({ type })` if you would rather name the type explicitly.

Modifiers stay inside the options object rather than stacking as separate decorators the way
`class-validator` does with `@IsOptional()`. That is deliberate: `optional` has to travel in
the same call as the type for TypeScript to check them against each other, and a stacked
modifier is checked independently, so the type decorator could never see it.

Fields declared on a base class are collected as well, so shared audit columns can live in
one place. `id` is always implicit — declare `id: string` on the class if you want it in the
document type and it will not be emitted twice.

### Which style to use

Both produce the same collection and are interchangeable everywhere downstream, so this is
purely about how you like to declare things — with one hard constraint:

|                                        | `defineCollection` | `@TypesenseSchema` |
| -------------------------------------- | ------------------ | ------------------ |
| TypeScript                             | yes                | yes                |
| Plain JavaScript                       | yes                | no — decorator syntax needs a transpiler |
| Requires `experimentalDecorators`      | no                 | yes                |
| Document type                          | `InferDocument<typeof collection>` | the class itself |
| Doubles as a DTO (`class-validator`, Swagger) | no          | yes                |

NestJS projects already enable `experimentalDecorators` and `emitDecoratorMetadata`, so both
styles work there without any config change. Reach for `defineCollection` if you are consuming
this from plain JavaScript, from a non-Nest TypeScript project, or if you would rather keep
schemas as plain data.

The package ships both CommonJS and ESM, so `require('nestjs-typesense')` and
`import ... from 'nestjs-typesense'` both work as-is, each with its own type declarations.

## Auto-embedding fields

Typesense can compute a vector for each document from its text fields
([auto-embedding](https://typesense.org/docs/30.2/api/vector-search.html)). Declare one with
`field.embedding`:

```ts
export const productCollection = defineCollection({
  name: 'products',
  fields: {
    title: field.string(),
    categoryNames: field.stringArray({ facet: true }),
    tagNames: field.stringArray({ optional: true }),
    optionValues: field.stringArray({ optional: true }),
    categoryPathIds: field.stringArray({ facet: true }),
    minPriceMinor: field.int64(),
    popularity: field.int32(),
    embedding: field.embedding({
      from: ['title', 'categoryNames', 'tagNames', 'optionValues'],
      model: 'ts/all-MiniLM-L12-v2',
    }),
  },
})
```

That emits

```json
{ "name": "embedding", "type": "float[]", "index": true, "optional": false, "facet": false,
  "embed": { "from": ["title", "categoryNames", "tagNames", "optionValues"],
             "model_config": { "model_name": "ts/all-MiniLM-L12-v2" } } }
```

- **`from` is checked.** Each entry must be a `string` or `string[]` field of the same
  collection, so a typo or a numeric field is a compile error on the `defineCollection` call:
  `embedding "from" names "priceMinor", which is not a string or string[] field of this collection`.
- **The embedding is read-only.** `InferDocument` types it as optional — a search hit may
  carry it — but `client.upsert` and a collector's `transform` neither require nor accept it,
  since Typesense computes it on every write.
- **Remote models** take the rest of `model_config`: `apiKey`, `url`, `indexingPrefix`,
  `queryPrefix`, plus `numDim`. None are needed for the built-in `ts/` models. `apiKey` is
  sent to Typesense but left out of the schema hash, so rotating it is not schema drift.
- Pass `optional: true` if a document can be missing *every* `from` field.

With decorators, use `@TypesenseEmbedding` and type the property `TypesenseEmbeddingVector`.
That brand is what lets the write path refuse it. The field and its hash are identical to
`field.embedding`:

```ts
@TypesenseEmbedding({ from: ['title', 'categoryNames'], model: 'ts/all-MiniLM-L12-v2' })
embedding?: TypesenseEmbeddingVector
```

The first collection created with a `ts/` model makes Typesense download it (about 130 MB).
`collections().create()` blocks until that finishes, which took about 45 s here and can take
minutes. Raise `connectionTimeoutSeconds` for that first create, or it times out client-side
while the server keeps going.

## Register the module

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypesenseModule } from 'nestjs-typesense'
import { videoCollection } from './search/video.collection.js'

@Module({
  imports: [
    TypesenseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        nodes: [{ host: config.getOrThrow('TYPESENSE_HOST'), port: 8108, protocol: 'http' }],
        apiKey: config.getOrThrow('TYPESENSE_API_KEY'),
        connectionTimeoutSeconds: 5,
        collections: [videoCollection],
        migrations: 'alter',
      }),
    }),
  ],
})
export class AppModule {}
```

`collections` accepts either declaration style — `defineCollection()` results,
`@TypesenseSchema()` classes, or a mix of both.

### Migration strategies

At bootstrap the module compares each declared collection against the live cluster.

| Strategy   | Behaviour |
| ---------- | --------- |
| `off`      | Never touches the cluster. |
| `create`   | Creates missing collections; logs a warning on drift. **Default.** |
| `alter`    | Also adds new fields and drops removed ones in place. |
| `recreate` | Drops and rebuilds on drift. **Destroys documents** — pair with a reindex. |

Start on `create`, move to `alter` once you trust it. Every collection also carries a stable
`hash` of its schema, computed independently of field declaration order.

One Typesense constraint leaks through `alter`: a **required** field cannot be added to a
collection that already holds documents, since the existing rows would have no value for
it. Rather than failing the bootstrap, the module logs a warning naming the field and
leaves the collection alone. Declare the field `optional: true`, or use `recreate` and
reindex.

### Comparing with the live schema

If you version collections yourself (create `products_v7`, reindex, swap an alias), use
`diffSchema` to decide whether the live collection still matches the declaration:

```ts
const live = await typesense.raw.collections('products').retrieve()
const diff = diffSchema(productCollection, live)
// { added, removed, changed: [{ name, mismatches: [{ property, declared, live }] }], inSync }
```

It compares only what the declaration states. Typesense fills in the rest, and that is not
drift. An embedding field comes back with the `num_dim` its model implies, plus
`hnsw_params`, `vec_dist`, `store`, `stem` and more, so a deep-equal would report every
embedding collection as drifted on every check. `num_dim` and `sort` are compared only when
you declare them, and the embedding `api_key` is never compared. The bootstrap migrator
uses the same diff, but acts only on added and removed fields.

## Sync from Postgres (or anything else)

Implement a collector. There are no change streams — each method is just a query.

```ts
import { RegisterTypesenseCollector, type TypesenseCollector, type InferDocument } from 'nestjs-typesense'
import { videoCollection } from './video.collection.js'

const BATCH = 500

@RegisterTypesenseCollector(videoCollection)
export class VideoCollector implements TypesenseCollector<typeof videoCollection> {
  constructor(private readonly repo: Repository<Video>) {}

  transform(videos: Video[]): InferDocument<typeof videoCollection>[] {
    return videos.map((v) => ({
      id: v.id,
      title: v.title,
      durationMs: v.durationMs,
      tags: v.tags,
    }))
  }

  async *fetchAll(ids?: string[]) {
    for (let skip = 0; ; skip += BATCH) {
      const batch = await this.repo.find({
        where: ids ? { id: In(ids) } : {},
        order: { id: 'ASC' },
        take: BATCH,
        skip,
      })
      if (batch.length === 0) return
      yield batch
    }
  }

  async *fetchChanged(since: Date) {
    yield await this.repo.find({ where: { updatedAt: MoreThan(since) } })
  }

  async *fetchRemoved(since: Date) {
    const rows = await this.repo.find({ where: { deletedAt: MoreThan(since) }, withDeleted: true })
    yield rows.map((r) => r.id)
  }
}
```

Register it as an ordinary provider — `@RegisterTypesenseCollector` applies `@Injectable()` for you.

With the decorator style it is `@RegisterTypesenseCollector(VideoDocument)` and
`implements TypesenseCollector<typeof VideoDocument>`; a bare collection name also works if
you would rather not import the declaration.

Then drive it from a cron job or CLI command:

```ts
constructor(private readonly indexer: TypesenseIndexer) {}

await this.indexer.reindex(videoCollection)              // full rebuild
await this.indexer.sync(videoCollection, lastRunAt)      // incremental
await this.indexer.syncAll(lastRunAt)                    // every collection with a collector
```

## Search

```ts
constructor(private readonly typesense: TypesenseClient) {}

const results = await this.typesense.search(videoCollection, {
  q: 'mountain sunset',
  query_by: ['title', 'description'],
  filter_by: { durationMs: { lt: 60_000 }, tags: { has: 'nature' } },
  sort_by: 'durationMs:desc',
  per_page: 20,
})

results.hits[0].document.title // typed as string
```

Field names are checked against the collection, and filter values against the field's
declared type. All of these fail to compile:

```ts
query_by: ['titel']                      // no such field
sort_by: 'duration:desc'                 // no such field
filter_by: { duratonMs: { lt: 1 } }      // no such field
filter_by: { durationMs: { lt: '1' } }   // int32 wants a number
filter_by: { title: { gt: 'a' } }        // no range operators on a string
filter_by: { title: { has: 'a' } }       // `has` is for arrays
```

### Filter expressions

Entries are ANDed. A bare value means equality, and a bare array means any-of:

```ts
filter_by: { channel: 'pets', published: true }      // channel:=`pets` && published:=true
filter_by: { channel: ['pets', 'diy'] }              // channel:=[`pets`,`diy`]
```

| Field type | Operators |
| ---------- | --------- |
| `string` | `eq` `ne` `match` |
| `int32` `int64` `float` | `eq` `ne` `gt` `gte` `lt` `lte` `between` |
| `bool` | `eq` `ne` |
| arrays | `has` `hasAny` `hasAll` `ne` |
| `geopoint` | `near` `within` |

```ts
filter_by: {
  durationMs: { between: [60_000, 600_000] },
  tags: { hasAll: ['music', 'live'] },
  location: { near: { lat: 48.8584, lng: 2.2945, radius: 5, unit: 'km' } },
  $or: [{ channel: 'pets' }, { rating: { gte: 4.5 } }],
}
```

`undefined` values are dropped, so an optional query parameter needs no branching:

```ts
filter_by: { channel: req.query.channel, published: true }
```

String values are backtick-wrapped, so a value containing `,`, a space or `&&` is treated
as data rather than filter syntax. A value containing a backtick is **refused** with an
error: Typesense documents no way to escape one inside a quoted value, so there is no
string that means what you asked for.

There is deliberately no `$not`. Typesense has no general negation in `filter_by` — only
the per-field `!=`, which is what `ne` compiles to.

A raw string is still accepted for anything the builder does not cover:

```ts
filter_by: 'durationMs:>60000 && tags:=[`music`]'
```

A decorated class can be passed in the same place, and the class *is* the document type:

```ts
const results = await this.typesense.search(VideoDocument, { q: 'mountain', query_by: 'title' })

results.hits[0].document.title // typed as string
```

`results` is a plain `{ found, page, hits, facets }` — shape your own API response from it.
For anything not covered, `typesense.raw` is the official client.

### Similar items (vector queries)

`vectorQuery` builds the `vector_query` string. The field must be a `float[]` or embedding
field of the collection, or it does not compile:

```ts
const similar = await this.typesense.search(productCollection, {
  q: '*',
  query_by: 'title',
  vector_query: vectorQuery('embedding', { id: product.id, k: 24, distanceThreshold: 0.6 }),
  // => embedding:([], id: <id>, k: 24, distance_threshold: 0.6)
  filter_by: { id: { ne: [product.id, ...alreadyShown] } },
  sort_by: '_vector_distance:asc',
  exclude_fields: 'embedding',
})

similar.hits[0].vector_distance // number
```

Pass `{ vector: [0.1, ...] }` instead of `id` to search with your own vector, or neither
to tune a hybrid search (`q` plus the embedding in `query_by`). `alpha`, `ef` and
`flatSearchCutoff` are also accepted. An `id` containing `,`, `(`, `)`, `[`, `]` or
whitespace is refused: Typesense reads it unquoted, so there is no safe way to send it.

### Advanced sorting

`sort_by` takes up to three expressions. Besides `field:dir`, these build the rest without
casts:

| Builder | Emits |
| ------- | ----- |
| `sortEval(filter, 'desc')` | `_eval(<filter>):desc` |
| `sortEvalWeighted([{ filter, score }, ...], 'desc')` | `_eval([ (<filter>):3, (<filter>):2 ]):desc` |
| `sortTextMatch({ buckets: 10 }, 'desc')` | `_text_match(buckets: 10):desc` |
| `'_vector_distance:asc'` (a literal) | itself |

The filters are ordinary typed filters, compiled with `compileFilter`. Inside `sort_by`
the collection is inferred from the search, so a misspelled field is a compile error with
no type argument. Built anywhere else, name it: `sortEval<typeof productCollection>(...)`.
A variable typed with `Omit<SearchParams<…>, …>` loses that context too, because the
pass-through index signature swallows the named keys. Use `Pick` instead.

A "For you" ranking, say: the shopper's preferred categories, with matches inside their
usual price band ranked above matches outside it:

```ts
const tiers = preferredCategoryIds.flatMap((categoryId, rank) => {
  const base = (preferredCategoryIds.length - rank) * 2
  return [
    {
      filter: { categoryPathIds: { hasAny: [categoryId] }, minPriceMinor: { between: band } },
      score: base + 1,
    },
    { filter: { categoryPathIds: { hasAny: [categoryId] } }, score: base },
  ]
})

await this.typesense.search(productCollection, {
  q: '*',
  query_by: 'title',
  sort_by: [sortEvalWeighted(tiers, 'desc'), 'popularity:desc', 'publishedAt:desc'],
})
// _eval([ (categoryPathIds:=[`c1`] && minPriceMinor:[1000..5000]):5, (categoryPathIds:=[`c1`]):4, ... ]):desc
```

Two Typesense rules, both measured against 30.2 and asserted in the integration suite:

- **A document scores by the first clause it matches**, not the sum or the maximum. Put
  the most specific clause first. Above, the price-banded clause must come before its
  category-only one, or the category clause matches first and the band never counts.
- **One `_eval` per `sort_by`.** Typesense rejects a second one ("Only one sorting eval
  expression is allowed"), so fold every tier into one `sortEvalWeighted`.

A literal `sort_by` that breaks either limit (a second `_eval`, or a fourth expression)
fails to compile. A list assembled at runtime is checked again before sending, with an
error that quotes Typesense's limit.

### Several queries in one round trip

```ts
const [videos, channels] = await this.typesense.multiSearch([
  { collection: videoCollection, q: 'dune', query_by: 'title', filter_by: { published: true } },
  { collection: ChannelDocument, q: 'dune', query_by: 'handle', sort_by: 'subscribers:desc' },
])

videos.hits[0].document.title      // typed as string
channels.hits[0].document.handle   // typed as string
```

Results come back **positionally**, each typed to its own collection rather than as a union
of every document type in the batch, and each query carries its own filters and sorting.

Typesense answers `200` even when an individual query fails, reporting the failure in that
query's slot — which would otherwise look like a search that matched nothing. `multiSearch`
throws instead, naming the collection.

`search`, `upsert` and `delete` all accept either declaration style, as do
`TypesenseIndexer`'s methods and `TypesenseCollections.get()`. Looking a collection up by
the declaration rather than by its name keeps the field types:

```ts
collections.get(videoCollection) // TypesenseCollection<…fields>, search stays typed
collections.get('videos')        // TypesenseCollection, documents come back loose
```

## Geopoints

Typesense stores a geopoint as a positional `[lat, lng]` tuple, which is easy to transpose
silently — a swapped pair is still a valid tuple, and only shows up later as matches from
the wrong hemisphere. These give the ends names and range-check both:

```ts
import { createGeopoint, parseGeopoint, isGeopoint } from 'nestjs-typesense'

const location = createGeopoint(48.8584, 2.2945)   // [48.8584, 2.2945]
const { lat, lng } = parseGeopoint(location)

createGeopoint(151.2093, -33.8688)  // throws: latitude 151.2093 is outside -90..90
isGeopoint(row.coords)              // narrows an unknown value
```

The range check catches a transposition whenever the latitude ends up past 90, which covers
most populated longitudes.

## Health check

`TypesenseHealthIndicator` reports whether the cluster is reachable. It is an ordinary
provider exported by the module, so it works on its own:

```ts
constructor(private readonly health: TypesenseHealthIndicator) {}

await this.health.isHealthy()
// { typesense: { status: 'up', responseTime: 3 } }
```

It also drops straight into [`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus),
**without this package depending on terminus** — nothing under `src/` imports it, not even a
type, so nothing is added to your install:

```ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly typesense: TypesenseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.typesense.isHealthy('typesense')])
  }
}
```

That works because terminus' current `HealthIndicatorService` API has a failing check
*return* `{ status: 'down' }` rather than throw, so the contract is a plain object this
package can produce structurally. The integration suite runs the indicator through a real
`HealthCheckService` to keep that true.

## Testing

Unit tests cover schema inference and hashing and need nothing running:

```bash
npm test
```

The integration suite exercises the client, the bootstrap migrator and the indexer
against a real Typesense server:

```bash
docker compose up -d          # or: brew services start typesense-server
npm run test:integration
```

The embedding tests create a collection with the `ts/all-MiniLM-L12-v2` model. On a fresh
server that first create downloads the model, so the block has a 10-minute timeout. Later
runs reuse the cached model and take seconds. The suite targets Typesense 30.2
(`docker-compose.yml` pins it).

It refuses to run rather than skipping when no server answers, so a green run always
means the server was hit. Point it elsewhere with `TYPESENSE_HOST`, `TYPESENSE_PORT`
and `TYPESENSE_API_KEY`.

It imports the built package rather than `src`, because vitest transpiles with esbuild,
which honours `experimentalDecorators` but drops `emitDecoratorMetadata` — Nest cannot
resolve constructor injection from source under that transform. `npm run
test:integration` builds first.

## Contributing

Checks run at three points, each a superset of the one before.

`bun install` installs [husky](https://typicode.github.io/husky/), which wires up two hooks:

| Hook | Runs | Cost |
| ---- | ---- | ---- |
| `pre-commit` | `biome check` on staged files only | sub-second |
| `pre-push` | build, typecheck, lint, format, unit tests | ~15s |

CI then repeats the `pre-push` set across Node 20, 22 and 24, and additionally
runs the integration suite against a real Typesense in Docker.

`pre-push` deliberately stops short of the integration suite: that suite throws
rather than skips when no server answers, so including it would block every push
made while your local Typesense is down. Run it yourself with
`npm run test:integration`. In a genuine emergency, `git push --no-verify`.

One wrinkle worth knowing if you add checks: the typecheck needs `dist` to
exist. `src/typesense.integration.test.ts` imports `../dist/cjs/index.js` by design,
so `tsc --noEmit` fails on a clean checkout until you have built once. Both the
hook and CI build first.

## Module formats

Both are published, selected by the `exports` map:

| | Entry | Types |
| --- | --- | --- |
| `require()` | `dist/cjs/index.js` | `dist/cjs/index.d.ts` |
| `import` | `dist/esm/index.js` | `dist/esm/index.d.ts` |

Both are compiled with `tsc`. That is not a preference — esbuild-based bundlers do not
implement `emitDecoratorMetadata`, and NestJS constructor injection reads the
`design:paramtypes` it emits. Dropping it breaks DI silently at runtime rather than at
build time. CI asserts the metadata survives in *both* outputs.

Injection tokens use `Symbol.for`, so they stay identical if an application ends up with
both copies loaded — one dependency requiring the package while another imports it. With
plain `Symbol()` the two copies would hold different tokens and `@Inject` would fail to
resolve at bootstrap. The integration suite loads both builds together and asserts they
agree.

## Upgrading to 0.3.0

`sort_by` is now typed as at most three expressions with at most one `_eval`, written as
tuples. Literal arrays are unaffected, but a `sort_by` built up as a `SortExpression[]`
variable no longer typechecks. Declare it as a tuple, or cast it as you would a dynamic
field list. It is still validated at runtime either way.

`client.upsert` and `TypesenseCollector.transform` now take `WritableDocumentOf<…>`. For a
collection with no embedding field, that is exactly the old document type.

## Upgrading to 0.2.0

`query_by`, `sort_by` and `facet_by` now take a field name or an **array** of them rather
than a comma-separated string, so each element is checked:

```ts
query_by: 'title,description'        // 0.1.0
query_by: ['title', 'description']   // 0.2.0
```

A single field is unchanged (`query_by: 'title'`). `filter_by` still accepts a raw string,
so existing filters keep working; the typed object is the new alternative. If you build a
field list dynamically, cast it: `fields as FieldSelection<typeof videoCollection>`.

## Status

v0.3.0, CommonJS and ESM.

Verified against Typesense 29/30 (auto-embedding, vector queries and `_eval` sorting
against 30.2): collection creation, the `create`/`alter`/`recreate`
migration strategies, typed search with filtering, faceting and pagination, multi-search,
upsert and delete, full plus incremental indexing through collectors, geo filtering, and
the health indicator through real `@nestjs/terminus`. Every filter shape the compiler can
emit is asserted against the live server, not just against its compiled string.

Known rough edges:

- No point lookup by id — drop to `client.raw`.

## License

MIT © Ebenezer Domey
