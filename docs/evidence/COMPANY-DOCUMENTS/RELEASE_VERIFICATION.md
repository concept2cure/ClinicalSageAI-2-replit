# Company documents release verification

The company identity, letterhead and legal-document feature was integrated with the current `concept2cure-v2` product branch on 2026-10-17. Feature commit `68b3dd627` and integration commit `6d88e0b1a` retain the original implementation and upstream changes. The two source conflicts were adjacent imports; both company applicability and upstream tenant/admission/lifecycle controls are retained.

The release cleanup extracts cohesive UI state/actions and presentation components, original-PDF verification, and PDF letterhead geometry/image preparation. It preserves API contracts, labels, scope/approval checks, mutation reasons, conflict handling, session guards and original bytes. Independent read-only agent review found no control regression. New test fixtures now carry the actual organization settings, document tenant and submission program columns needed by the canonical checks.

## Checks

- [Combined feature/regression run](release/tests-green.txt): **496 passed across 39 files**, including Admin/Settings, submission companions, tenant/project access, unchanged originals, optimistic revisions, legal applicability, actual Word/PDF output and existing report behavior.
- [Backend merge checks](release/backend-merge-green.txt): **141 passed across 10 suites**. [Upstream transmission checks](release/upstream-transmit-green.txt): **13 passed**. These overlap the combined run and are not added to its count.
- Nineteen report/eCTD/MDR integration suites completed with **192 passing tests and 2 existing todo cases**. Sixteen suites passed directly in the [integration run](release/integration-before-fixture-alignment.txt); three local fixtures required the schema alignment above. Their [final rerun](release/packaging-fixtures-green.txt) passes **16 tests across 3 suites**, with those 2 todo cases retained.
- [Warning gate](release/warning-ratchet-green.txt): **net −1 warning** against the synchronized upstream source. No warning or typecheck baseline is increased. All new UI modules and the refactored PDF writer have zero ESLint warnings/errors.
- [Full-program typecheck](release/typecheck-green.txt): unchanged zero-error baseline, including cached diagnostics for untouched files.
- [Production build](release/build-green.txt): passes; the vendor bundle size warning remains nonfatal. [Repository-health ceiling](release/repo-health-green.txt) passes with zero duplicate-content groups.
- `git diff --check` passes. The canonical pre-commit and pre-push scripts remain enabled for publication; no check or branch-authority bypass is introduced.

## Local runtime

The initialized local database was refreshed using the repository's deployment migration entrypoint after integrating upstream migrations. The runtime still uses `app_service`, enforced RLS and development-only signing/auth configuration. No new production schema migration or dependency is introduced by the company-document feature.

The restarted merged app passes [health/database/auth/workspace smoke checks](release/live-smoke.txt), [audited company and neutral submission Word downloads](release/live-downloads.txt), and [live browser Settings/designer/library checks](release/browser-result.json). The download check changes no company settings. AI remains unconfigured and its readiness refusal is retained.

## Publication scope

Publication targets `concept2cure-v2` only, as requested. A branch push runs CI; production deployment requires a separate manual workflow or version tag. Neither production deployment nor changes to GitHub branch/environment protection are part of this publication. GitHub API access currently returns HTTP 403 in this environment, so local verification does not claim a remotely observed CI result or human release approval.
