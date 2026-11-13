# Codespaces demo recovery — 2026-11-13

Package: F1 repairs within L1 launch rows D1/D2 and the existing DATA demo path.
Baseline: `d06fb86ec904beb947e8641994f13f9eb3a0d27e` on `concept2cure-v2`.

## What already exists

- `.devcontainer/devcontainer.json` declares the Node 22 Bookworm image, four cores/16 GB, private port 5000 and existing post-create/post-start hooks. `post-create.sh` provisions PostgreSQL 16/pgvector, owner/runtime credential separation and demo identities. No second environment or launch workflow is needed.
- `.devcontainer/post-start.sh` already migrates, starts the app, seeds Lumen and the other packs, prepares CDISCPILOT01, checks the running version and supplied provider credentials, and reports actual readiness. Its CSR preparation installs Playwright 1.56.1 only when the package cannot resolve. A package can survive a failed Chromium/system-dependency install; the next start then skips recovery. Reuse this exact preparation block and its existing official CLI, without automatic model generation.
- `scripts/ops/codespaces-startup.test.mjs` exercises actual shell decisions and is held by the provider-restart continuation. This slice does not edit it or the provider-comparison/restart lines of post-start. An additional test-only shell regression can exercise browser recovery; the existing `codespaces:doctor:test` command includes it.
- `scripts/demo/launch-demo/packs/lumen.mjs` already seeds native Quality before running deterministic reports, bundles and in-platform schedules. Existing report reuse matches type and project scope type, but not the exact LMN-201 project. It rescans an organization-wide first 100 rows for bundle/schedule selection. Reuse the existing verified numeric `project_id` from `GET /api/c2c/projects/:programId/team`, the report route's exact scope filters and its program/scope agreement check.
- `compliance.audit_assurance_pack` is already a supported project report with native Quality facts and truthful partial/unassessed status. It is absent from the Lumen report list. Reach that existing report after the native QMS seed; do not create a report type, provider or screen.
- The bundle API has no update operation. Existing wrong or older bundle snapshots must be retained. Reuse only exact selected LMN-201 memberships; create a fresh snapshot through the current POST when needed. Other-project reports and schedules are not changed.
- Current presenter guidance is `docs/demo/lumen-showcase.md`. `scripts/ops/codespaces-doctor.mjs`, the real-image `codespace` CI job and existing showcase tours already supply acceptance checks. A skipped Codespace job or deterministic seed does not prove live startup or model generation.

Searched existing hooks, callers, runtime/seed helpers, report routes, registry, tests and full canonical deletion history (`git log --all --diff-filter=D` over the existing owners). The checkout is not shallow; no deleted replacement was found. Current P-122 visible-functionality rules remain binding. No screen, route, table, subsystem, provider, model or production dependency is added.

## Bounded repair

1. Independently verify the pinned Playwright package and an actual Chromium launch. Repair missing browser/system dependencies using the existing CLI, retry the launch, and prepare the study only when the browser works. A failed attempt leaves preparation incomplete and retryable; healthy restarts need no browser download. Preserve secret handling and prepare-only behavior.
2. Resolve one canonical LMN-201 numeric scope, query exact report type/scope, verify returned/created receipts, and pass the selected runs directly to bundle/schedule creation. Check program plus numeric scope on creation. Keep old bundle snapshots and refuse malformed/truncated reads. Add the existing Quality assurance report while retaining its real partial status.

Use meaningful red-before-green shell/injected-API tests, existing adjacent suites, actual image startup and the existing Lumen tour. Normal hooks and direct canonical publication remain mandatory. Credential decisions govern live API work separately; isolated browser/bootstrap and deterministic report-selection tests use no model calls.
