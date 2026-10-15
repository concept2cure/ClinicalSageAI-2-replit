# Submission Readiness asks an original IND for its Module 3

Row **D2**. GA plan item 12 (decision 2026-10-05).

## The defect

The launch dispatch-readiness path computed its required-section context from
the **region profile's Module 1 codes only**, and reported those as
**non-blocking warnings**. The canonical IND required-section list
(`required-sections.requiredSectionProfileFor`, which carries Modules 2–5) was
never consulted on this path.

So an original IND sequence carrying Module 1 alone — no 3.2.S, no 3.2.P, no
CMC section at all — read **dispatch-clear**. 21 CFR 312.23(a)(7) asks the
initial IND for exactly that information.

This is also what made the CMC module optional in practice: Projects opens a
"Draft IMPD / CMC (M3)" task for every IND programme, and nothing downstream
ever asked whether it had been done.

## The fix

**`IND_MODULE3_REQUIRED`** (severity `error`, so it raises `readiness.errors`
and blocks the structural half of the hard dispatch gate).

- **The headings come from the one profile**, filtered to `m3`
  (`requiredSectionProfileFor`), with their ICH M4 titles — never a second
  list restated here.
- **Only an original US IND is asked.** Sequence `0000` always is; any other
  number only when it is typed `original` **and** no earlier live sequence of
  the same submission and region exists. The type column defaults to
  `'original'`, so a later sequence created without a type would otherwise be
  asked for an original's content and block a filing the agency accepts. An
  IND **amendment** is not asked, and neither is an NDA, nor an IND outside
  FDA.
- **What clears a heading:** a live non-delete leaf at or under it in this
  sequence (on a segment boundary — `3.2.S.4.1` is under `3.2.S`; `3.2.S1` is
  not), **or** a recorded cross-reference that names it with a **Letter of
  Authorization on file** (21 CFR 312.23(b), Module 1.4.1), read from
  `ind_cross_references` under the caller's organisation.
- **An empty `authorized_sections` covers nothing.** "The file in its
  entirety" names no heading, and which part of Module 3 a whole Drug Master
  File holds is not recorded — so it is not guessed.
- **A heading that stands on a cross-reference is reported**, as an info
  finding `IND_MODULE3_BY_REFERENCE`, so a clear verdict says what it rests
  on.
- **Fail closed on an unreadable register.** A cross-reference register that
  cannot be read is returned as `null` with its reason, never as an empty
  register; the finding stays blocking and says why no referenced file could
  be counted.
- **The remedy is a real path.** The finding tells the reader to place
  Module 3 from the CMC module ("Place into the submission"), or to record the
  cross-reference with its LOA, and then says what the register already holds
  that did not clear the heading — a file recorded without an LOA, or one with
  an LOA that does not name the heading.

Both finding codes are catalogued in the validation rule corpus with their
rationale and source, which the corpus ↔ gate invariant test requires.

## Red, then green

- **On the pre-change code** (`red-before.txt`): **14 of 48 fail** across the
  three suites.
  - The real-database case "Module 1 only: blocked on both gates" fails — on
    the old code that sequence was **clear**, which is the defect itself.
  - The corpus invariant fails: the gate could emit a finding code the corpus
    did not catalogue.
- **After** (`green-after.txt`): **48 pass**.
  - `assess-dispatch-readiness.original-ind-module3.pglite.test.ts` (8 cases,
    real schema): Module 1 only blocks on both gates with one error per
    missing heading; placing Module 3 in that sequence opens the gate; a
    cross-reference with its LOA stands in and says so; no LOA, no named
    section, or **another organisation's** record still blocks, and the
    finding says which; an amendment and a later sequence typed `original` by
    the column default are not asked; the first sequence is asked whatever its
    number; another application type is not judged; an unreadable register
    stays blocking.
  - The pure cases in `assess-dispatch-readiness.gates.test.ts` pin the
    heading source, the original-sequence rule, the segment-boundary match,
    the delete-leaf case and the LOA rule.
- **Wider run.** Every eCTD suite passes: 88 files, 1,080 tests. The ESLint
  ratchet reports no file with more warnings than before (net −6 across the
  change).
