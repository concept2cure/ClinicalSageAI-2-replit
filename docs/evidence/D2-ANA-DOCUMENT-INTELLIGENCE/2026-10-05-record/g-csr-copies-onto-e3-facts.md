# g-csr-copies-onto-e3 — facts relied on

Step: every remaining CSR outline reads the ICH E3 tree (follow-ups F1, F4;
finding 80 part 2/3; finding 8 IB basis).

**Checked 2026-10-05. Re-checked 2026-10-11** on re-land, because trunk moved
481 commits under this change: every dated regulator statement below was
re-searched against today's date, and the one claim that trunk had meanwhile
delivered another way (F3) is restated so this step no longer claims it.

| # | Fact | Basis | Source / where used |
|---|------|-------|---------------------|
| F1 | ICH E3 numbers its top level §1 Title Page … §7 Introduction, §8 Study Objectives … §15 Reference List, §16 Appendices, with the sub-headings the tree carries (119 nodes). | Regulator text, as already recorded by the canonical tree (each node's basis via `e3BasisFor`; `FDA_E3` in `server/services/ind/ctd/regulatory-basis.ts`). Not re-checked in this step. | `server/services/ind/ctd/csr-e3-guidance.ts`; the DOCX blueprint `csr-ich-e3` is now built from it. |
| F2 | The DOCX blueprint `csr-ich-e3` at HEAD numbered Introduction 3, Objectives 4, References 10, and lacked §3–§6, §14 and §16; it offered "No deaths occurred during the study." at 8.3. | Code (HEAD `server/services/docx/templateRegistry.ts`), shown failing in `g-csr-copies-onto-e3-red.txt` (received 10 top-level headings for 16). | Removed. |
| F2b | ICH E3 carries the same title at two numbers twice: "Protocol Deviations" at §10.2 and §16.2.2, "Demographic Data" at §14.1 and §16.2.4 (119 nodes in all). | Code (walked `ICH_E3_GUIDANCE` with tsx, 2026-10-11; output in `g-csr-copies-onto-e3-red.txt`). | `mergeWithTemplate` in `server/services/docx/templateRegistry.ts` now matches an ambiguous title by `sectionCode` alone, so one caller's prose is never written under both numbers. |
| F3 | **The IB is in ICH E6(R3) Appendix A; it was E6(R2) §7.** Trunk already carries that label: the 2026-10-08 session migrated the repository off the superseded revision and minted `shared/regulatory/ich-e6r3.ts`, whose `E6R3_APPENDICES.A` is "Investigator's Brochure". **This step therefore no longer changes the citation text; it only gives the entry a structured `RegulatoryBasis`, built by `citeE6R3` from that one record** rather than hand-written a second time. | **Recall.** Re-searched 2026-10-11: the placement is corroborated by secondary and mirror copies (ichgcp.net's Appendix A text, the Danish Medicines Agency's reproduction of A.1, CASRAI's IB guide), and FDA hosts an E6(R3) artifact at https://www.fda.gov/media/169090/download — the same artifact `server/services/ind/ctd/authoring-guidance.ts:551` already cites. **No regulator PDF was read verbatim**, so the basis stays `recall` with **no `checked` date**. | `investigators_brochure` in `server/services/market-specs/document-template-library.ts`: `basis: IB_BASIS`, i.e. `citeE6R3({ kind: 'appendix', id: 'A' })` plus the FDA url; rendered by `basisLabel` as "… (recall — not checked against the regulator's text)". |
| F4 | **E6(R3) is still the GCP guideline in force on 2026-10-11, and nothing has moved the IB out of Appendix A.** The package has three dated milestones, which must not be conflated: (a) **E6(R3) Principles + Annex 1 reached ICH Step 4 on 2025-01-06** and supersede E6(R2) — this is the milestone that carries Appendix A; (b) **Annex 2** (non-traditional / decentralised trials, real-world data) **reached Step 4 on 2026-06-03**, and the **consolidated Step 4 guideline PDF is dated 2026-06-16** (editorial consolidation of (a) and (b), not a new requirement); (c) regional effect differs — EU effect for (a) was **2025-07-23**, for Annex 2 it is **2027-01-15** (not yet in effect). Annex 2 adds considerations for trial designs; it does not renumber the appendices. | **Recall**, consistent with the platform's own currency registry (`server/services/regulatory-currency/currency-registry.ts`: `ich-e6r3-gcp-step4` 2025-01-06, `ich-e6r3-annex2-step4` 2026-06-03, `eu-e6r3-effective` 2025-07-23, `eu-e6r3-annex2-effective` 2027-01-15) and with WebSearch extracts of 2026-10-11 (the ICH consolidated Step 4 PDF filename `…_Step4_FinalConsolidatedGuideline_2026_0616_.pdf`; EMA's Annex 2 Step 5 document giving CHMP adoption 2026-06-25 and coming into effect 2027-01-15). Search summaries, not reads of the PDFs. | **No date is written into the code.** The basis carries `factId: 'ich-e6r3-gcp-step4'`, so the Step 4 date is read from the currency registry; the code comment on the entry states no date. |
| F5 | The IB's content headings — Summary; Introduction; Physical, Chemical and Pharmaceutical Properties and Formulation; Nonclinical Studies; Effects in Humans; Summary of Data and Guidance for the Investigator — are unchanged from E6(R2) to E6(R3). | Recall, corroborated by the same search extracts (2026-10-05 and 2026-10-11). Section numbers 1–6 in the library are **ordinals, not E6 numbering**; the basis note and the code comment both say so. | IB entry sections (unchanged by this step). |
| F6 | `SEMANTIC_MODELS.csr.ichE3Framework` was read only by the log line in the `ClinicalIntelligenceService` constructor. | Code (grep of the repo, 2026-10-05, re-grepped 2026-10-11: no other reader of `ichE3Framework`, and no reader of its `criticalElements`). | Deleted; the log line counts `ICH_E3_GUIDANCE.length`. Replacement: `server/services/ind/ctd/csr-e3-guidance.ts`, pinned by `tests/regulatory/csr-e3-overlay.test.ts`. |

## What is deliberately not claimed

- No statement here is `regulator-text`. ich.org, fda.gov, ema.europa.eu and
  their mirrors are not reachable for a verbatim read from this environment, and
  WebSearch returns summaries. Every E6(R3) statement is therefore `recall` and
  is shown to the reader as such by `basisLabel`.
- Strictly, Appendix A sits inside E6(R3) **Annex 1**; the citation text
  `e6r3Ref({ kind: 'appendix', id: 'A' })` says "ICH E6(R3) Appendix A
  (Investigator's Brochure)" without the Annex. That is trunk's canonical
  wording, shared by every E6(R3) appendix citation in the repository; changing
  it belongs to `shared/regulatory/ich-e6r3.ts`, not to this step.

Not decided here (founder decision 24 in DECISIONS.md): the CSR as a governed
c2c document, and the reachability of `documents.generate_docx` (the cortex
tool-loop regex `/\[TOOL_CALL:(\w+)\(/` cannot match the dotted name). The
blueprint fix — and the title-collision fix in F2b — are latent until that loop
reads dotted tool calls; nothing reaches a client today.
