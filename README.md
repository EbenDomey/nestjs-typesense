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
  query_by: 'title,description',
  filter_by: 'durationMs:<60000',
  per_page: 20,
})

results.hits[0].document.title // typed as string
```

A decorated class can be passed in the same place, and the class *is* the document type:

```ts
const results = await this.typesense.search(VideoDocument, { q: 'mountain', query_by: 'title' })

results.hits[0].document.title // typed as string
```

`results` is a plain `{ found, page, hits, facets }` — shape your own API response from it.
For anything not covered, `typesense.raw` is the official client.

`search`, `upsert` and `delete` all accept either declaration style, as do
`TypesenseIndexer`'s methods and `TypesenseCollections.get()`. Looking a collection up by
the declaration rather than by its name keeps the field types:

```ts
collections.get(videoCollection) // TypesenseCollection<…fields>, search stays typed
collections.get('videos')        // TypesenseCollection, documents come back loose
```

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

## Status

v0.1.0, CommonJS and ESM.

Verified against Typesense 29/30: collection creation, the `create`/`alter`/`recreate`
migration strategies, typed search with filtering, faceting and pagination, upsert and
delete, and full plus incremental indexing through collectors.

Known rough edges:

- `query_by`, `filter_by`, `sort_by` and `facet_by` are unchecked strings; a typo fails
  at runtime, not at compile time.
- No multi-search, and no point lookup by id — drop to `client.raw` for both.

## License

MIT © Ebenezer Domey
