# b1-template-library — regulatory facts relied on

Checked 2026-10-04. Regulator sites are blocked for direct fetch in this
environment, so "regulator-text" below means a WebSearch restricted to
regulator domains returned the heading from the regulator-hosted document at
the URL shown (the search engine's extract of that document, not a full read).
Anything else is labelled recall.

## ICH E2C(R2) PBRER section numbering (§1–§19)

| § | Heading | Confidence | Source |
|---|---|---|---|
| 12 | Other Periodic Reports | regulator-text (search extract, "3.12") | https://database.ich.org/sites/default/files/E2C_R2_Guideline.pdf ; https://www.fda.gov/media/83371/download |
| 13 | Lack of Efficacy in Controlled Clinical Trials | regulator-text (search extract, "3.13") | same |
| 14 | Late-Breaking Information | regulator-text (search extract, "3.14") | same; also https://database.ich.org/sites/default/files/E2CR2_Q&As_Q&As.pdf ("Section 14 of the report (Late-Breaking Information)") |
| 15 | Overview of Signals: New, Ongoing, or Closed | regulator-text (search extract, verifier's run 2026-10-04) | https://database.ich.org/sites/default/files/E2C_R2_Guideline.pdf ; https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/dhp-mps/alt_formats/pdf/prodpharma/applic-demande/guide-ld/ich/efficac/e2c-r2-_step4_etape4-eng.pdf |
| 16 | Signal and Risk Evaluation | regulator-text (search extract, verifier's run) | same |
| 17 | Benefit Evaluation | recall (consistent with the repo's list in server/services/pharmacovigilance/pharmacovigilance-knowledge.ts:1028-1048) | — |
| 18 | Integrated Benefit-Risk Analysis for Approved Indications | regulator-text (search extract, verifier's run) | https://database.ich.org/sites/default/files/E2C_R2_Guideline.pdf |
| 19 | Conclusions and Actions | recall (same repo list) | — |

§1–§11 were already in the library and are unchanged here.

## Cover letter placement in Module 1

| Region | Placement | Confidence | Source |
|---|---|---|---|
| FDA | 1.1 Forms; 1.2 Cover letters | regulator-text (search extract) | https://www.fda.gov/media/179699/download ; https://www.fda.gov/media/181848/download ; also the FDA eCTD Technical Conformance Guide https://www.fda.gov/media/93818/download ("section 1.2 cover letters") |
| EU | 1.0 Cover Letter | recall, as recorded in server/services/regional-ctd-templates.ts:159-164 | — |
| NMPA | 1.0 说明函 Cover Letter | as recorded in server/services/regional-ctd-templates.ts:281-287 (NMPA notice 2019 No. 17); not re-checked here | — |
| MFDS | 1.2 Cover Letter | approximation flagged in server/services/regional-ctd-templates.ts:326-332; not re-checked here | — |

Conclusion used by the change: no single CTD code is correct for the cover
letter across the template's families (ectd / estar / ctis), so the template
carries none and names the regional placement in its basis.

## ICH E3 CSR numbering

Not restated here. The CSR outline now derives from the canonical tree
(server/services/ind/ctd/csr-e3-guidance.ts, `e3TopLevel()`), which carries its
own `E3Basis` per section. This step adds no new E3 regulator text.
