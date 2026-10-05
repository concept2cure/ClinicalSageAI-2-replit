# g-smpc-qrd-one-record — regulatory facts relied on

Step: the QRD SmPC catalog (`server/services/labeling/smpc-qrd-catalog.ts`) is read by
four of the five other SmPC tables; the EU section guard covers sections 1–10. Checked
2026-10-05. A sixth table, `server/services/global-ri/labeling-requirements.ts`
LABELING_REQUIREMENTS.EMA, still holds its own literals and lacks 5.1–5.3 and 6.1–6.6
(outside this step's files; recorded as a follow-up).

The EMA PDFs could not be opened: `ema.europa.eu` is refused by this environment's
egress proxy. Every heading below is therefore **recall**. The catalog says so in
`SMPC_QRD_BASIS.confidence = 'recall'`. Search-engine results that point at
EMA-hosted copies are recorded as support only. They are not a read of the
regulator's text.

| # | Fact | Basis | Where it is used |
|---|---|---|---|
| 1 | The current EMA human product-information (QRD) template is version 10.4, dated 02/2024. Its Annex I is the SmPC. | **Recall**, supported by a search on 2026-10-05. The search returned the EMA-hosted PDF titled "Version 10.4, 02/2024 ANNEX I SUMMARY OF PRODUCT CHARACTERISTICS": https://www.ema.europa.eu/en/documents/template-form/qrd-product-information-template-version-104-highlighted_en.pdf. The PDF itself was not read. | `SMPC_QRD_BASIS.ref` and `.url` |
| 2 | SmPC sections 1–10, with sub-sections 4.1–4.9, 5.1–5.3 and 6.1–6.6, and the titles in `SMPC_QRD_TREE`. Top-level headings are printed "N. UPPER CASE"; sub-sections are printed "N.N Sentence case". | **Recall.** Not checked against the PDF text. | `SMPC_QRD_TREE`, `qrdHeader` |
| 3 | 6.6 reads "Special precautions for disposal \<and other handling\>". The bracketed text is optional, so the guard requires only "6.6 Special precautions for disposal"; the scaffold prints the full heading. | **Recall**, supported by a search on 2026-10-05 (EMA-hosted v10.4 templates, URL as in row 1). | `guardHeader` on 6.6 |
| 4 | Section 9 is "DATE OF FIRST AUTHORISATION/RENEWAL OF THE AUTHORISATION", with no spaces around the slash. | **Recall**, supported by the same search. | Title of section 9 |
| 5 | Section 11 "DOSIMETRY" and section 12 "INSTRUCTIONS FOR PREPARATION OF RADIOPHARMACEUTICALS" appear only in the SmPC of a radiopharmaceutical. | **Recall**, supported by a search on 2026-10-05. The search returned the EMA-hosted v10.4 template (row 1); the annotated v10.4 template, https://www.ema.europa.eu/en/documents/template-form/qrd-product-information-annotated-template-english-version-104_en.pdf; and the EMA presentation "Sections 7 to 10 related to the marketing authorisation, sections 11-12 related to radiopharmaceuticals", https://www.ema.europa.eu/en/documents/presentation/presentation-sections-7-10-related-marketing-authorisation-sections-11-12-related-radiopharmaceuticals_en.pdf. | `radiopharmaceuticalOnly` on 11 and 12; `structure_smpc` description |
| 6 | The QRD template keeps every numbered heading. A section with nothing to say is not dropped. | **Recall.** This was the existing comment on `EU_REQUIRED`; it was not re-checked. | Guard membership: all of 1–10 |
| 7 | A draft QRD v11 was published for public consultation on 2025-04-11, mainly restructuring the package leaflet. Its adoption is not confirmed. | Search on 2026-10-05: https://www.ema.europa.eu/system/files/documents/template-form/draft-qrd-template-human-medicines-v11_public-consultation_en.pdf | Not used. It is why the catalog stays at v10.4 and why no package-leaflet mode was built (DECISIONS.md #23). |

**Owed read.** Read the QRD v10.4 Annex I PDF (row 1 URL). Confirm rows 2–6 verbatim,
then set `SMPC_QRD_BASIS` to `confidence: 'regulator-text'` with `checked`. This is
listed under DECISIONS.md #7.

**Platform convention, not regulator text.** The following were moved as they were,
re-keyed by number:
- the placement cues in `labeling-structure.ts SMPC_CUES`, with new cues for 6.2, 6.3, 6.5, 6.6 and 8–10;
- the content guidance in `labeling-intelligence-knowledge.ts SMPC_CONTENT_GUIDANCE`;
- the purpose notes in `document-template-library.ts SMPC_PURPOSE`.

**Where tool output states this recall.** The `structure_smpc` description says "v10.4;
heading wording from recall, not checked against the EMA text", and the 6.6 content
guidance says "(QRD v10.4, recall — not checked against the EMA text)". Both are pinned by
`labeling-authoring-qrd.test.ts`.
