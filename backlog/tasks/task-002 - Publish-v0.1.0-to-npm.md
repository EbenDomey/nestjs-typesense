---
id: TASK-002
title: Publish v0.1.0 to npm
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 12:16'
labels:
  - release
dependencies: []
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First public release of the unscoped name nestjs-typesense. Confirmed available and not similarity-blocked against the existing typesense-nestjs package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npm publish --access public succeeds
- [x] #2 installing the tarball into a scratch NestJS 11 app resolves types and boots
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pre-flight: confirm npm identity and registry, confirm 0.1.0 is unpublished, confirm the working tree is clean and pushed, and re-run the full suite (typecheck, unit, integration) plus npm publish --dry-run.
2. Publish with npm publish --access public. prepublishOnly runs npm run build, so dist is rebuilt from source at publish time.
3. Verify from the registry rather than the local tarball: wait for the version to appear, then install nestjs-typesense from npm into a scratch NestJS 11 app, typecheck it against the shipped .d.ts, and boot it against a live Typesense.
4. Confirm the npm page metadata — repository, bugs and homepage links, README rendering, declared peer ranges.
5. Finalize against both acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BLOCKED on npm account configuration, not on the package.

npm publish --access public failed with E403: 'Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.' npm profile reports two-factor auth: disabled for user eben-domey. Nothing was published; nestjs-typesense and 0.1.0 are both still unclaimed. Resolving requires either enabling 2FA on the account and publishing with an OTP, or creating a granular access token with the bypass-2FA option.

Pre-flight before the attempt was clean: typecheck, 17 unit tests and 24 integration tests all pass, working tree committed and pushed, tarball 51 files / 28.2 kB.

One real defect was caught by inspecting the tarball rather than trusting the dry-run count: dist/__pushprobe.* (4 files) was about to ship. tsc does not remove stale output, so a source file deleted after an earlier build left compiled artifacts behind in dist, and the files array ships all of dist. Fixed by rm -rf dist before rebuilding. Worth hardening: neither 'bun run build' nor prepublishOnly cleans dist first, so any future deleted source can silently ship again.

Published by the maintainer from their own terminal. The account uses a passkey for 2FA rather than TOTP, so --otp does not apply and the publish completes through npm's browser round-trip, which cannot be driven from here.

Registry verification: version 0.1.0, dist-tags { latest: '0.1.0' }, fileCount 51, unpackedSize 110837. Metadata resolves correctly — author 'Ebenezer Domey <domeyeben4@gmail.com>', repository/homepage/bugs all pointing at github.com/EbenDomey/nestjs-typesense, peer ranges intact (@nestjs 10/11, typesense 1.8/2/3).

AC2 verified against the registry artifact rather than the local tarball, which is the distinction that matters: a fresh scratch project installed nestjs-typesense from npm (package-lock records resolved = https://registry.npmjs.org/nestjs-typesense/-/nestjs-typesense-0.1.0.tgz), alongside NestJS 11, typesense 3 and reflect-metadata. 'tsc --noEmit' against the shipped .d.ts exited 0, and the app booted against a live Typesense passing all 18 checks: constructor injection of TypesenseClient and TypesenseIndexer into a consumer-owned service, bootstrap migrations for both declaration styles, collector-driven reindex, incremental sync with removals, filtering, faceting and typed hits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published nestjs-typesense@0.1.0 to npm under the public access flag. Verified from the registry, not the local build: npm view reports 0.1.0 as latest with 51 files and correct author, repository and peer-range metadata, and a scratch NestJS 11 project installing the package from registry.npmjs.org typechecks against the shipped .d.ts and boots against a live Typesense with all 18 consumer checks passing. The publish itself was run by the maintainer because the account's 2FA is a passkey, which requires a browser round-trip.
<!-- SECTION:FINAL_SUMMARY:END -->
