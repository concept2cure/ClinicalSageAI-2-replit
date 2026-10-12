# A fixture that predated 21 CFR 312.23(a)(7) held 11 tests red

**Row:** D5 (the governed submission path, and its proof actually running).
**Session:** `…01P6GWSv`. **Date:** 2026-10-12. **Found by** running the full
vitest suite locally at HEAD rather than waiting on a queued CI run.

## Why it was run at all

This lane had reported the Test job's red as cleared after fixing 17 failures.
That was not checkable from the stale CI run, and the number did not add up: the
job had reported about 25. `vitest.config.ts` excludes `**/*.dbtest.ts` (those
belong to `vitest.db.config.ts`), so the main suite needs **no Postgres** and
could be reproduced here. It was: **27 failed, 46,770 passed, 5 files**.

So the earlier "cleared" was wrong, and this is the first of the five files.

## What was wrong

`sequence-validated-honesty.pglite.test.ts` — **11 failed, 3 passed.**

`dispatch-readiness.ts` requires an original IND to carry Module 3: the headings
`3.2.S` and `3.2.P`, each satisfied by a leaf at or under it. The rule is right,
and its finding is unusually good — it cites **21 CFR 312.23(a)(7)** for the
obligation and **312.23(b)** for incorporation by reference, then names both ways
to clear it (place Module 3 from the CMC module, or record the Drug Master File
cross-reference with its Letter of Authorization in 1.14.1).

The fixture predated the rule. Every case that drove a sequence to `Validated`
now hit two errors it never placed leaves for.

**The same file had already solved this once.** It carries a `completeModule1()`
helper whose comment says: *"Since QA 2026-10-08 (j7) a missing one is a
validation error, so a sequence that is meant to validate cleanly carries
them."* A second regulation arrived and nothing added the second helper.

## The change — test file only; no production file is touched

- **`completeModule3()`**, mirroring `completeModule1()` directly above it, places
  `3.2.S` and `3.2.P`. Added at the 8 call sites where a sequence is meant to
  validate cleanly.
- **Two hardcoded error counts corrected, 7 → 9**, with the arithmetic written
  out (7 Module 1 + 2 Module 3) so the next regulation does not have to be
  reverse-engineered from a bare integer.
- **The negative case now pins the new requirement too**, which is inside its own
  stated subject ("an original IND missing a section the regulation requires is
  not Validated, and the refusal names it"): it asserts `3.2.S`,
  `21 CFR 312.23(a)(7)` and `21 CFR 312.23(b)` appear in the refusal.

That last point is the one that matters. Placing Module 3 in the fixture is only
legitimate if the rule stays tested — otherwise the repair would have silenced
the regulation instead of satisfying it.

## Proof

| | Before | After |
|---|---|---|
| The suite | 11 failed / 3 passed | **14 passed** |
| `submission-service/` + `ectd/` (regression) | — | **110 files / 1329 tests passed**, 1 file + 2 tests skipped |

**Shown still to bite.** With `originalIndModule3Headings()` forced to return
`[]` — the Module 3 requirement dropped from production — the suite fails **2 of
14**, on `expected … to match /found 9 errors/`. So the fixture satisfies the
regulation rather than hiding it. The diagnostic was reverted from a scratch
copy and `git diff --stat` confirmed `assess-dispatch-readiness.ts` clean.

eslint exit 0 on the changed file.

## Still open: four more files, 16 more failures

The first full run was captured with a `tail -120`, which retained only failures
12–20 — all in this file. The other four files are not yet named. A second full
run is underway capturing every `FAIL` line and a JSON record, and will be
triaged the same way: cause first, then take-or-hand-on by the 24-hour rule.

This file was last touched 2026-10-08 by `2b6bca73f` — the same session as the
four fixture causes fixed yesterday, and well outside the window.
