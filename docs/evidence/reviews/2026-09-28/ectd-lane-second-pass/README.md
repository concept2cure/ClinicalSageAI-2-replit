# 2026-09-28, second pass — eCTD / Submission Center lane, four lenses

**Read `../README.md` first.** The canonical weekly review for this date is the
six-lens sweep in the parent directory, run at `aff7eae16` across all six launch
apps with 15 agents and a separate refuting agent per blocker/high/medium
finding. This directory is a **second, deeper pass over one lane only**, run
concurrently and independently by another session at `c1cd656b2`, and filed
beside it rather than merged into it.

The two passes were written without knowledge of each other and **their findings
do not overlap at all** — checked, not assumed. The parent's Part 11 findings are
the QMS AnA tools (`retire_qms_document`, `revise_qms_document`) and Gateway
Transmittals' §11.50 manifestation; this pass's are the Freeze button's gate
verdict and the tenant-isolation gate's table coverage. Neither pass found the
other's defects.

Both exist because the 2026-09-24 review recorded this debt against itself:

> *"Authoring, Submission Center and Readiness were not swept under Part 11 or
> honest state, and the design-system lens did not run anywhere, so the next
> weekly review owes those first."*

Seven of that run's eighteen agents had stopped on session limits; 2026-09-26
was security-only. Two sessions independently picked up the same debt on the
same day. That duplication is itself worth recording — it is what the launch
doc's "one control-tower session, at most four scoped workers" rule exists to
prevent, and it was not coordinated.

- **Head reviewed:** `c1cd656b2` (`concept2cure-v2`, 2026-09-28).
- **Scope:** the eCTD / Submission Center lane, diffed against the last full
  four-lens review. All four lenses invoked by name from `.claude/agents/`,
  read-only, each given the prior report first so it re-verifies claimed
  closures adversarially rather than re-reporting known findings.
- **Rows informed:** D4 (validation package — periodic review is a validation
  activity), D6 (security posture). **No row turns green.**
- **Also run:** `npm run build` → exit 0.
  `scripts/verify-submission-center.mjs` could **not** run — it needs a live
  DB-backed server and credentials. That check belongs to staging, owed with D1.

| File | Lens | Outcome |
|---|---|---|
| `part11-ux.md` | 21 CFR Part 11 | **1 BLOCKER, two halves.** P11-28a (Freeze) fixed here; P11-28b (Dispatch) reported, not fixed |
| `honest-state.md` | honest state | no findings; five gates/suites run, not asserted |
| `design-system.md` | design system | no gate failures, no deltas; 1 advisory (DS-01) |
| `security.md` | security & tenant isolation | lens: no new findings, DP-37 verified closed. Follow-through: **DP-41 fixed, DP-40 filed** |

---

## What this review changed

**P11-28a — the Freeze button was gated on the dispatch verdict.** The server
computes two verdicts (`gate` for dispatch, `freezeGate` for freeze) precisely
because requiring a release signature to freeze inverts the product's order. The
client typed and read only `gate`. For IND / NDA / BLA / MAA — every type the
control exists for — a `validated` sequence with no release signature had
`gate.cleared === false` while `freezeGate.cleared` was `true` in the same
response, so the Freeze button never rendered and the sequence could not leave
`validated` through this screen.

The server half was fixed when `composeDispatchGatesForStep` landed. The client
was not, and nothing failed, because no test asserted the button ever renders —
the existing fixture carries only the always-blocked case, green either way.
Fixed, with `freezeGate`/`releaseSignature` added to the client type and four
new tests.

**DP-41 — the tenant-isolation gate did not cover this lane.**
`TENANT_SCOPED_TABLES` held no submission table. DP-37 was caught only because
it read `vault.documents` and `documents` was in the set. The lane carrying
§11.70 signatures and assembled filing content had no gate — only a weekly
manual sweep. Five tables added, coverage proven by an injected read that the
gate ignored before and fails on now.

**The tenant-isolation baseline ratcheted 9 → 8**, closing a free slot, with the
freed row dispositioned in `docs/reports/tenant-isolation-justifications.md`.

## What it deliberately did not change

- **P11-28b (Dispatch)** has the same shape one step later: the dispatch-intent
  signature that `gate` requires is created inside the click handler of the
  button `gate` hides. Fixing it by rendering the button and letting the server
  refuse would record a signature before the gate is evaluated — a §11.70
  consequence, so a control-tower decision, not a review cleanup.
- **DP-40** — a cross-tenant aggregate count behind `GET /api/mdx/health`. MDX
  is outside the launch catalog (RULE 2) and the remedy is that lane's call.
  Filed with the exact evidence and the one-line fix, and the sixth table it
  blocks is held out of the gate with that reason written where it would be
  added — so it is closed deliberately, not rediscovered.
- **DS-01** — the folded orchestrator panels in `EctdCompile.tsx` use a
  "big stat" idiom the rest of the file does not. That idiom is already
  duplicated in three other v2 surfaces with no shared primitive, so the fix is
  a `StatBlock` across all four call sites; spot-fixing this file would make a
  fifth copy.

## Two things the lenses got wrong, and how

Recorded because a review that reports only its findings hides its own error
rate.

1. **The design-system lens inferred that nothing enforces
   `ui-surface-registry.ts` ↔ `SURFACE_VIEWS` alignment.** Its structural
   correction was right (they are two files, not one driving the other — and
   the charge, which said otherwise, was mine and wrong). Its inference was not:
   `scripts/ci/check-launch-scope.mjs` enforces both directions, rules 1 and 2c.
   Checked rather than filed; both gates pass.
2. **The security lens attributed the gate's "1 previously-flagged finding
   resolved" to DP-37.** It was `admin/licensing-history.ts`. DP-37 was never in
   the baseline — it was a finding *above* it, which is why the gate failed
   outright on 2026-09-26.

Every load-bearing claim in these reports was re-verified at head by the
reviewing session before being acted on.

## Falsification

Every fix here was shown failing first. Eight probes across this review and the
RAG-attribution change earlier in the session; each reverted, each failing only
the test that exists to catch it.

One is worth naming. The "no crash on a payload missing `freezeGate`" test
**passed with the guard removed.** Without `?.` the component throws mid-render,
React discards its output, and "no Freeze button" is then true for the worst
possible reason — vitest reports the throw as an unhandled error, warns that it
*"might cause false positive tests"*, and passes. The test asserted the symptom
of the crash and called it fail-closed. It now captures `console.error` and
fails on the TypeError.

Two more probes in this session's earlier work had the same shape: a fake error
whose `name` did not match what the detector keys on, and a fixture named
`REGION_FIXTURE` when the detector keys on a `FIXTURE_` **prefix**. A probe that
does not reproduce what the check keys on proves nothing, and reads exactly like
a passing gate.

## Coverage — what was not reviewed

Stated because "four lenses ran" is not "the lane is clear".

- **Separation of duties (signer ≠ author)** on freeze/dispatch —
  `governedSignatureVerdict` checks target, intent, replay and digest binding;
  no author-vs-signer check was found there and none was traced elsewhere.
  Plausible, unconfirmed. **Owed a dedicated pass.**
- `submission-package-orchestrator.ts` internals (3,432 lines) beyond the call
  chains these surfaces invoke.
- `regulatorySubmissions.ts` and `ectd-export.ts` under the Part 11 lens.
- DP-36, DP-38, DP-39, IAM-19 — carried unchanged from 2026-09-26, **not**
  re-verified; their files are outside this lane.
- No live database and no deployed environment: both migrations were read
  against RULE 1's new constraint-replay corollary, not executed.
- a11y and microcopy lenses — not named in the weekly four, not run.
- Everything outside this lane. Authoring and Readiness, also named in the
  2026-09-24 debt, remain unswept under Part 11 and honest state.
