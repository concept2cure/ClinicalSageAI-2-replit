# Journey A — IND creation to governed submission package

**Test:** `tests/golden-journeys/ind-authoring.journey.test.ts` · **Status:** phase 1 PASSING (15 steps: 11 ok, 4 blocked-as-expected, 0 failed)

Phase 1 covers the authoring half of the master spec — project setup through
freeze and e-sign — at ROUTE level: the real `authoring.router` over HTTP with
**real jose-verified HS256 JWTs** (the router's own signature verification stays
fully active; a forged-secret token is a known-bad step).

## The spine

| # | Step | Proves |
|---|---|---|
| 1 | **create-doc-without-title** | honest 400 validation |
| 2 | create-document | flagship loop writes real canonical DDL (C-11 fix) |
| 3–4 | create-section, save (auto-revision) | revision trail on every content change |
| 5–6 | history, revert | attributed history; restore to any prior revision |
| 7 | comment + cite + list | annotation and source-trace records |
| 8 | **cross-tenant read** | outsider org gets 404, not data |
| 9 | **forged JWT** | wrong-secret token → 401 "Invalid authentication token" |
| 10 | create-pin | Part 11 PIN bound to the VERIFIED JWT identity |
| 11 | freeze | immutable snapshot + sha256, `doc_id` fix proven (freeze had never worked) |
| 12 | **wrong PIN** | 401, lockout counters live |
| 13 | e-sign (AUTHOR) | signature hash **independently recomputed** from durable section state |
| 14 | e-sign (APPROVER) | status → APPROVED + auto-freeze `approved` version |
| 15 | attribution evidence | both signatures carry JWT-verified signer emails |

## Fixed while building this journey

- The freeze `document_id` column bug — freeze had never been executable.
- Part 11 attribution: pin/freeze/sign identity now from the verified JWT, not
  the `x-user-email` header (freeze previously defaulted to `'system'`).
- Harness pool shim: node-postgres `rowCount` semantics (a rows-only shim made
  every handler that checks `rowCount` return 404).

## Open findings recorded (ledger C-11 residuals)

1. `electronic_signatures` shape conflict — e-sign INSERT fails on real
   deployments until reconciled with the push-surface table.
2. Freeze and signature hash chains are not linked — a signature cannot be
   cryptographically tied to the frozen snapshot it covers.

## Phase 2 (not started)

Structured protocol/design inputs, dossier readiness, eCTD compile → validation
→ release candidate; templates/checklists/exports; Playwright browser layer.
