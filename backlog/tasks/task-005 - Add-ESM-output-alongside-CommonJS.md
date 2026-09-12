---
id: TASK-005
title: Add ESM output alongside CommonJS
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 13:19'
labels:
  - build
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v0.1.0 ships CJS only. Adding ESM is non-breaking. Must keep using tsc rather than esbuild: esbuild drops emitDecoratorMetadata, which NestJS constructor injection depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 package exposes an exports map with require and import conditions
- [x] #2 design:paramtypes still present in both outputs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification run on branch task-005-esm-output:
- AC#1 — package.json exposes exports['.'] with both import and require conditions, each carrying its own types entry (dual-condition declarations, so node16/nodenext consumers get the matching .d.ts). main/module/types retained for legacy resolvers.
- AC#2 — design:paramtypes present in BOTH outputs: dist/cjs and dist/esm each list client/typesense.client.js, collections/typesense-collections.js, collectors/typesense-indexer.js. Both passes are tsc; neither output goes through esbuild.
- scripts/finalize-dist.mjs writes dist/cjs/package.json {"type":"commonjs"} and dist/esm/package.json {"type":"module"}; without those Node inherits the root type and misreads dist/esm as CJS.
- Injection tokens switched from Symbol() to Symbol.for(). Confirmed the hazard was real before fixing: with plain Symbol() all three tokens differed across the two loaded copies. Symbol.keyFor(m.TYPESENSE_CLIENT) now returns 'nestjs-typesense:client'.
- External consumer test against the packed tarball (101 files): ESM consumer typechecks under moduleResolution node16 and import.meta.resolve lands on dist/esm/index.js; CJS consumer typechecks under classic node resolution and require.resolve lands on dist/cjs/index.js, with decorators and DI metadata intact. Identical schema hash a7ab9936 from both builds.
- Integration suite: 31/31 against live Typesense, including a new 'dual package (CJS + ESM loaded together)' describe that loads both builds in one process and asserts the classes are distinct instances while the tokens are shared.
- Gate: bun run build, typecheck, lint, test (25/25) all green.
- CI gained a 'Smoke-test both built outputs' step. Ran the extracted step locally first, which caught a real bug: the script had been written to /tmp, where bare specifiers such as reflect-metadata fail to resolve (ERR_MODULE_NOT_FOUND). It now writes smoke.mjs into the checkout and removes it afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an ESM build alongside the existing CommonJS one. Two tsc passes (tsconfig.build.json -> dist/cjs, tsconfig.build.esm.json -> dist/esm), a finalize-dist script that writes the per-directory {"type"} markers Node needs, and an exports map with import/require conditions each carrying its own types entry. Injection tokens moved to Symbol.for so the two builds share tokens when an app loads both copies — the dual-package hazard was reproduced with plain Symbol() first, then shown fixed. Verified with build/typecheck/lint/unit (25/25), a 31/31 integration run including a new suite that loads both builds together, and an external consumer test against the packed tarball resolving correctly under both node16 ESM and classic CJS resolution with design:paramtypes intact in each output.
<!-- SECTION:FINAL_SUMMARY:END -->
