
<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.51.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

# nestjs-typesense

An unofficial NestJS module for Typesense. Published from a personal account, consumed by
other projects as an ordinary public dependency.

## Design principles

- **Database-agnostic.** Nothing in this package may import or reference a specific database.
  Indexing is expressed through `TypesenseCollector`, which is pull-based (`fetchAll`,
  `fetchChanged(since)`, `fetchRemoved(since)`) so it works over Postgres, Mongo or anything
  else. Never add change-stream or ORM coupling — that is the flaw this package exists to avoid.
- **Impose nothing on the consumer's HTTP contract.** No pagination envelope, no error taxonomy,
  no telemetry dependency. `TypesenseClient.search` returns a plain `{ found, page, hits, facets }`
  and callers shape their own responses. `client.raw` is the escape hatch.
- **Public API flows through `src/index.ts`.** Anything not exported there is internal.

## Build

- **Compile with `tsc` only. Never switch to esbuild, tsup or swc-based bundling.** esbuild does
  not implement `emitDecoratorMetadata`, and NestJS constructor injection depends on the
  `design:paramtypes` it emits. Dropping it breaks DI silently at runtime, not at build time.
  After changing anything about the build, verify with:
  `grep -l "design:paramtypes" dist/**/*.js` — expect the DI classes to be listed.
- Output is **dual**: `dist/cjs` (CommonJS) and `dist/esm` (ESM), built by two `tsc` passes
  (`tsconfig.build.json` and `tsconfig.build.esm.json`) and selected by the `exports` map.
  `scripts/finalize-dist.mjs` then writes a `package.json` into each directory carrying only
  `{"type": ...}` — without those markers Node reads the root `package.json` and treats
  `dist/esm/*.js` as CommonJS. Never delete that step.
- **Injection tokens must stay `Symbol.for`, never plain `Symbol()`.** An application can end
  up with both builds loaded (one dependency `require`s the package, another `import`s it).
  Plain symbols are per-copy, so the two copies would hold different tokens and every
  `@Inject(TYPESENSE_CLIENT)` would fail to resolve at bootstrap. `Symbol.for` shares them
  through the global registry. The integration suite loads both builds together and asserts it.

## Type-level conventions

- **`defineCollection`'s `TFields` parameter is deliberately unconstrained. Do not "fix" it by
  adding `extends TypesenseFieldRecord`.** A constraint mentioning `TypesenseField` becomes the
  inference target for every property and resets each field's `optional` flag to its `boolean`
  default. Since `boolean extends true` is false, every optional field silently becomes required
  in `InferDocument`. `const` type parameters, self-referential `Record<keyof F, …>` constraints
  and mapped-type intersections were all tested and all widen. Validation therefore happens in
  the **return type** (`InvalidCollectionFields`), where it cannot poison inference.
  `src/schema/collection.test.ts` guards this with type-level assertions.
- Field builders thread `TOptional` through as a literal (`true`/`false`), never widened to
  `boolean`. Preserve that when adding new field types.

- **`optional` must stay in the same decorator call as the field type.** `PropTarget` binds the
  two so TypeScript can check them against the annotated property. Splitting optionality into a
  stacked `@TypesenseOptional()` (the `class-validator` shape) makes each decorator typecheck
  independently, so the type decorator would reject every `?` property. Verified — do not
  "improve" the ergonomics here without re-running the guards.
- **Decorator field metadata uses `Reflect.getOwnMetadata`, never `getMetadata`.** reflect-metadata
  resolves through the prototype chain, so a subclass would otherwise mutate its base class's
  field map in place. `collectFields` walks base → derived explicitly so overrides work without
  shared mutation; `src/schema/decorators.test.ts` asserts the base is left untouched.
- `@TypesenseSchema` builds its collection by calling `defineCollection`, so the two declaration
  styles cannot drift and the schema hash stays identical. Do not reimplement the hashing.
- The class decorator is `TypesenseSchema`, not `TypesenseCollection`: the latter is already the
  exported interface, and re-exporting a type and a value under one name from `index.ts` is a
  duplicate-identifier error (TS2300).

## Testing

- **Always run `bun run typecheck` separately from `bun run test`.** Vitest transpiles without
  typechecking, so type-level regressions pass the test suite. The optional-field bug above was
  invisible to green tests and only `tsc --noEmit` caught it.
- Type-level behaviour is tested with `Assert<T extends true>` helpers and `@ts-expect-error`,
  which fail at compile time rather than runtime.
- When fixing a type-inference bug, verify the guard actually fires by reintroducing the bug and
  confirming the typecheck fails. A guard that passes vacuously is worse than none.

## Linting

Two Biome rules are disabled in `biome.jsonc`, both with comments explaining why. Do not
re-enable them:

- `style/useImportType` — DI resolves constructor params via `emitDecoratorMetadata`, which needs
  the class imported as a **runtime value**. `import type` erases it and breaks injection.
- `complexity/noStaticOnlyClass` — NestJS dynamic modules are static-only classes by design; the
  class itself is the module token.

`javascript.parser.unsafeParameterDecoratorsEnabled` is on so Biome can parse `@Inject()`.

## Layout

```
src/
  index.ts                  public barrel — the package's entire API surface
  typesense.module.ts       forRoot / forRootAsync
  schema/                   field builders, defineCollection, InferDocument, schema hashing
  client/                   TypesenseClient — typed search/upsert/delete over the official client
  collections/              bootstrap migrator (off | create | alter | recreate)
  collectors/               collector interface, decorator, and the indexer that drives them
```

## Commands

```bash
bun run typecheck   # tsc --noEmit — run this, tests do not typecheck
bun run test        # vitest
bun run lint        # biome
bun run build       # tsc -> dist/ (CJS)
```

## Testing

- `npm test` is hermetic. `npm run test:integration` needs a live Typesense and is kept
  out of the unit config by an explicit `exclude`, not by naming luck.
- The integration suite imports `../dist/cjs`, never `src`. Vitest transpiles with esbuild,
  which honours `experimentalDecorators` but **silently drops `emitDecoratorMetadata`** —
  `design:paramtypes` comes back `undefined`, so Nest cannot resolve constructor
  injection and every service arrives as `undefined`. Compiled `dist` carries the
  metadata because `tsc` emits it. If a Nest-DI test fails with
  `Cannot read properties of undefined`, this is why.
- The suite throws when no server answers rather than skipping. A skipped integration
  test that reports green is worse than no test.
