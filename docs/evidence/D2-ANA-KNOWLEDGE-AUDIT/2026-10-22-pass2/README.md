# D2 — second citation review: 232 more confirmed errors corrected

Row **D2**. This pass was paused on 2026-10-22 for usage and resumed the same night.

## What already exists

This change corrects text and adds no capability. The 63 files are AnA's question flows, war-game auditors, the CER sub-node files, the core interview helpers (`issue-detector`, `governed-options`, `engine`) and `shared/regulatory/pathway-cautions.ts`. Every correction was made in place.

## Method

1. **Find.** `audit-workflow-pass2.js.txt` ran 44 finders over 22 file groups. Each group had two lenses: citations, and substance (clocks, thresholds, what is required). Finders were told to re-check the first pass's recall corrections. This produced 249 deduplicated candidates (`unverified-candidates.json`).
2. **Verify.** To save usage, each candidate went to one combined adversarial verifier, which read the text in context and judged the substance, defaulting to "not real". **233 were confirmed and 16 rejected** (`rejected.json`). One confirmation was dropped because its verifier reported a different file than the candidate's, which leaves **232** (`confirmed-findings.json`).
3. **Fix.** Seven fixers, each owning separate files, applied the corrections under the first pass's brief:
   - text only;
   - option values and question ids kept;
   - an uncertain pinpoint dropped rather than replaced.

**Every correction is recall.** eCFR, ich.org and fda.gov are not reachable from this environment. A number of the 232 correct text that the first pass itself rewrote from recall that morning.

## Red → green

- **Red:** `red-at-258a84cbf.txt` shows `tests/regulatory/ana-knowledge-audit.test.ts` "second pass" failing at 258a84cbf, with 229 of the 232 quotes present verbatim.
- **Green:** `green.txt` shows 5/5 passing, including the first-pass block, so no first-pass wording came back.
- **Wider checks:** `tests/ana-intelligence` and `server/services/ana/intelligence-questions` pass 30 files, 552 tests. Typecheck reports 0 errors, and the ESLint ratchet is unchanged across 40 files.

## Non-text changes

- **`issue-detector.ts`:** the Q1E extrapolation rule now fires above min(2× data, data + 12 months) instead of above 2× data. No flow asks its input today, so it cannot fire yet.
- **`flows/ind-submission.ts`:** the renal option *label* "minimal renal elimination (<30%)" is now "justified by elimination pathway and intended population". The value `not_needed` is unchanged.
- **`flows/bla-submission.ts`:** the periodic-report option labels (PAER / PBRER under waiver) are corrected. The values are unchanged.

## Where a fixer was unsure

Each fixer kept these to recall-level wording. Review them against the source when it is reachable:
- **CER sign-off:** cited to MEDDEV 2.7/1 Rev 4 §6.4 only.
- **MDR implantable definition:** Art. 2(5) is quoted as "clinical intervention".
- **PMA labeling:** the "FDA 89-4203" publication number is uncertain.
- **Cybersecurity guidance:** cited as "(current final version)".
- **ISO/TR 24971:2020:** Annex A is taken as hazard identification and Annex B as techniques.
- **eSTAR:** taken as not subject to RTA.
- **ICH Q1A(R2):** the semi-permeable and refrigerated sub-paragraphs were dropped to section level.
- **WHO technology transfer:** cited as TRS 1044.
- **Accelerated approval:** the 2024 draft guidance is named by topic.
- **ICH E2D:** Section 5.4 is used for follow-up, and other E2D pinpoints were dropped.
- **FDA benefit-risk guidance:** cited as final, October 2023.
- **ICH M11:** protocol title attributed to the M11 template with no section.
- **ICH E10:** cited as §§2.4 and 3.
- **EU RMP:** cited to Directive 2001/83/EC Art. 8(3)(iaa) and 104(3)(c).

## Noticed and handed on

- **`tests/regulatory/ich-e6r3-citations.test.ts` fails on trunk.** The cause is `server/services/ana/skills/library/clinical.ts`, a label reading "ICH E6(R3) structure and E6(R2) crosswalk". That file belongs to another lane and was added about 6 hours earlier, so it is held. The gate counts any "E6(R2)" that is not stated as superseded. The fix is either to word the label "the superseded E6(R2)" or to list the file in the gate's crosswalk allowance.
- **`issue-detector` pediatric DSMB rule:** its severity is still `critical`, while the text now says "should be considered". Lowering it is a judgement call for the rule owner.
