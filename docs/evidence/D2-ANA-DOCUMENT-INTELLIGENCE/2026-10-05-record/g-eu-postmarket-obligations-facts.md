# g-eu-postmarket-obligations — regulatory facts relied on

Step: `g-eu-postmarket-obligations` (finding 65, `devices-eu-postmarket-obligations`).
Engine: `server/services/gspr-postmarket/post-market-readiness.ts` `EU_POSTMARKET_OBLIGATIONS`.

**Every fact below is recall.** None was re-read against the EUR-Lex text in
this step. Regulator hosts are blocked for fetching in this environment, and the
basis definition (`shared/regulatory/regulatory-basis.ts`) counts search extracts
as recall too. Each table row's `basis` is `confidence: 'recall'`, with the
EUR-Lex ELI URL as the place the wording can be read and a note that it was not
re-read. Every citation is rendered through `basisLabel`, so readers see
"(recall — not checked against the regulator's text)". The test pins that no row
claims `regulator-text`.

Where the wording can be read:
- MDR, Regulation (EU) 2017/745: https://eur-lex.europa.eu/eli/reg/2017/745/oj
- IVDR, Regulation (EU) 2017/746: https://eur-lex.europa.eu/eli/reg/2017/746/oj

Corroboration inside the repository (also not regulator text):
`server/services/ivd-knowledge/regulatory/eu-ivdr.ts` (`eu.ivdr.technical-documentation`,
`eu.ivdr.pms-pmpf`) and `mdcg-guidance.ts` (`mdcg.2022-9-ssp`) state the same IVDR
split: PSUR for C/D, PMS report for A/B, SSP for C/D, PMPF under Annex XIII Part B.
The verifier of finding 65 confirmed the MDR Art 86 cadence through a web search
of Commission and EUR-Lex results. That is a search extract, so it stays recall.

| # | Fact | Basis | Encoded as |
|---|---|---|---|
| 1 | MDR Art 84: every device has a PMS plan (Annex III §1.1). | recall | `mdr-pms-plan`, all MDR classes |
| 2 | MDR Art 85: Class I manufacturers prepare a PMS report, update it when necessary, and make it available to the competent authority on request. Is/Im/Ir are Class I. | recall | `mdr-pms-report`, I/Is/Im/Ir |
| 3 | MDR Art 86(1): PSUR for Class IIa, IIb and III. IIb and III: at least annually. IIa: when necessary and at least every two years. | recall (verifier's search extract) | `mdr-psur-iia`, `mdr-psur-iib`, `mdr-psur-iii` cadences |
| 4 | MDR Art 86(2): for Class III or implantable devices, PSURs are submitted through EUDAMED (Art 92) to the notified body, which adds its evaluation. Art 86(3): other devices make PSURs available to the notified body and, on request, to competent authorities. | recall | `recipient` / `implantableRecipient` on the MDR PSUR rows |
| 5 | COM(2025) 1023 (16 Dec 2025) proposes moving IIb/III PSURs to every two years and dropping routine notified-body PSUR evaluation. It is not adopted. | recall (verifier's search extract) | A note in the MDR PSUR cadences. Per DECISIONS.md #25 the table states current law; the dated cadence check is step `g-psur-cadence-check` |
| 6 | MDR Annex XIV Part B: PMCF plan and PMCF evaluation report. Annex III §1.1(b): the PMS plan includes a PMCF plan or a justification for why PMCF is not applicable. This holds for every class. | recall | `mdr-pmcf-plan`, `mdr-pmcf-evaluation`, `required-or-justified`, all MDR classes |
| 7 | MDR Art 32: an SSCP for implantable devices and Class III devices, other than custom-made or investigational devices. It is validated by the notified body and made public through EUDAMED. | recall | `mdr-sscp`: III outright; implantable IIa/IIb (fact 14); `excludesCustomMade` |
| 8 | IVDR Art 79: PMS plan (Annex III). The old citation "IVDR Art 78" was the PMS *system* article. | recall | `ivdr-pms-plan` |
| 9 | IVDR Art 80: Class A and B manufacturers prepare a PMS report, update it when necessary, and make it available to the notified body and the competent authority on request. | recall | `ivdr-pms-report`, A/B |
| 10 | IVDR Art 81: PSUR for Class C and D, updated at least annually. Class D PSURs are submitted through EUDAMED (Art 87) to the notified body. Class C PSURs are made available to the notified body and, on request, to competent authorities. | recall | `ivdr-psur-c`, `ivdr-psur-d` |
| 11 | IVDR Art 29: SSP for Class C and D, other than devices for performance studies. It is validated by the notified body and published through EUDAMED. | recall | `ivdr-ssp`, C/D |
| 12 | IVDR Art 29(2) (a)–(h): the SSP content. Device identification (trade name, Basic UDI-DI, SRN); intended purpose, indications, contra-indications and target populations; description, variants and accessories; harmonised standards and common specifications applied; a summary of the performance evaluation and the PMPF; metrological traceability of assigned values; suggested profile and training for users; residual risks, undesirable effects, warnings and precautions. MDCG 2022-9 (the SSP template) was **not** re-read. | recall | `validateSsp` `SSP_FIELDS` and `buildSspContent`; finding citations say "recall" |
| 13 | IVDR Annex XIII Part B: the IVDR follow-up instrument is PMPF, not PMCF. It has a PMPF plan (general and specific methods, rationale, specific objectives, time schedule) and a PMPF evaluation report that updates the performance evaluation report. Annex III §1.1 allows a justification where PMPF is not applicable. | recall | `ivdr-pmpf-plan`, `ivdr-pmpf-evaluation` (`required-or-justified`); `validatePmpfPlan`, `validatePmpfEvaluation` |
| 14 | MDR Annex VIII Rule 8: implantable and long-term surgically invasive devices are Class IIb, except those placed in the teeth (Class IIa), and with listed Class III cases. So no implantable device is Class I. | recall | `mdr-sscp.implantableClasses` = IIa, IIb (fix round 1). A Class I device's SSCP is `not-required`, not `undetermined`. |

Fix round 1 (2026-10-05): what the engine may still say when the class is unrecognised.
Facts 1, 6, 8 and 13 hold for **every** class of their regulation: the PMS plan, and PMCF/PMPF plan and evaluation (required unless justified).
So under `class_unrecognised` those rows keep their obligation. Only the class-dependent rows become `undetermined`: PMS report, PSUR, SSCP/SSP.
This is a consequence of the table rows' `classes` covering the whole vocabulary, not a new regulatory fact.

Re-read owed (DECISIONS.md #7: primary texts are kept as recall until read):
- MDR Art 32, 84, 85, 86, Annex VIII Rule 8 and Annex XIV Part B;
- IVDR Art 29, 79, 80 and 81, and Annex XIII Part B;
- MDCG 2022-9 and MDCG 2019-9 Rev.1.

When a row is checked, its basis becomes `regulator-text` with `checked` set,
and the test's "every row is recall" assertion is narrowed in the same change.
