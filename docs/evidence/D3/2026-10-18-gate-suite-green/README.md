# D3: the tenant-isolation gate suite is green on trunk, 2026-10-18

**Row:** D3 — Tenant isolation proven. **Lane:** trunk-red triage on the D3 gates,
unclaimed on `docs/work-orders/README.md` at the time of this session (29 claimed,
9 done, 2 blocked — none covering these two). **Base:** `15578388`.

Two of the thirteen tenant-isolation gates were red on trunk. Neither was a live
cross-tenant leak; both were the gates doing their job and being left red, which
is the state in which a real finding arrives and is not noticed.

## What was red, and what it was

| Gate | Red because |
|---|---|
| `ci:tenant-isolation:no-regression` | 1 NEW finding above a baseline of 0: two raw `UPDATE vault.documents … WHERE id=$2` in `server/services/ana/__tests__/support/draft-source-tool-v2-controls.ts`, neither carrying a tenant term nor a marker. |
| `ci:tenant-isolation-justifications` | All five rows in the "Justified entries" table of `docs/reports/tenant-isolation-justifications.md` named files no longer in `tenant-isolation-baseline.json` — which has been `fingerprints: []` since 2026-10-14. |

Three further gates read red before this session and were **not** defects:
`ci:ai-tenant-binding` and `ci:db-test-isolation` could not resolve `typescript`,
and `ci:purge-coverage` could not resolve `pg`, because this container's
`node_modules` was incomplete. `npm ci` turned the first two green.
`ci:purge-coverage` then refuses for a different and correct reason — it measures
a live schema and there is no `DATABASE_URL` here, so it fails closed rather than
passing on nothing. It is **not** addressed by this change and is not claimed as
green.

## The changes

### 1. The fixture's own UPDATEs are marked, not allowlisted

`draft-source-tool-v2-controls.ts` is test support, imported only by
`draft-authoring-document-tool.pglite.integration.test.ts`. Both statements
mutate **the suite's own seeded document, by primary key, in an in-process PGlite
database**. The first deliberately corrupts `extracted_text` to prove the
authoring tool refuses to draft from a source whose text no longer matches its
recorded hash — an anti-fabrication control — and the `finally` restores it.

Two inline `// tenant-isolation-safe:` markers, each stating that. Per-site
rather than a file allowlist entry, which is what the gate's own header prefers
and what the 2026-09-28 `licensing-history.ts` retirement in the justifications
report chose for the same reason: an allowlist entry would also cover every
future query added to the file.

### 2. The five frozen justifications are retired

The gate's instruction is to move such a row to "Resolved (no longer in
baseline)". Rather than move five rows as-is, each was re-checked at `15578388`,
because a row is a claim about code and these were written between 2026-09 and
2026-10:

| File | How it actually closed |
|---|---|
| `kernel-observability.ts` (4) | **Fixed.** Org required and validated positive (`:58-59`); both aggregates `WHERE organization_id = $1` unconditionally (`:71`, `:80`). |
| `deep-research-orchestrator.ts` (1) | **Fixed.** `getJobStatus(jobId, organizationId: number)` (`:414`), predicate unconditional. |
| `kernel-adaptive-policy.ts` (1) | **Fixed.** `AND organization_id = $3` (`:108`). |
| `module-access-requests.ts` (1) | **Dispositioned inline** — 1 marker. |
| `advancedRAGPipeline.ts` (1) | **Dispositioned inline** — 4 markers. |

Three were fixed rather than blessed, which is why the table is now empty rather
than shorter. The table keeps its heading and says so, with the baseline file and
date, so the next reader does not read an absent table as an unwritten one.

## Proof — each gate shown failing first

| Stage | Result | File |
|---|---|---|
| A: `no-regression` at HEAD | FAIL — 1 new finding above baseline 0 | `red/A-no-regression-at-HEAD.txt` |
| B: `justifications` at HEAD | FAIL — 5 rows for files no longer in baseline | `red/B-justifications-at-HEAD.txt` |
| M1: one marker removed again | FAIL — same fingerprint `#9858288a1a14:documents` | `red/M1-one-marker-removed.txt` |
| A′: `no-regression` after | OK — 0 current, 0 baseline; 45 suppressed (was 43) | `green/A-no-regression-after.txt` |
| B′: `justifications` after | OK — baseline empty; 88 inline suppressions, each with a reason | `green/B-justifications-after.txt` |
| C: all 13 tenant gates | 12 PASS; `ci:purge-coverage` needs a live database | `green/C-full-gate-suite.txt` |

M1 is the control that matters: it shows the markers are what closed the finding,
not something incidental to the same edit, and that the gate re-detects the exact
fingerprint when one is taken away.

`draft-authoring-document-tool.pglite.integration.test.ts`: 31/31 after. The
change to that file is comments only.

## Also done in this session, before the work

The container's local `concept2cure-v2` was a stale lineage: tip 2026-10-09,
103 commits that are not on origin, and a tree differing from origin by
**+174,022 / −2,247,177 lines across 11,914 files** — origin holding 1.87M more
lines under `docs/` and 222K more under `server/`. None of those commits came
from this session. It was reset to `origin/concept2cure-v2` (RULE 0: one branch),
and the discarded tip is preserved at tag `local-backup-20261018`
(`275707c7a3192e0bae02eb2f83ff1181bbb7dece`) in case any of it is wanted.

The session also began checked out on `claude/cross-tenant-prompt-cache-leak-d0i9ll`,
which RULE 0 forbids; work was moved to `concept2cure-v2` before anything was
committed.

## Not done

- `ci:purge-coverage` — needs `DATABASE_URL`. Untouched, still red here, red for
  the right reason.
- The D3 row's "staging run is owed with D1" remains owed; it depends on the AWS
  account, which is the founder's.
- `docs/LAUNCH_DEFINITION_OF_DONE.md`'s D3 text still reads
  "`search_atoms_hybrid` fails on every install built from empty … handed on".
  That was closed on 2026-09-24 under D4 (`docs/evidence/D4/2026-09-24-atom-search/`).
  The stale sentence is left for D3's own row owner rather than edited from this
  lane, but it cost this session a detour and will cost the next one the same.
