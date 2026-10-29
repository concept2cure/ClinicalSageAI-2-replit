# D2 · Decisions owed to the founder — 2026-10-26

**Decided 2026-10-29 under the founder's delegation: every row as recommended (P-55, `docs/LAUNCH_DEFINITION_OF_DONE.md`).**

These are the decisions three read-only plans named as the founder's and not a session's. Each was written separately,
and each is listed once here:
- the CTD duplicates inventory (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/cleanup/inventory-plan.md`, FD-n);
- the 3b component class projects (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-3/3b-plan.md`, F-n);
- the Rule 2 audit of model-supplied figures (`docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md`, R-n; the design numbers them F1–F8, so R-1 is its F1).

Each line gives the question, the recommendation, and what waits on it. Nothing here is done before a decision.

## Decide first: they block shipped work

| # | Question | Recommendation | Waits on it |
|---|---|---|---|
| 1 (F-B, task #4) | Can a heading the guideline makes conditional be marked **not applicable** as an evaluated fact? Examples: 2.5.6.5 Appendix, 2.7.4.6 Post-marketing Data. | Yes. Recording N/A needs a reason and the approver's signature, and completeness then counts the section. | 2.5 and 2.7 class projects can only reach 100% if the author approves a "not used" text. |
| 2 (R-1) | Which nonclinical store should AnA's 2.4/2.6 drafts read? | `nonclinical_studies` (the governed study register). Count `in_reporting` for an IND; never `planned` or `cancelled`. | Since Rule 2 S2 (2026-10-26), 2.4/2.6 return the ICH M4S outline and say no studies are recorded against the project. Slice S14 reads the chosen store. |
| 3 (FD-11, F-A) | Is 2.6 a **preparation worksheet**, with AnA drafting withheld from its tabulated summaries (2.6.3/2.6.5/2.6.7)? | Yes. The tables are study figures; the written summaries stay draftable. | The 2.6 class project's label. |
| 4 (R-2) | Do calculators over **stated** inputs stay (FIH dose, safety margin, f2, shelf life), labelled `basis: 'stated'`, with no program verdict? Or are they withheld until a record exists? | Keep them, labelled. They are worksheets, not governed content. | Rule 2 slices S4/S5. |

## Scope and catalogue

| # | Question | Recommendation |
|---|---|---|
| 5 (F-D) | Any standalone QOS, drug substance or drug product project, or any widening of P-28? | No. The "not offered" reason will name where each is written. |
| 6 (F-C) | May a component project compose from **another** project's CSRs or nonclinical program? | No (P-14). 3b Slice 1 already refuses it. |
| 7 (FD-9) | Catalogue folds: Nonclinical, NdaCockpit, TemplateLibrary, pdev, the Mission Control program store; retire the regulatory digital twin? | Fold each only after its functions are carried over (P-47). Retire the digital twin (Rule 2 gives it no sessions). |
| 8 (R-5) | Is `labeling-pi` in launch? Either way the two SPL generators converge. | Out of launch; converge the generators. |
| 9 (R-6) | Is eTMF admitted as a source for `assess_inspection_readiness`? | Not for launch. The tool answers from stated inputs, labelled. |
| 10 (R-3) | Does `assess_bla_filing_risk` stay? | Withhold it in production. |
| 11 (R-4) | Is PV `adverse_events` a source for safety narratives? | Not until PV is in the catalogue. Narratives come from the approved CSR Vault source. |
| 12 (R-7) | Does the PMA "Generate Document" action stay, with no record path? | Withhold it until a PMA record path exists. |
| 13 (R-8) | Are the device cover letter and the Communication response package one letter? | Yes: one letter, one generator. |

## Functions with no canonical twin (FD-1): approve dropping them

No user reached any of these at HEAD:
- (a) ghost-text `/ai/autocomplete`;
- (b) the legacy project create's default `customInstructions` per submission type;
- (c) apply-template overwrite mode;
- (d) `compareAcrossAgencies`;
- (e) section-generation's structured "ungrounded claims" list and AI_GENERATE audit. Only if the stream path is shown not to record them.

Recommendation: approve (a)–(d). Decide (e) after the check.

## Record and content owners

| # | Question | Recommendation |
|---|---|---|
| 14 (FD-7, task #17) | Allow the guideline hosts (`database.ich.org`, `www.fda.gov`, `www.ema.europa.eu`) in this environment's network policy, so the owed verbatim reads can be done? | Yes. Until then, the record's "recall" headings stay recall, and the 2.3.S/2.3.P titles stay owed. |
| 15 (FD-6) | ISS and ISE templates: platform convention, or derived from 2.7.4 and 2.7.3? | Derive them from 2.7.3/2.7.4 and label them platform convention. |
| 16 (FD-5) | Does `ICH_TABULATED_SUMMARIES` stay withheld (BP-W1-4)? | Yes. |
| 17 (FD-2) | Carry the M2/M4/M5 QC rules into Submission Readiness (this changes dispatch verdicts, P-33), or drop them? | Carry them, as named findings, not as a score. |
| 18 (FD-3) | Reach or retire the authoring-plan approval lifecycle? | Retire it, unless a customer uses it. The DOCX ledger reads it: check first. |
| 19 (FD-8) | Schedule the EctdCoauthor store migration (`coauthor_documents` → `authoring_documents`)? | After launch. |
| 20 (FD-10) | Should `assemble_ectd_module_from_artifacts` read `authoring_documents`? | Yes. |
| 21 (FD-12) | What reads `ctdOnboardingDocuments` once nothing writes it? | Migrate those readers to the Vault, then retire the store. |
| 22 (S2 review) | When a Module 2 draft tool answers with the outline because there are no records (2.4 and 2.6 always, for now; 2.5 and 2.7 with no completed CSR), should AnA's step trace still read "Drafted the Module 2.x …"? | No. Read it as "Outlined …" with the reason, as one presentation rule for every draft tool. It is a cross-tool change to the step presentation, so the UI session should own it. |
