# D2 — one record of the elements of informed consent, read by every AnA path that teaches them (2026-10-15)

Lane `…session_01SuVLo2`. This follows the consent QC slice of 2026-10-08 (`docs/evidence/D2-ANA-CONSENT-QC/2026-10-08/`), which handed on the other copies of the consent elements.

## Before (measured at `5cd343ee5`)

A read-only map found that four AnA paths answered "what must my consent form contain?" from their own lists:

| Path | What it served |
|---|---|
| `review_informed_consent` (`gcp-consent.ts`) | Corrected on 2026-10-08. It still treated the 50.25(c) ClinicalTrials.gov statement as missing on every form, though 50.25(c) applies only to an applicable clinical trial. Its tool description claimed 45 CFR 46.116 coverage that it did not have. |
| `design_informed_consent` (`gcp-operations-knowledge.ts`) | Cited **"21 CFR 50.25(b)(7)", "(b)(8)" and "(b)(9)"**, which do not exist. That content is 45 CFR 46.116(c)(7) to (c)(9), Common Rule elements. It made 50.25(c) optional, decided by the study type. |
| IND war-game auditor (`ind-auditor.ts`) | Numbered the 50.25(a) elements wrongly ("(1) purpose, (2) procedures … (8) contacts and voluntary"), omitted the research statement and 50.25(c), and cited the 2014 draft consent guidance. |
| Protocol question flow (`flows/protocol-development.ts`) | Gave a partial list with no research statement, procedures, duration, voluntary participation, (b) or (c). |

`red/informed-consent-elements.txt`: **6 of 9** cases red. The 3 that pass are the new record's own checks and an ACT case that the old code also satisfied.

## After

`shared/regulatory/informed-consent-elements.ts` is the one record. It holds 22 elements, each with:
- its full statement;
- its 21 CFR 50.25 paragraph and its 45 CFR 46.116 paragraph;
- its applicability: required, when appropriate, applicable-clinical-trial only (50.25(c)), or Common Rule only (46.116(a)(5)(i) key information, (b)(9), (c)(7) to (c)(9)).

Every citation is recall, stated by `CONSENT_ELEMENTS_BASIS`, because eCFR was not reachable from this environment.

| Path | Now |
|---|---|
| `review_informed_consent` | Reads the record's FDA elements. When ACT status is not stated, 50.25(c) is listed as "applies only in a case not stated — not assessed", never as missing. When the caller states an ACT, it is required. |
| `design_informed_consent` | Required and additional elements come from the record. The biospecimen elements cite 45 CFR 46.116(c)(7) to (c)(9), marked "Common Rule; not a 21 CFR 50.25 element". 50.25(c) is required when `applicableClinicalTrial` is true. When that is unstated for an interventional study, the tool warns. Its tool definition takes the new input. |
| IND auditor, protocol flow | Render the 50.25(a) list from the record, in order, with 50.25(c) for an applicable clinical trial. |

The existing case "checks the ClinicalTrials.gov statement as required" now states the ACT it assumes.

## Green

| Check | Result |
|---|---|
| `green/informed-consent-elements.txt` | 20/20 (the new suite plus the two existing consent suites) |
| The 12 consent and auditor suites | 294 of 294 |
| The 92 suites that load AnA's tool definitions | 2,088 of 2,088 |
| Typecheck | 0 errors |
| Lint ratchet | No file gained a warning |

## Not done: a product decision

**The governed consent-form builder** (`protocol-consent-logic.ts`, `/api/protocol-consent`, the Protocol Development › Reviews consent pane) keeps its own 15 elements. It is the only copy that **gates approval**. It lacks the 50.25(c) statement and the 50.25(a)(5) "FDA may inspect" wording, it miscounts 46.116(b), and its element keys differ from the record. An FDA applicable clinical trial's consent form can therefore be approved without either statement.

Moving it onto the record changes which in-flight forms can be approved. That needs:
- a regime column (FDA, Common Rule or both) and an ACT input, added additively under Rule 1;
- an alias map for its old keys;
- a decision on backfilling existing forms.

That is a regulatory decision, not a refactor, and it is handed to the product owner.

**Also left as they were:**
- **ICF blueprint and module deliverable.** The ICF authoring blueprint (`project-bootstrap.ts` ICF_SECTIONS) and the module-intelligence `icf` deliverable still list a partial set.
- **IRB package waiver citation.** The IRB package cites 45 CFR 46.116 for a waiver even for FDA research. For FDA-regulated research the waiver basis is 21 CFR 50.22 to 50.24.
- **Stale E6(R2) comments.** `AnaToolExecutor.ts:3175` and `:3185` were held by another lane.
