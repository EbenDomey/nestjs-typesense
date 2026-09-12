---
id: TASK-010
title: Add an optional decorator API (@TypesenseCollection / @TypesenseProp)
status: Done
assignee: []
created_date: '2026-09-09 16:14'
updated_date: '2026-09-10 10:14'
labels:
  - feature
  - dx
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mongoose-style class decorators as an additive front-end over the existing core. @TypesenseProp takes an options object with a string literal type, mirroring defineCollection's field options: @TypesenseProp({ type: 'string', optional: true }). TypesenseFieldType is a literal union, so typos are compile errors and editors autocomplete all 15 options. Verified: typing @TypesenseProp as a generic returning a constrained property decorator makes TS1240 fire on field/property type disagreement and on optionality disagreement, so a declared type cannot silently drift from the property it annotates. Both APIs compile to the same TypesenseCollection object, so TypesenseClient/TypesenseCollections/TypesenseIndexer are untouched. No enums (rejected by erasableSyntaxOnly TS1294 and by node --experimental-strip-types) and no symbols (the schema is JSON-hashed for migration detection). No reflection-based type inference: design:type resolves only string/bool and erases number width, array element type, geopoint and optionality.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @TypesenseCollection and @TypesenseProp produce the same TypesenseCollection shape as defineCollection, including the sorted-field hash
- [ ] #2 A field type that disagrees with the TS property type fails typecheck
- [ ] #3 A required field on an optional TS property fails typecheck
- [ ] #4 Fields declared on a base class are collected via the prototype chain
- [ ] #5 A user-declared id property does not produce a duplicate id field
- [ ] #6 defineCollection remains fully supported and documented alongside
- [ ] #7 No enum or symbol appears in the public API surface
- [ ] #8 Modifiers stay in the options object; no stacked @TypesenseOptional/@TypesenseFacet decorators, since splitting optional from type forfeits the optionality typecheck (verified TS1240)
- [ ] #9 Eight scalar decorators (@TypesenseString/Int32/Int64/Float/Bool/Geopoint/Object/Auto) are generated from one factory
- [ ] #10 A single @TypesenseArray({ type }) covers all seven array types via a template-literal element mapping; 'auto' is excluded automatically because TypesenseFieldTypeMap has no 'auto[]' key
- [ ] #11 @TypesenseArray rejects an element type that disagrees with the property, a non-array property, and an unknown element string (TS2322 naming the bad value)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in src/schema/decorators.ts (217 lines). @TypesenseSchema + @TypesenseProp + 8 scalar decorators from one factory + @TypesenseArray({ type }). Builds its collection by calling defineCollection, so the hash is identical to the defineCollection path (asserted in decorators.test.ts). Named TypesenseSchema rather than TypesenseCollection because the interface of that name already exists and re-exporting both from index.ts is TS2300. Field metadata uses getOwnMetadata so subclasses do not mutate a base class's map; collectFields walks base -> derived. Declared string id is dropped (toSchema always emits it); a non-string id throws. module-options.collections and TypesenseCollections now accept either style via resolveCollection(). 7 @ts-expect-error compile-time guards, mutation-tested: removing them yields 9 errors. 17/17 tests, typecheck/lint/build clean, runtime smoke test against dist verified inheritance, array mapping and sorted-field hashing.
<!-- SECTION:NOTES:END -->
