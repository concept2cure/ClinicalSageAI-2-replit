# The launch boundary, re-proved after the catalog changed (D2, D5; 2026-10-15 → 2026-10-22)

Session `…01E8btkB`. Board row: "D2 / D5 — re-proof of the launch boundary
after the catalog changed (P-28 CMC, P-32 IND lifecycle, P-33 Readiness in
Submit)" in `docs/work-orders/README.md`.

## Why

The launch catalog changed three times in a week. CMC / Module 3 joined with
a composition boundary (P-28). The IND lifecycle and forms became features of
Submission Center (P-32). Submission Readiness moved into Submit (P-33). Each
change added or moved claims in the surface registry, and a claim decides
what production serves. The boundary proved on 2026-09-25
(`docs/evidence/D2-API-SCOPE/2026-09-25/`) was no longer the one in force.

## Method

Measured, not reasoned:

1. **Route inventory.** Every route production mounts, with its launch-scope
   verdict, taken from the running registration in production posture on a
   database migrated from empty (`scripts/ci/launch-scope-route-inventory.ts`).
2. **Called paths.** Every API path a launch or shell screen's code names
   (`scripts/ci/check-launch-scope-api.ts --list`).
3. **Finders.** A read-only finder classified each candidate (workflow
   `wf_bdb3bd90-a37`). Candidates were launch-served sub-namespaces no launch
   screen calls, launch-served file downloads, and the CMC entry points.
4. **Skeptics.** Three per finding, each trying to refute it. A finding
   stood only if at least two did not refute it. The finders' run lost 250 of
   338 agents to a session limit, so every family was re-verified, with three
   fresh skeptics each and no failures (`reverify-result.json` in the session's
   scratch, summarised here).
5. **Fix only what stood, failing first.** Files another lane had touched in
   the last 24 hours were handed on, not edited.

**103 of 106 findings stood.**

## Results

| Area | Upheld | Done | Evidence |
|---|---|---|---|
| Launch claims wider than what launch uses | 79 | All 79 no longer served. 65 by narrowed claims, 14 through `LAUNCH_EXCLUDED_API`. 120 of 3,358 routes changed verdict, all under the 79 | `api-scope/` |
| A launch screen refused (found while measuring) | 1 | The IND applicant-identity screen's sponsor records, `/api/ind-master-data/sponsors` | `ind-sponsors/` |
| Downloads delivered with no record (D5) | 12 | All 12 recorded before delivery, with the SHA-256 of the bytes and refused without the row | `docs/evidence/D5/2026-10-22-ind-documents-recorded/` |
| CMC entry points outside the composition boundary | 12 | 9 fixed, plus the submission-package orchestrator, found by this change's own review. 3 wait on another lane's window (below). 3 more were refused by the skeptics as neutral statistics | `cmc-boundary/` |

The CMC change found two older defects on the way, both a `SAVEPOINT` on a bare
pool. The Module 3 board had never listed its 3.2.R section, and AnA's 2.3
Quality Overall Summary failed for every program since 2026-10-12. An
adversarial review of the change upheld 16 of its 20 findings, and all 16 are
fixed (`cmc-boundary/README.md`).

## Still open

- **AnA's `estimate_recorded_shelf_life`, `assess_recorded_batch_poolability`
  and the `answer_intelligence_question` CMC flows** are not yet behind the
  composition boundary. `server/services/ana/AnaToolExecutor.ts` was edited by
  another lane at 2026-10-22T00:12Z. The work is scheduled for 2026-10-23T00:20Z,
  and `composition-boundary-callers.contract.test.ts` names both tools with an
  expiry of 2026-10-24, so the deadline cannot pass quietly.
- **Tests red on trunk, found while validating,** are handed on in
  `docs/work-orders/README.md` under "Found by the launch-boundary re-proof".
  That includes an ordering defect in the same file's 00:12Z change: a reason
  is asked for a hidden tool before launch scope refuses it.
