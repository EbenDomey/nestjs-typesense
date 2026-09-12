---
id: TASK-001
title: Replace CHANGEME repository URLs before publishing
status: Done
assignee: []
created_date: '2026-09-09 13:29'
updated_date: '2026-09-12 11:29'
labels:
  - release
  - blocker
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
package.json has placeholder GitHub URLs in repository, bugs and homepage. npm renders these on the package page, so they must point at the real personal repo before the first publish.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 repository.url, bugs.url and homepage point at the real GitHub repo
- [x] #2 npm pack --dry-run shows no CHANGEME
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Set repository.url, bugs.url and homepage to https://github.com/EbenDomey/nestjs-typesense (replacing the CHANGEME placeholder), and switched prepublishOnly from 'bun run build' to 'npm run build' so publishing does not require bun. Repo created, pushed (ea781a7) and made public.

Verification: package.json parsed with node to read the three URL fields back; both https://github.com/EbenDomey/nestjs-typesense and /issues returned HTTP 200 with GITHUB_TOKEN/GH_TOKEN unset, proving they resolve for an anonymous visitor rather than only for the owner. 'npm pack --dry-run' output grepped for CHANGEME: no matches. Full suite re-run after the edits: tsc --noEmit clean, 17 unit tests and 24 integration tests against a live Typesense all pass, and 'npm publish --dry-run' succeeds (51 files, 27.7 kB).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the CHANGEME placeholders in repository.url, bugs.url and homepage with the real repo at https://github.com/EbenDomey/nestjs-typesense, which is now created, pushed and public. Verified by reading the fields back from package.json, confirming both the repo and issues URLs return HTTP 200 anonymously, and confirming 'npm pack --dry-run' contains no CHANGEME.
<!-- SECTION:FINAL_SUMMARY:END -->
