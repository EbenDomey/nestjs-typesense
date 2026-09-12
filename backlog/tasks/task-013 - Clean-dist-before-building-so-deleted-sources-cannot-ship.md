---
id: TASK-013
title: Clean dist before building so deleted sources cannot ship
status: Done
assignee:
  - '@EbenDomey'
created_date: '2026-09-12 12:23'
updated_date: '2026-09-12 12:23'
labels:
  - infra
  - release
dependencies: []
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tsc only adds to its output directory; it never removes compiled output whose source has been deleted. Because the files array ships all of dist, a source file removed after an earlier build leaves orphaned artifacts that are published and, since npm versions are immutable, cannot be taken back. This was caught during the 0.1.0 pre-flight: dist/__pushprobe.* was queued to ship and was only noticed because the tarball file count moved from 51 to 55. prepublishOnly rebuilds but does not clean, so the hazard applies to every future release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A source file deleted after a previous build leaves no orphaned output in dist after rebuilding
- [x] #2 The clean runs under both bun run build and npm run build, since CI and prepublishOnly use different runners
- [x] #3 No new dependency and no platform-specific shell command
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a prebuild script: node -e "require('fs').rmSync('dist', { recursive: true, force: true })". fs.rmSync is in Node's standard library and the engines field already requires >=20, so this needs no dependency and no rm -rf, which would not run on Windows. Verified empirically that both bun and npm honour pre/post scripts before settling on prebuild rather than inlining the clean into the build script.

Verification reproduced the original failure: created src/__orphan.ts, built, confirmed dist/__orphan.js existed, deleted the source, rebuilt. Under 'bun run build' and again under 'npm run build' (the path prepublishOnly takes) the orphan was gone. npm pack then reported 51 files with no orphan in the archive listing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a prebuild script that removes dist via fs.rmSync before tsc runs, so output whose source was deleted can no longer survive into a published tarball. No new dependency and no platform-specific shell command. Verified by planting an orphan, deleting its source, and confirming it is gone after rebuilding under both bun and npm, with npm pack back to 51 files.
<!-- SECTION:FINAL_SUMMARY:END -->
