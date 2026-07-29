# Journey C — Health-authority challenge → governed correction

**Test:** `tests/golden-journeys/haq-correction.journey.test.ts` · **Status:** phase 1 PASSING (14 steps: 10 ok, 4 blocked-as-expected, 0 failed)

The first end-to-end traversal of the correction spine — the chain the strategy
material calls the moat — against canonical DDL. Until this journey existed,
no user and no test had ever executed it (`/api/resolution` is client-dark and
the old unit tests mocked the database).

## The spine

| # | Step | Proves |
|---|---|---|
| 1 | register-conflicting-assumptions | real assumption registry writes (deployed shape) |
| 2 | detect-assumption-drift | deterministic finding, `llmRole='none'` — structured truth, no LLM authority |
| 3 | record-proposed-decision | governed decision in `proposed` state |
| 4 | **promotion-blocked-while-unresolved** | fail-closed gate fires; denial is itself audited |
| 5 | create-resolution-plan | plan from the finding (`supersede` path) |
| 6 | create-bundle-from-plan | bundle + items derived from plan |
| 7 | propose-bundle | state machine: draft → proposed (execution runs from `proposed`; human approval comes AFTER, at pending_review → approved) |
| 8 | execute-bundle | REAL supersession + hashed receipt (`receiptId`, sha256) |
| 9 | verify-receipt | hashes intact; supersession resolves `matches-snapshot`; no status field read as proof |
| 10 | human-reapproval | bundle approved, old assumption superseded, new one approved, finding resolved, decision executed INTO a linked artifact |
| 11 | **promotion-clears-after-correction** | gate allows; audit trail holds both the denial and the grant |
| 12–13 | **cross-tenant access** | receipt verifier and finding lookup return null for another org |
| 14 | **execute-nonexistent-bundle** | honest error, not silent success |

## What the journey caught while being built

Building this journey surfaced and fixed a false negative in the proof layer
itself: the executor records `supersededObjects` as `objectType:objectId`, and
the receipt store's snapshot lookup queried the raw string — so a real,
confirmed supersession recorded as `was-missing-at-execution`. Exactly the
class of defect WO-01 exists to surface. Also recorded as an observation:
assumption supersession has two durable representations (`supersession_records`
via the executor; `assumption_records.status` via the registry) — the
human-reapproval step closes that loop explicitly, and unifying them is flagged
for the ADR-0008-adjacent cleanup.

## Known limitations (from the manifest)

- Service-level: HTTP/auth and UI layers are phase 2 (dev-login route journeys,
  then Playwright).
- HAQ intake (question → challenge) is represented by the reviewer-sourced
  assumption; wiring the HAQ service is phase 2.
- Study Twin / evidence retrieval steps not yet included.
