# g-ctis-annex-i-readiness: regulatory facts relied on

This step makes the CTIS readiness engine read one record, `CTR_ANNEX_I`
(`server/services/pathway-engines/ctis/ctr-annex-i.ts`). Each row there carries
its own basis. This file lists the facts behind those rows and says how each was
checked.

**Method.** eur-lex.europa.eu is blocked for direct fetch in this environment.
Facts marked **regulator-text** were confirmed on 2026-10-05 from a WebSearch
restricted to `eur-lex.europa.eu`, whose result quoted the passage from
Regulation (EU) No 536/2014 at
<https://eur-lex.europa.eu/eli/reg/2014/536/oj/eng>, also indexed as the PDF
<https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32014R0536>.
That is a search snippet of the regulator-hosted text, not a full read of the
annex. Facts marked **recall** were not confirmed this way. They are owed a read
of the primary text before anyone presents them as regulator wording.

| # | Fact | Basis | Used for |
|---|---|---|---|
| 1 | Annex I K, "Recruitment arrangements (information per Member State concerned)": a separate document shall describe the procedures for inclusion of subjects and the first act of recruitment, unless they are described in the protocol. | regulator-text (search snippet, 2026-10-05) | Row K is per Member State and `if-applicable`: undetermined until filed or recorded not-applicable. |
| 2 | Annex I L, "Subject information, informed consent form and informed consent procedure (information per Member State concerned)". | regulator-text (search snippet, 2026-10-05) | Row L is per Member State and required. |
| 3 | Annex I N, "Suitability of the facilities (information per Member State concerned)". Heading only; the snippet's body text appeared to belong to O. | regulator-text, heading only | Row N is per Member State and required. |
| 4 | Annex I O, "Proof of insurance cover or indemnification (information per Member State concerned)": proof of insurance, a guarantee or a similar arrangement shall be submitted, if applicable. | regulator-text (search snippet, 2026-10-05) | Row O is `if-applicable`. It is no longer folded into financial arrangements through the word "insurance". |
| 5 | Annex I P, "Financial and other arrangements (information per Member State concerned)": financing, financial transactions and compensation paid to subjects and investigator/site, and any other sponsor–site agreement. | regulator-text (search snippet, 2026-10-05) | Row P is per Member State and required. |
| 6 | Annex I Q, "Proof of payment of fee (information per Member State concerned)": proof of payment shall be submitted, if applicable. | regulator-text (search snippet, 2026-10-05) | Row Q is `if-applicable`. Which Member States charge a fee is **recall** and not modelled. |
| 7 | Annex I R: a statement by the sponsor or his or her representative that data will be collected and processed in accordance with Directive 95/46/EC shall be provided. | regulator-text (search snippet, 2026-10-05) | Row R is required (it was `required: false`). Reading 95/46/EC as now Regulation (EU) 2016/679 is **recall**. |
| 8 | Annex I F (GMP): "No documentation needs to be submitted where the investigational medicinal product is authorised and is not modified, whether or not it is manufactured in the Union." | regulator-text (search snippet, 2026-10-05) | Row F is `if-applicable`, not required. A sponsor with an authorised, unmodified IMP records `I:gmp-manufacturing` as not applicable. A 3.2.P leaf no longer clears it. |
| 9 | Article 7(1)(h): the Part II assessment covers compliance with the applicable rules for the collection, storage and future use of the subject's biological samples. | regulator-text (search snippet, 2026-10-05) | Part II row `biological-samples` is `conditional`, so it is reported for confirmation and does not block. |
| 10 | Annex I headings B (cover letter), C (EU application form), D (protocol), E (investigator's brochure), G (IMPD), H (auxiliary medicinal product dossier), I (scientific advice and PIP), J (content of the labelling of the IMP) and M (suitability of the investigator, per Member State). | **recall** | The Part I rows and row M. Their titles and Part I/II placement are recall and owed a read. |
| 11 | Where the IMP is authorised and used within its authorisation, the SmPC serves as the IB. | **recall** | Row E. The SmPC is filed at `part-i.investigators-brochure`. It is not accepted by document type alone. |
| 12 | The IMPD safety and efficacy part may cross-refer to the IB. | **recall** | Row G (S&E). The cross-reference is filed at `part-i.impd-safety-efficacy`. The IB does not satisfy the slot by itself. |
| 13 | Scientific advice and the PIP decision are needed only where they exist. The AxMP dossier is needed only for an unauthorised AxMP. | **recall** | Rows H and I are `conditional`: reported, not blocking. |
| 14 | Part II is assessed by each Member State concerned for its own territory. | regulator-text for the "(information per Member State concerned)" headings K, L, N, O, P and Q (facts 1–6). Article 7 placement is from the search snippet. | Part II is evaluated per state. A document is satisfied for state X only at `part-ii.<x>.<segment>`. |

## Product decisions applied

- **DECISIONS.md #17.** The CTIS Part II member state is kept in the slug,
  `part-ii.<ms>.<segment>`, so there is no schema change. The CTIS
  placement-vocabulary SLUG regex (`shared/regulatory/placement-vocabulary.ts`)
  already admits it.
- **DECISIONS.md principle 1 (fail closed).**
  - A Part II document with no member state is undetermined for every state,
    never present.
  - An "if applicable" row nobody answered is undetermined, and it blocks
    readiness. This is the eSTAR W1-5 rule.
- **DECISIONS.md #6 (detect, never rewrite).** Existing CTIS leaves filed at CTD
  codes now read as missing. Each slot reports the `expectedSlug` it needs. No
  stored row is changed.

## Owed reads

- The full Annex I text: headings B–J and M, and the IB/SmPC and IMPD/IB
  cross-reference provisions (facts 10–13).
- The Member State fee schedules, if fee applicability is ever to be decided by
  the engine rather than recorded by the sponsor.
