# Device titles: plantar, planar and plane are not plans; a mixed-case IFU is the IFU (F1, 2026-11-01)

**Residual.** F(2) in `../../2026-09-22/README.md` ("Device title matching"), re-checked open at HEAD
`5f30fdda0d`. It is a regression from this session's `2364f546dd`. That change replaced the
technical-file matcher's case-insensitive substring match with a tokenizer, and two kinds of Vault
title then left a required slot empty:
- **A word that only begins with "plan" was read as a plan.** `Clinical_Evaluation_Plantar_Insole_v2`
  left the CER slot empty, and `Performance_Evaluation_Planar_Waveguide_Assay` left the PER slot
  empty. The V&V plan guard added by `e6f80d7577` (2026-10-05) did the same to a "plantar insole"
  biocompatibility report.
- **A mixed-case IFU was split at its case change.** `IfU_EN_rev3`, `iFU_v3` and `eIfU_DE` were each
  split into two words, so none filled the IFU slot.

An EU MDx client who built a technical file from Vault saw it reported not ready, with plainly
uploaded documents missing. The matcher failed closed: nothing was fabricated. But it is the gap a
human tester would hit first.

**What already exists (RULE 3).** `server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts` is
the one MDR/IVDR Annex II/III slot matcher. It is used by:
- the technical-file packager;
- the assemble-from-core path;
- the submissions routes' coverage;
- the device cockpit;
- the EU tech-doc advisor.

No other matcher exists. The fix completes this one; it adds no file.

## The fix

1. **What counts as a plan.** `isPlan` keeps the fail-closed prefix rule: any word beginning with
   "plan" is a plan, including a file-name tail glued on (`Planv2`, `planrev3`). The exception is a
   closed list, `NOT_A_PLAN` = plantar, planar, plane and planes. The CER/PER qualifier and the V&V
   guard both read it.
2. **A plan for a plantar, planar or plane device is still not its report.** The qualifier reads only
   the word right after the phrase. The exemption therefore let
   `Clinical_Evaluation_Plantar_Insole_Plan_v2` fill the required CER slot; this was found by the
   adversarial re-check after the first repair round. `A_PLAN_FOR_AN_EXEMPT_SUBJECT` keeps such a
   title out of the CER and PER slots. It applies only to titles that hold an exempt word, so other
   titles behave as at HEAD. *Known and left, pre-existing at HEAD:* `Clinical_Evaluation_Knee_Insole_Plan_v2`
   still fills the CER slot. Closing it changes behaviour outside this residual (it would also catch
   "Clinical evaluation protocol"), so it is a separate decision.
3. **Mixed-case IFU.** The tokenizer's first step reads an IFU written in any case, at the start of a
   word or after a lower-case letter, as one word. It is never matched inside a word (`Gifu`,
   `bifurcation`, `Shifu`), and not where its "U" starts a camel-case word (`IfUpdated`,
   `checkIfUnchanged`).

## Review

Two adversarial lenses reviewed the first patch, and both found a blocking issue:
- **Proof.** A whole-word plan list failed open for `Planv2`.
- **Correctness.** The commit attributed the V&V guard to the wrong commit.

A repair round fixed both. A re-check then found the plan-after-the-exempt-word case. That fix and
its pin were applied here and shown failing first (`mutant-exempt-subject-guard-removed.txt`).

**Accepted, non-blocking.** An "If" followed by an all-capital U-word reads as the IFU: `IfUS_market`,
`iFUNCTION_manual`. Neither is a plausible technical-file title. `IFUGSPR` now also fills the GSPR
slot, as the substring match did before `2364f546dd`.

| Run | File | Result |
|---|---|---|
| Red, against HEAD `5f30fdda0d`'s matcher | `red-first-at-head-5f30fdda0d.txt` | 5 red: CER/PER on a plantar or planar device; V&V on a plantar or planar subject; mixed-case IFU; a plan glued to an IFU; the Vault MDR set |
| Green | `green.txt` | 53/53 |
| Mutant: the exempt-subject guard removed | `mutant-exempt-subject-guard-removed.txt` | the new pin goes red |
| 15 further mutants, each one clause reverted | `implementer-round/mutants/` | each killed |
| Differential fuzz (HEAD vs repair) | `implementer-round/fuzz.txt` | no slot HEAD filled is dropped; every difference is a gain, as designed |
| Downstream: 25 technical-file suites | `green-downstream.txt` | 319 pass. 1 fails, `assemble-technical-file-vault-uuid.pglite` (`company_legal_registry` missing from its fixture); it fails identically at HEAD |
| Lint | `eslint.txt` | 0 errors. The one warning (an unused `match`) is also at HEAD |
