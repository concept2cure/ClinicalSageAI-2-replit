# The CMC compliance engine cites current ICH revisions and judges validation at the program's stage

Row **D2**. Discovery map 2026-10-04: `cmc-engines-phase-agnostic-stale-ich`
(P1).

## The defects

1. **Superseded revisions.** The ICH compliance report checked against
   **Q2(R1)** and **Q9**. Q2(R2) and Q14 replaced Q2(R1) at Step 4 on
   2023-11-01; FDA issued both as final guidance in March 2024. Q9(R1)
   replaced Q9 on 2023-01-18. The superseded codes appeared as the report's
   guideline keys, in every Q2 citation, and in the control-strategy, QbD,
   SUPAC, stability-flow and war-game texts.
2. **Stage-blind validation.** The Q2 rule failed every method without
   "validated" status, at any stage. A first-in-human IND whose methods are
   shown suitable but not yet fully validated is compliant: FDA expects no
   validation data for an original FIH phase 1 IND, and the EU asks at phase 1
   that suitability be confirmed and the validation parameters tabulated. The
   rule put a **FAIL** on exactly that dossier.

## The fix

- **The list.** `ich-compliance-rules.ts` now holds the checked guidelines as
  one runtime list, `ICH_GUIDELINES_CHECKED`, at the revision in force. The
  report's status map is built from it, so the two cannot disagree.
- **The currency test.** `ich-compliance-currency.test.ts` refuses any code that
  the CMC regulatory record (slice 07) does not hold as `final`. It also
  refuses any finding a rule makes against a guideline not in the list.
- **`program-stage.ts`** reads the program's stage. It never assumes one.
  - The application comes from `regulatory_programs.program_type`.
  - The phase is the highest one the program's study designs record
    (`cdisc_prm_studies`, tenant-scoped). "Phase 1/2" counts as 2.
  - No recorded phase reads `phase: null`. A failed read marks the `stage`
    input unavailable.
- **`ich-compliance-q2.ts`** is the Q2(R2) rule, judged at that stage. Its
  citations come from the record (`cite('ich-q2-r2')` gives
  `ICH Q2(R2) (2023-11-01)`).

  | Stage | Shown suitable (qualified) | Neither validated nor suitable |
  |---|---|---|
  | Marketing application | **fail** | **fail** |
  | IND, phase 1 | pass | warning |
  | IND, phase 2 or 3 | warning (a validation summary is expected) | warning |
  | IND, no phase recorded | warning, saying so and asking for the phase | warning |
  | No application recorded | fail, saying the marketing standard was applied | fail |
  | Stage could not be read | not evaluated | not evaluated |

  The missing-characteristic check (specificity, linearity / range, accuracy,
  precision) runs where validation is expected, not at phase 1.
- **Other texts.** Every other CMC text that told a user to validate per Q2(R1)
  now says Q2(R2):
  - control strategy and QbD gaps;
  - the SUPAC method-change requirement;
  - AnA's scoped CMC rule;
  - the stability intelligence flow and the war-game stability auditor;
  - the pdev activity registry;
  - the Lumen guideline list;
  - the legacy CMC blueprint, workflow and playbook routes.

  The historical CRL trigger patterns keep Q2(R1), because those letters cited
  it.

## Red, then green

- **The old behaviour** (`red-old-codes-and-stage-blind.txt`). Run with the old
  codes in the list and the stage ignored, 6 tests fail:
  - `[ 'Q2(R1): not in the record', 'Q9: not in the record' ]`;
  - findings against codes outside the list;
  - a phase 1 IND with qualified methods getting `Q2_UNVALIDATED_METHODS` fail
    where `Q2_OK` was expected;
  - phase 2/3 and an unrecorded phase failed where a warning was expected.
- **The stage read is the sponsor's** (`red-stage-read-unscoped.txt`). With the
  organisation filter removed, the tenancy test fails:
  `expected { application: 'marketing', … } to be null`. Another organisation's
  program type and phase would have been read.

  An earlier version of this assertion searched the report for the foreign
  stage. It passed with the filter removed, because the report never reaches the
  stage when the foreign methods read is blocked. It now calls the reader
  directly.
- **Green** (`green.txt`): 5 files, 122 tests. These are the currency test, the
  tenancy test (now with program and study tables, and asserting the caller's
  own stage is read), the existing rule tests and the SUPAC test. The broad run
  of every suite touching the changed engines and AnA-RI passed 1,708 tests.
  The only failures were the 15 in `mdx-esg-transmit-gateway.test.ts`, which
  fail identically on clean trunk (run with this change stashed).
- **Lint.** The ESLint ratchet is net −2 warnings
  (`ich-compliance-rules.ts` 2 → 0).

## Not yet

- The stage needs a recorded phase. Programs with no study design carry `null`
  and get the "record the phase" warning. The intake wizard does not yet ask
  for a phase.
- Other stage-dependent CMC rules (stability data expectations at phase 1 and
  phase 3, specification finality) are still stage-blind. Q2 was the one that
  produced a false FAIL. The others are next on the same `ProgramStage`.
