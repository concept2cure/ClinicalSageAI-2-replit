# g-fda-ivd-facts — regulatory facts relied on

Step: FDA IVD knowledge: PCCP components and the De Novo rule date
(verified finding index 60, item 6 of its corrected proposal).
File changed: `server/services/ivd-knowledge/regulatory/fda-ivd.ts`
(entries `fda.ivd.expedited-programs` and `fda.ivd.de-novo`).
Checked 2026-10-05 via WebSearch. Regulator sites are blocked for WebFetch here, so the
texts below are what regulator-hosted search results quote, not a full read of the documents.

| # | Fact | Basis | Source (regulator-hosted) | Checked |
|---|------|-------|---------------------------|---------|
| 1 | The De Novo classification final rule ("Medical Device De Novo Classification Process", 21 CFR 860 subpart D) was published in the Federal Register on 2021-10-05 at 86 FR 54826, FR Doc. 2021-21677. | regulator-text (search-result quote) | https://www.federalregister.gov/documents/2021/10/05/2021-21677/medical-device-de-novo-classification-process ; https://govinfo.gov/content/pkg/FR-2021-10-05/pdf/2021-21677.pdf | 2026-10-05 |
| 2 | That rule's effective date is 2022-01-03 ("This rule is effective January 3, 2022"). The old text "effective 2021" was wrong. | regulator-text (search-result quote) | same as 1 | 2026-10-05 |
| 3 | FDA's final guidance "Marketing Submission Recommendations for a Predetermined Change Control Plan for Artificial Intelligence-Enabled Device Software Functions" was announced in the Federal Register on 2024-12-04 (FR Doc. 2024-28361). FDA posted it on 2024-12-03 (FDA Roundup). | regulator-text (search-result quote) | https://www.federalregister.gov/documents/2024/12/04/2024-28361/marketing-submission-recommendations-for-a-predetermined-change-control-plan-for-artificial ; https://www.fda.gov/regulatory-information/search-fda-guidance-documents/marketing-submission-recommendations-predetermined-change-control-plan-artificial-intelligence | 2026-10-05 |
| 4 | A PCCP has three components: Description of Modifications, Modification Protocol and Impact Assessment. Description = the specific planned modifications and their specifications. Modification Protocol = the V&V activities with pre-defined acceptance criteria. Impact Assessment = the benefits and risks of the planned modifications, and how the Modification Protocol keeps the device safe and effective. | regulator-text (search-result quote of FDA-hosted guidance and webinar PDFs) | https://www.fda.gov/media/187905/download ; https://www.fda.gov/regulatory-information/search-fda-guidance-documents/predetermined-change-control-plans-medical-devices | 2026-10-05 |
| 5 | "SACP" is the 2019 AI/ML discussion-paper vocabulary, alongside "SaMD Pre-Specifications" / "Algorithm Change Protocol". The final guidance does not use it as a component name. | recall (not regulator text) | — | — |
| 6 | PCCP statutory basis: FD&C Act §515C, added by FDORA 2022. This text already existed in the entry and is unchanged. | recall (not regulator text) | — | — |

## What changed

- `fda.ivd.de-novo`: the detail now says "published 2021-10-05 at 86 FR 54826, FR Doc. 2021-21677; effective 2022-01-03". The 21 CFR 860 subpart D citation carries the FR document number, both dates and the federalregister.gov URL.
- `fda.ivd.expedited-programs`: the garbled "what via a Modification Protocol and how via the SACP/impact assessment" is removed. The three final-guidance components are named and defined. A key point lists them, and the guidance citation carries its 2024-12-04 date and its fda.gov URL.
- `lastReviewed` on both entries is now 2026-10-05.

## Open items (not in this step's files)

- No `REGULATORY_FACTS` row exists for the PCCP final guidance (`fda-pccp-ai-2024`). That row belongs to the currency-registry part of finding 60.
- FDA's 2024-08 draft "Predetermined Change Control Plans for Medical Devices" (non-AI, all devices) is not mentioned in the IVD corpus. It is draft, so this corpus does not cite it as binding.
