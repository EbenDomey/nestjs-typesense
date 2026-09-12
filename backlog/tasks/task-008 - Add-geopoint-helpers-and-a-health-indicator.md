---
id: TASK-008
title: Add geopoint helpers and a health indicator
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 21:18'
labels:
  - feature
dependencies: []
priority: low
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two small conveniences: createGeopoint/parseGeopoint transformers, and a @nestjs/terminus health indicator that reports cluster reachability.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 geopoint helpers round-trip lat/lng
- [x] #2 health indicator is optional and does not force a terminus dependency
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two independent conveniences, kept in separate files.

Geopoint helpers (AC1). Typesense stores a geopoint as a positional [lat, lng] tuple, which is easy to transpose silently — a swapped pair is still a valid tuple and only shows up as results from the wrong hemisphere. createGeopoint(lat, lng) and parseGeopoint(point) give the tuple named ends, and both validate range (lat -90..90, lng -180..180) and throw rather than letting an out-of-range pair reach Typesense, where it surfaces as an opaque import rejection. Round-trip is asserted both ways.

Health indicator (AC2). The constraint is that nestjs-typesense must not depend on @nestjs/terminus, so the indicator imports nothing from it — not even a type, because a type import still resolves in a consumer's .d.ts and would break typecheck for anyone without terminus installed.

Context7 on the NestJS 11 docs settled the contract: the modern HealthIndicatorService pattern has a failing check RETURN { [key]: { status: 'down', ...data } } rather than throw HealthCheckError (that is the deprecated HealthIndicator base-class pattern). So the result is a plain object shape that can be produced structurally. TypesenseHealthIndicator.isHealthy(key) calls client.raw.health.retrieve() and returns that shape, declaring its own TypesenseHealthResult type.

That inference is the risk in this task, so it is verified rather than assumed: @nestjs/terminus goes in as a devDependency only, and an integration test drives our indicator through a real terminus HealthCheckService to confirm terminus reports ok when the cluster answers and error when it does not. If terminus turns out to require a thrown error, the test fails and the design changes.

No peerDependency entry, optional or otherwise — the package genuinely does not import terminus, so listing it would only misrepresent the relationship. README documents the pairing instead.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification of AC2 is the substance of this task, because 'does not force a terminus dependency' is easy to claim and easy to get wrong.

What was checked, in order:
1. Context7 on the NestJS 11 docs established that the modern HealthIndicatorService API RETURNS { [key]: { status: 'down' } } on failure; the throw-HealthCheckError pattern is the deprecated base-class one. That made a structural, import-free result shape viable.
2. That inference is the single point of failure — if wrong, the indicator reports healthy for a dead cluster. So an integration suite drives the indicator through a real HealthCheckService from @nestjs/terminus 12. Confirmed: terminus logged 'Health Check has failed!' and raised 503 with status 'error' and error.typesense.status 'down', purely from the returned object.
3. terminus is a devDependency only — no peerDependency entry even an optional one, since the package genuinely does not import it and listing it would misrepresent the relationship. grep confirms no import of it anywhere in dist; the only occurrences are in doc comments.
4. Proven from the outside: packed the tarball, installed into a fresh consumer WITHOUT terminus, and typechecked with skipLibCheck OFF so every shipped .d.ts is fully checked. Clean. Ran it under node — geopoint round-trip returned true and the module loaded.

Deliberately not routed health failures through options.onError: a probe failing is expected, and reporting every one to Sentry would be noise.

Geopoint range check earns its keep on transposition, not just on garbage input: a swapped [lng, lat] is still a structurally valid tuple, so it only fails later as matches from the wrong hemisphere. Latitudes past 90 catch the swap for most populated longitudes; a test uses Sydney for the detectable case and notes in a comment that Paris transposed is undetectable by range alone.

Shipped in nestjs-typesense@0.2.0, published to npm 2026-09-12 (tag v0.2.0, commit f63a125, shasum 55b8673777ff0f2a633ecf26bf8d1a442ccd9c7a). Verified after publish by installing 0.2.0 from the registry into a clean consumer: both module conditions resolve to their own build, design:paramtypes intact in each, injection tokens shared, and the typed filter/geopoint/multiSearch/health surface exercised rather than only checked for presence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added createGeopoint/parseGeopoint/isGeopoint and TypesenseHealthIndicator.

Geopoint helpers name the ends of Typesense's positional [lat, lng] tuple and range-check both, throwing rather than letting a transposed or out-of-range pair reach the cluster where it surfaces as an opaque import rejection. Verified by 7 unit tests covering both round-trip directions, the range extremes, a detectable transposition, non-finite input and the type guard.

The health indicator reports cluster reachability and imports nothing from @nestjs/terminus — not even a type, since a type import lands in the emitted .d.ts and would break typechecking for consumers without it. It works with terminus because terminus' current API reads the status off the object a check returns. That inference was verified against a real HealthCheckService rather than assumed: terminus raised 503 with status 'error' for a dead cluster and 'ok' for a live one. Proven independent by packing the tarball and typechecking a fresh consumer with no terminus installed and skipLibCheck off — clean.

Full gate: 35 unit tests, 29 integration tests against live Typesense 29, tsc --noEmit clean, biome clean, and design:paramtypes emitted for the new indicator so Nest DI resolves it.
<!-- SECTION:FINAL_SUMMARY:END -->
