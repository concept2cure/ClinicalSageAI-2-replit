# D2 — Reporting & analytics joins the launch catalog (the seventh app)

**Row:** D2 (launch catalog), `docs/LAUNCH_DEFINITION_OF_DONE.md`. **Lane:** `session_0194UQPxy9Er2ibRAjog8Ven`.
**Date:** 2026-09-30 to 2026-10-01 UTC, on `concept2cure-v2` after `a5baf5b0`.
**Companion folder:** `docs/evidence/D6/2026-09-30-compliance-reports/` (the audit and compliance reports clients run).

## The founder's decision

The founder wrote, on 2026-09-26, in this lane's session:

> "Can you work on security audit reports clients may ask for in an audit or if a regulator asks for such reports. I
> don't see our reporting and analytics central module on the left rail upon entering the app like I should too. It is
> just like vault and project management, submissions and tasking - all central services for all client types. Make
> sure it is there and these reports are available for clients to run."

`CLAUDE.md` Rule 2 named a launch catalog of six apps. This change records the decision that Reporting & analytics is
the seventh: in `shared/constants/launch-scope.ts` (the one list), in `CLAUDE.md` Rule 2, and on the work-order board.
The definition of done's row D2 text still says six apps; that file was inside another lane's 24-hour window
(`…01DiJJAk`, until 2026-10-02 00:23 UTC) and its one-line change is handed on through the board.

## What was wrong

- **The rail entry existed and was hidden.** `RAIL_CORE` in `client/src/concept2cure/v2/registryModel.ts` already
  carried `insights` ("Reporting & analytics") as the fifth Workspace entry beside Projects, Vault, Submission Center
  and Tasks, for every client type. In production (`LAUNCH_SCOPE_ENFORCE` on by default) the server emitted a
  `launch-scope` verdict for every surface outside `LAUNCH_APPS`, and the rail does not render such an entry
  (`Shell.tsx` `railVisible`). A deep link showed "Not in this release".
- **Its API was refused.** `/api/report-os` and `/api/insights` were claimed only by that surface, so the launch-scope
  API gate answered 403 `LAUNCH_SCOPE` for them in production; `/api/insights-canvas`, which the canvas reads first,
  was claimed by no surface at all (`red/launch-scope-api-canvas-unclaimed.txt` shows the gate naming it once
  Reporting is in scope).
- **Every Run would have failed anyway.** The report type registry is empty on a database provisioned the canonical
  way, and a run carries a foreign key to it: `POST /api/report-os/runs` answered 404 `Unknown reportTypeId`
  (`report-os/README.md`).
- **AnA withheld the six Reporting tools** in production (the launch-scope inventory listed them under a hidden app).
- **No reporting surface held the reports an auditor asks for** (`docs/evidence/D6/2026-09-30-compliance-reports/`).

## What is true now

| Change | Where | Shown failing first |
|---|---|---|
| The seventh launch app `reporting` — "Reporting & analytics" — with surfaces `insights` and `compliance-reports` and module `insights` | `shared/constants/launch-scope.ts` | `launch-scope/red/launch-scope-test-head.txt` (the new pin and the count of seven fail against the six-app catalog) |
| The launch-scope gate expects seven apps | `scripts/ci/check-launch-scope.mjs` | `launch-scope/red/check-launch-scope-six.txt` (shape and registration findings) → `green/check-launch-scope.txt` (7 apps · 41 surfaces · 20 modules, 0 findings) |
| The canvas claims `/api/insights-canvas`; the new surface is registered (`apiPrefixes: ['/api/audit']`, never gated) | `shared/constants/ui-surface-registry.ui-v2.ts` | `red/launch-scope-api-canvas-unclaimed.txt` → `green/launch-scope-api.txt` (277 paths, none refused) |
| The six Reporting tools move in scope for AnA | `server/services/ana/ana-launch-scope.inventory.json` | `red/ana-launch-scope-inventory-unchanged.txt` (2 failing) → 7/7 |
| AnA can navigate to both surfaces; the training orientation visits Reporting & analytics and the reports before ending at the audit trail | `shared/navigation/index.ts`, `shared/navigation/demo-scripts.ts` | `red/demo-scripts-orientation.txt` → 15/15 |
| The surface is declared contextual (reached from the canvas and the audit trail) | `scripts/ci/check-surface-discoverability.mjs` | the client helper's `pending/surface-discoverability.txt` → OK, 123 surfaces |
| OQ-PROJ-13 and the end-to-end access spec include the seventh app | `tests/validation/oq/projects/run.mjs`, `tests/e2e/launch-surface-access-control.e2e.spec.ts` | not executed here (they need a running stack) |
| The registry reaches a deployed database; run, finalize and PDF exports are recorded on the chain; finalize is role-gated and atomic; the dev seed route is deleted | `report-os/README.md` | in that folder |
| The canvas tells an already-final run and a refused role apart from the truthfulness gate | `client/src/concept2cure/v2/surfaces/Insights.tsx` | `red/insights-finalize-refusal-wording.txt` → green |

**On a real database, through sign-up.** `tests/db/signup-launch-catalog.dbtest.ts` and
`tests/db/entitlement-grants-resolution.dbtest.ts` iterate `LAUNCH_APPS`, so with the seventh app they sign up a new
organisation through `POST /api/auth/signup` and through first-run setup, and read the rail's verdicts with
`LAUNCH_SCOPE_ENFORCE` on: every launch surface, Reporting & analytics included, is available, every launch module
granted (72/72 as `app_service` under RLS, `launch-scope/green/signup-rail-dbtests.txt`).

Entitlement: the `insights` catalog row has no tier restriction, so the rail verdict for it is entitled for every
organisation once launch scope admits it (`server/services/entitlements/__tests__/launch-scope.test.ts`, the reporting
pin: a `subscribed` verdict is kept). Report-OS report families still carry their plan tiers
(`server/services/report-os/entitlement-map.ts`); that is a commercial decision this change does not make. The audit
and compliance reports are not tier-gated: they are under `/api/audit` and role-gated.

## Reviews

Three read-only lenses reviewed the whole change before commit (security, honest state, Part 11 UX). Their findings
and how each was answered are in `docs/evidence/D6/2026-09-30-compliance-reports/README.md` §Reviews; the ones in this
folder's scope are DP-47 (finalize newly reachable without a role gate or atomic record — fixed), DP-50 (bundle
export without the entitlement gate or a record — fixed; deliveries open) and the canvas's no-program state shown for a
failed read (fixed: 503 `PORTFOLIO_UNAVAILABLE`).

## Not done here

- `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2: "Six apps" → seven, naming Reporting & analytics. Hot until
  2026-10-02 00:23 UTC (lane `…01DiJJAk`); handed on through the board.
- The controlled validation documents that say "six" (`docs/validation/OQ-001-PROJECTS.md`, `URS-001-PROJECTS.md`,
  `TM-001-TRACEABILITY-MATRIX.md`, `VMP-001-VALIDATION-MASTER-PLAN.md`, `VSR-001-VALIDATION-SUMMARY-REPORT.md`) need a
  versioned change by whoever owns validation; not edited silently.
- OQ-PROJ-13 and the end-to-end spec were changed but not executed (they need a running stack).
- Existing organisations: the canvas's module is unrestricted, so no grant is needed for the rail; a tenant whose
  administrator revoked it keeps its own verdict.
