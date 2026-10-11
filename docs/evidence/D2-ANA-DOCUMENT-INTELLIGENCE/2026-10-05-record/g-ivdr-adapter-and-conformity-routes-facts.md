# g-ivdr-adapter-and-conformity-routes — regulatory facts relied on

Step: `server/services/regulatory/ivdr-classification.ts` `classifyIvdrAnnexVIII`
becomes a thin adapter onto the canonical IVDR Annex VIII table
(`EU_IVDR_RULES` / `classifyIvdr` in
`server/services/market-specs/device-classification.ts`). The IVDR Article 48
conformity routes are now held once, in `IVDR_CONFORMITY_ROUTES` in the same
file. `server/services/global-ri/device-classification.ts` reads that table.
Checked 2026-10-05.

**Every fact here is recall.** The egress proxy blocks the regulator hosts
(`eur-lex.europa.eu`, `health.ec.europa.eu`), so none of the regulator's own
pages was opened. Search extracts are listed as corroboration only. Each route
in the table carries `basis: { confidence: 'recall', url:
'https://eur-lex.europa.eu/eli/reg/2017/746/oj' }` and a note that a verbatim
re-read is owed (DECISIONS.md #7).

The classification-rule facts (Annex VIII Rules 1–7, the Rule 2 marker list,
the Rule 4(a) exceptions, the Rule 3 lettering) are the canonical table's own.
They are recorded in `g-eu-mdr-ivdr-rule-table-facts.md` and are not restated
here.

## Article 48 conformity routes (IVDR_CONFORMITY_ROUTES)

| # | Fact | Basis | Where used |
|---|---|---|---|
| 1 | **Class D:** Annex IX Chapters I, II (except section 5) and III; or Annex X coupled with Annex XI. | **Recall.** A WebSearch on 2026-10-05 returned the Article 48(3) wording "Chapters I, II except for Section 5, and in Chapter III of Annex IX", and the Annex X + XI alternative for class D, attributed to the TÜV SÜD IVDR Article 48 page (de-mdr-ivdr.tuvsud.com/Article-48-Conformity-assessment-procedures.html). That page is not a regulator host. | `IVDR_CONFORMITY_ROUTES.D.options` |
| 2 | **Class D additions:** where an EU reference laboratory is designated for the device, it verifies the performance claimed and compliance with the common specifications, and tests batches. Where no common specifications exist, the notified body consults the expert panel on the performance evaluation report. | **Recall.** The same search returned summaries citing Article 48(5) (EURL) and 48(6) (expert panel), from TÜV SÜD, NAMSA (MDCG 2022-3 on batch verification) and Emergo. None of these is a regulator host. Paragraph numbers are not encoded. | `IVDR_CONFORMITY_ROUTES.D.additional` |
| 3 | **Class C:** Annex IX Chapters I and III, with technical-documentation assessment (Annex IX section 4) of at least one representative device per **generic device group**; or Annex X coupled with Annex XI. | **Recall.** A WebSearch on 2026-10-05 returned the Article 48(7) sentence, attributed to TÜV SÜD. The results also listed MDCG 2019-13 rev.1 on sampling (health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_13_sampling_mdr_ivdr_en_0.pdf), which was not opened. The Annex X + XI alternative for C is recall, corroborated by the search summary "Class C and D devices can use either Annex IX or Annex X + XI". | `IVDR_CONFORMITY_ROUTES.C.options` |
| 4 | **Class B:** Annex IX Chapters I and III, with technical-documentation assessment of at least one representative device per **category of devices**. Class B has no Annex X + XI route and no Annex XI-only route. | **Recall.** The Article 48(9) sentence came from the same search. The old global-ri text "Annex IX or Annex XI" and the old engine text "Annex IX … or Annex X+XI" for Class B describe routes that, as I recall the regulation, do not exist. | `IVDR_CONFORMITY_ROUTES.B`. The test pins no Annex X/XI in its summary. |
| 5 | **Self-testing and near-patient devices** (Classes B, C, D): the notified body also assesses the technical documentation under Annex IX section 5.1. | **Recall.** Search extract: "for devices for self-testing and near-patient testing, the manufacturer shall follow the procedure for technical documentation assessment set out in Section 5.1 of Annex IX" (TÜV SÜD). | `SELF_TEST_ASSESSMENT` in B, C and D `additional` |
| 6 | **Companion diagnostics:** the notified body consults a competent authority designated under Directive 2001/83/EC, or the EMA, under Annex IX section 5.2. On the type-examination route this is Annex X section 3(k). | **Recall.** Section 5.2 came from the same search extract. "Annex X section 3(k)" is recall only and was not in any extract. | `IVDR_CDX_CONSULTATION`, in C and D `additional`. It is also appended to any result where Rule 3(f) fired. |
| 7 | **Class A:** the EU declaration of conformity (Article 17) on the technical documentation of Annexes II and III, with no notified body. A sterile Class A device has a notified body for the sterility aspects only, under Annex IX or Annex XI. | **Recall.** The Annex II/III technical-documentation link is corroborated by the MedTech Europe IVDR flowchart listed in search ("Article 48 Para 10 Technical Documentation Annex II & Annex III"), which was not opened. | `IVDR_CONFORMITY_ROUTES.A` |
| 8 | **MDR Class III:** Annex IX, or Annex X coupled with Annex XI. | **Recall** (MDR Article 52). The old global-ri string "Annex IX or Annex X" dropped the Annex XI coupling. | `MDR_CLASSES` III in global-ri |

## How the adapter maps the form (platform convention, not regulator text)

- **Rule 1, first indent:** `bloodScreening && detectsTransmissibleAgent` →
  `bloodDonationScreening`. This is the old engine's own Rule 1 test.
- **A transmissible agent outside blood screening:** the form does not ask
  whether Rule 1's second or third indent (Class D) or a Rule 3(a)–(e) point
  applies. No class below D is stated, and the adapter throws
  `DeviceClassificationFactError` (`code: 'VALIDATION'`). This applies
  DECISIONS.md #1. The old engine said Class B.
- **Rule 3 points:**
  - `isCompanionDiagnostic` → 3(f).
  - `detectsCancer` → 3(h).
  - `isGeneticTest` → 3(i).
  - `prenatalScreening` → the coarse "Rule 3" fact, with a note naming 3(d) and
    3(l). The form does not say which; both are Class C.
  - Points (g), (j), (k) and (m) are not asked. A Rule 6 result says so.
- **Rule 2:**
  - An intended purpose containing "blood group", "blood typing" or "tissue
    typing" marks the device as blood grouping or tissue typing.
  - Its markers are read through the canonical `readRule2Marker` from the
    `analytes` and from intended-purpose tokens of two or more characters. The
    two-character floor means a sentence-initial "A" is never read as the A
    antigen.
  - A listed marker gives D.
  - Recognised non-listed markers, with every analyte read, give C.
  - Otherwise the class is not determined, and the adapter throws. The old
    engine gave D for any blood grouping.
- **Rule 4(a):**
  - Each analyte is read by the canonical `selfTestAnalyte` table. A form tag
    such as "glucose (urine)" is also tried urine-first ("urine glucose").
  - B only when every analyte is a listed exception.
  - An analyte the table cannot read is treated as "other" (Class C), and the
    result names it. This over-classifies rather than refuses, so a form with a
    free-text analyte (e.g. "HbA1c") still classifies. The old engine took the
    B exception from `riskToPatient: 'low'`, which is not an Annex VIII
    criterion.
- **`riskToPatient`** no longer changes the class. The result notes that.
- **Absent form booleans** read as "not ticked", as before. A Rule 6 (Class B)
  result keeps `confidence: 'low'`. Its notes ask the user to confirm Rules 1–4,
  and say Class A is reachable only through a Rule 5 assertion.

## Consequence for stored records (DECISIONS.md #6)

No migration, and no stored row is rewritten. When drift detection
(`server/services/regulatory/drift-detection.ts`) replays stored
`ivdr_classification` inputs, it will now legitimately flag records whose class
changed:
- blood grouping of a non-listed marker, D → C;
- a self-test with a listed Rule 4(a) analyte that was given medium or high
  risk, C → B;
- a self-test given low risk with a non-listed analyte, B → C.

Records whose inputs no longer decide a class (a transmissible agent outside
blood screening, or blood grouping that names no marker) report "recompute
failed (inputs not replayable)". That is surfaced, not rewritten.

## Owed read

Read Regulation (EU) 2017/746 Article 48 and Annexes IX–XI on EUR-Lex
(https://eur-lex.europa.eu/eli/reg/2017/746/oj). Confirm each route, then set
`confidence: 'regulator-text'` with `checked`.
