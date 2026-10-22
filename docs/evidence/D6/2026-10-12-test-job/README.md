# D6 — the Test job's remaining red files, 2026-10-12

Trunk's Test job was red on 27 tests across four files. Two were repaired on
trunk by other sessions (`8db3eea1d`, `e64094813`). This directory records the
two this lane took.

## 1 · Part 11 signing authority on the Module 3 contradiction route

`red-green-signing-authority.txt` — §11.10(g) has one answer on this platform,
`checkSigningAuthority` (`server/services/part11/signing-authority-gate.ts`).
The Module 3 contradiction-resolve route read the role and applied the
predicate itself, so a role lookup that could not run fell to the catch-all and
the person was told the server had erred, where the one gate answers
`503 SIGNING_AUTHORITY_UNVERIFIED`. Fixed in `5ae08151f`.

## 2 · The founder-path lineage journey: the original IND's Module 3

- `red-founder-path-lineage.txt` — 6 failed / 9 passed at `8d5228bc2`,
  measured on an exported tree so it is a measurement of the commit.
- `green-founder-path-lineage.txt` — 15 / 15 with the change.
- `mutation-founder-path-lineage.txt` — the new refusal assertion failing on
  the case it exists to catch.

**One cause.** `4ad6118fc` (2026-10-11, D2) made Submission Readiness ask an
ORIGINAL IND for its Module 3: 21 CFR 312.23(a)(7). It reads the Module 1.4
cross-reference register for the files that may stand in for a heading. This
journey builds its database from migration files alone, and
`migrations/20260614_ind_cross_references.sql` is on no applier (it reaches a
deployed database through `shared/schema`'s push — one of the 112 files
`scripts/ci/migration-deploy-path-baseline.json` records), so the journey's
database did not hold the table. The register read failed, the validator
reported it as unreadable — fail-closed, correctly — and sequence 0000 was
refused `422 VALIDATION_FAILED`. Everything after hop 8 then had no transmittal
to walk back from, which is why one cause showed as six failures, the last of
them the journey's own schema-gap assertion naming the missing relation.

**The fix, in two parts.**

1. The journey's migration list gains that file, which is what its own failure
   message asks for: *"A journey whose database is smaller than the code under
   test proves less than it says it does."*
2. With the table present and empty, the product still refuses — and is right
   to: this journey files one clinical document into 2.5 and carries no 3.2.S
   or 3.2.P leaf. So hop 8 now asserts that refusal, naming both headings, and
   then clears it the second way 21 CFR 312.23(b) allows, through the real
   service behind `POST /api/ind-lifecycle/submission/:id/cross-references`: a
   Drug Master File on the Module 1.4 register, its Letter of Authorization on
   file. The journey proves the new gate instead of being broken by it.

The mutation records the refusal before the fix was in place: recording the
Drug Master File *before* the refusal is asserted leaves the product nothing to
refuse, and the assertion goes red with `expected 200 to be 422` — so the
cross-reference is what clears the gate, and the assertion is not vacuous.

**Not changed, and reported instead:** the rule counts a Letter of
Authorization as on file from `ind_cross_references.loa_on_file` alone. The
route that renders and files the LOA leaf (`registers.routes.ts:133`,
`POST …/cross-references/:id/file-loa`) sets that flag together with the m1.4.1
leaf, but `PATCH /cross-references/:id` can set it on its own. Whether the gate
should require the leaf and not only the flag is a product question for the
founder, not a lineage-journey change.

---

## Addendum, 18:20 UTC — trunk CI still cannot confirm any of this

Measured, so the gap between "verified locally" and "verified by CI" is on the
record rather than implied:

```
$ gh api ".../actions/runs?branch=concept2cure-v2&per_page=100"
queued / in_progress / pending      56
in_progress                          1
oldest queued                        2026-10-12T16:36:21Z  CI  2b023f68c
completed runs of workflow "CI"      0   (in the newest 100 runs on this branch)
newest completed run of ANY workflow 18:07, "Repo Health Baseline Refresh", cancelled
```

The single in-flight job at 18:20 was `Analyze (CodeQL javascript-typescript)`,
started 17:57. Every workflow in `.github/workflows` is `runs-on:
ubuntu-latest` — 58 job declarations, no self-hosted pool — so the serialisation
is the **account's GitHub-hosted concurrency limit**, not anything in this
repository. One job at a time, against six workflows per push and two sessions
pushing to the one canonical branch.

Two things this is NOT:

- It is not CI self-cancelling. `ci:required-workflow-concurrency` and its
  self-test exist precisely to keep a per-commit run on the canonical branch,
  and they pass. The only cancelled runs are `Repo Health Baseline Refresh`,
  whose own concurrency group is meant to collapse to the newest commit.
- It is not something a session can fix by pushing differently. Reducing push
  frequency reduces the inflow, but the queue drains at one job and the
  heavyweight scanners (CodeQL ≈45 min, Semgrep, Tier 5 Browser Smoke) sit in
  the same single slot as `CI`.

Raising the runner concurrency is a billing action on the GitHub organisation
and therefore the founder's, not a session's. Until it is raised, the honest
statement about any work from today is "verified locally, on the real gates and
a deploy-shaped database; not yet confirmed by trunk CI" — which is what the
evidence files say.
