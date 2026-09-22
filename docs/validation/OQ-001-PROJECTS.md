# OQ-001 — Operational Qualification protocol: Projects

| Field | Value |
|---|---|
| Document ID | OQ-001 |
| Version | 0.2 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-001 |
| Runner (the executable protocol) | `tests/validation/oq/projects/run.mjs` — `npm run validation:oq -- projects` |
| Record | `docs/evidence/W3/<date>/OQ-PROJECTS/OQ-001-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-22 | W3 | OQ-PROJ-06b checks what its expected result says: at least one entry carries record/previous hashes, and the server's chain verdict (`meta.chain`) is `ok = true`. v0.1 counted entries only, so an unchained entry or a broken chain passed. Shown on a deliberately tampered local chain: v0.1 passed OQ-PROJ-06b while OQ-PROJ-06 failed; v0.2 fails it (VSR-001 §12). |

## 1. Method

The runner authenticates as the client does (dev-login token seeded into the four `trialsage_*` storage keys, `tests/e2e/dev-auth-helper.ts` pattern), calls the product's public API for every prerequisite and assertion, drives Chromium (`playwright-core`, `CHROMIUM_PATH`) for every surface check with a full-page screenshot, and records each step's API traffic and verdict (VMP-001 §7). Steps marked *scripted* carry a pass criterion; *unscripted* and *ad-hoc* steps record what was observed and require a reviewer's judgement.

## 2. Pre-conditions

IQ-001 executed on the same installation; `LAUNCH_SCOPE_ENFORCE=on`; a fresh or existing organisation for the test identity. No fixtures are seeded — every record is created through the API during the run.

## 3. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-PROJ-01 | URS-PROJ-001 | scripted | `GET /api/c2c/projects` without Authorization | 401/403, no data |
| OQ-PROJ-02 | URS-PROJ-001, 005 | scripted (browser) | Open `/concept2cure/login`; click *Demo Access*; observe redirect | Login page renders; the shell renders after Demo Access |
| OQ-PROJ-03 | URS-PROJ-002 | scripted | `POST /api/c2c/projects` without `name`; with `programType:"not-a-type"` | Both 400 naming the field |
| OQ-PROJ-04 | URS-PROJ-002, 003 | scripted | Create an IND program | 201; UUID id; name echoed; intake reports scaffolded document and canonical submission |
| OQ-PROJ-05 | URS-PROJ-003 | scripted | List programs; read by id | Listed; detail matches |
| OQ-PROJ-06 | URS-PROJ-004 | scripted | `GET /:id/activity`; `GET /api/c2c/actions/verify-chain` | ≥1 attributable entry; chain `ok:true` |
| OQ-PROJ-06b | URS-PROJ-004 | scripted | `GET /api/audit-trail/ledger` | ≥1 entry carrying record/previous hashes on the ledger surface's read model, and the server's chain verdict `meta.chain.ok = true` (v0.2) |
| OQ-PROJ-07 | URS-PROJ-005 | unscripted (browser) | Open `/concept2cure/projects` | Program name visible; screenshot |
| OQ-PROJ-08 | URS-PROJ-005 | unscripted (browser) | Open `/concept2cure/project-home` with the program selected | Program name visible; screenshot |
| OQ-PROJ-09 | URS-PROJ-006 | scripted | `POST /api/tasks/tasks`; `GET /api/task-management/board` | 2xx; task on the board |
| OQ-PROJ-10 | URS-PROJ-006 | unscripted (browser) | Open `/concept2cure/tasks` | Task title visible; screenshot |
| OQ-PROJ-11 | URS-PROJ-007 | ad-hoc | `GET /api/program-journey` | 200 with `data[]` |
| OQ-PROJ-12 | URS-PROJ-007 | ad-hoc (browser) | Open `/concept2cure/filings-catalog` | Renders; screenshot |
| OQ-PROJ-13 | URS-PROJ-008 | scripted | `GET /api/module-subscriptions/navigation` | `launchScope.enforced=true`; `rbm` locked by `launch-scope`; six launch surfaces entitled |
| OQ-PROJ-14 | URS-PROJ-008 | scripted (browser) | Open `/concept2cure/rbm` | "Not in this release" gate; screenshot |
| OQ-PROJ-15 | URS-PROJ-009 | scripted | `GET /api/c2c/projects/<random uuid>` | 404 |

## 4. Acceptance

All scripted steps pass; unscripted/ad-hoc observations reviewed and accepted by the reviewer; no `fail` without a change request (VMP-001 §6).

## 5. Result of the local execution (2026-09-21)

See the record. Summary: 13 pass, 2 fail, 1 deviation. Fails: OQ-PROJ-06 (audit chain verifier answered 409 `ok:false`, broken at an audit_logs row — VSR-001 finding F-1) and OQ-PROJ-06b (audit ledger surface read model `audit_events` empty — finding F-2). Deviation: OQ-PROJ-11 (IQ-DEV-001).

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
