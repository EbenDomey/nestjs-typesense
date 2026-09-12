---
id: TASK-002
title: Publish v0.1.0 to npm
status: In Progress
assignee:
  - '@EbenDomey'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 12:07'
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
- [ ] #1 npm publish --access public succeeds
- [ ] #2 installing the tarball into a scratch NestJS 11 app resolves types and boots
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
<!-- SECTION:NOTES:END -->
