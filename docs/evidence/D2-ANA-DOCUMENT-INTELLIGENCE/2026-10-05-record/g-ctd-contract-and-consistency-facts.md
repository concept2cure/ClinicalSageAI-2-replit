# g-ctd-contract-and-consistency — facts relied on (2026-10-05)

Step: `g-ctd-contract-and-consistency` (lane ctd-gates; verified finding 33,
step 1 and the contract part of step 3; docs/design/ANA_REGULATORY_RECORD.md
§9 "Tests and gates", §10, R5).

This step adds test code only. No production record row changes, and no
regulatory fact is written into a basis. These are the facts the contract's
rules and pins rely on.

Method. The regulator hosts (fda.gov, database.ich.org, ema.europa.eu) refuse
fetches from this environment. "Search extract" below means a WebSearch
restricted to those domains, on 2026-10-05, returned a summary of the
regulator-hosted document that showed the point. Nothing was read in full. A
search summary is not verbatim regulator text, so every row is labelled
**recall** or **search extract**. None is presented as checked regulator text.

## Module 1 (FDA): the identity and placement rules

| Fact | Used for | Basis |
|---|---|---|
| FDA 1.3.2 is field copy certification | identity rule 1.3.2; placement rule "field copy → 1.3.2" (moved unchanged) | Repo: the FDA context-of-use list, `server/services/ectd/controlled-vocab/cv-v4-data.ts` (`us_1.3.2` "m1.3.2 field copy certification"). This is the list the eCTD packager files by. The FDA Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (https://www.fda.gov/media/76444/download) was checked against it on 2026-10-05 by step g-fda-jnda-rule-pack-m1-v2-2, recorded in `migrations/20261005_fda_jnda_m1_outline_v2_2.sql`. |
| FDA 1.3.5 holds patent and exclusivity: 1.3.5.1 patent information, 1.3.5.2 patent certification, 1.3.5.3 exclusivity claim | identity rule 1.3.5 (`/patent\|exclusivity/`) | Same CoU list (`us_1.3.5.1`–`us_1.3.5.3`), same 2026-10-05 check by the sibling step. The parent wording "patent and exclusivity" comes from that step's migration note. **Recall** for the parent's exact wording. |
| FDA 1.12.14 is environmental analysis. A claim of categorical exclusion is filed there too. | identity rule 1.12.14 (`/environmental\|categorical exclusion/`) | CoU list `us_1.12.14` "m1.12.14 environmental analysis"; sibling step check as above. The categorical-exclusion part is **recall** (21 CFR 25.15: a claim of categorical exclusion stands in place of an environmental assessment). |
| FDA 1.4 References holds 1.4.1 letters of authorization and 1.4.2 statements of right of reference | the "container" amendment: one node naming both may sit at 1.4. Also, the plural "letters of authorization" now matches the LOA rule. | CoU list (`us_1.4.1`, `us_1.4.2`); the live nda/bla packs ich-m4-v2.2 (20261005) seed exactly that tree. |
| The IB is 1.14.4.1, so an IB node at 1.14 is misfiled | pin: a single-document node at a parent heading stays a violation | Unchanged from fda-module1-numbering.test.ts (the IND workflow defect fixed 2026-10-04); CoU `us_1.14.4.1`. |

## Modules 2–5 (ICH): the record titles and the contradicting terms

The contract reads every Modules 2–5 title from the record through
`ichHeadingTitle`, which covers `CTD_AUTHORING_GUIDANCE` plus
`ich-m4-headings.ts`, whose rows carry their own basis
(g-ich-m4-headings-facts.md). The self-check pins assert that the record's titles
keep the term that tells a heading from its siblings:

| Heading | Term pinned | Basis |
|---|---|---|
| 2.7.3 Summary of Clinical Efficacy; 2.7.4 Summary of Clinical Safety; 2.7.5 Literature References; 2.7.6 Synopses of Individual Studies | efficacy, safety, literature (and synopses, in the term group) | **Search extract** of ICH M4E(R2): FDA-hosted https://www.fda.gov/media/93569/download and ICH-hosted database.ich.org/sites/default/files/M4E_R2__Guideline.pdf, 2026-10-05. The extract described 2.7.3 as the summary of clinical efficacy, 2.7.4 as the summary of clinical safety, 2.7.5 as references and 2.7.6 as synopses of individual studies. |
| 2.5 Clinical Overview; 2.7 Clinical Summary | overview / summary | **Recall** (ICH M4E(R2)); consistent with the record. |
| 2.6.2 Pharmacology Written Summary; 2.6.3 Pharmacology Tabulated Summary; 2.6.4 Pharmacokinetics Written Summary; 2.6.6 Toxicology Written Summary | pharmacology / pharmacokinetics / toxicology; written / tabulated | **Search extract** of ICH M4S(R2): FDA-hosted https://www.fda.gov/media/71628/download and database.ich.org/sites/default/files/M4S_R2_Guideline.pdf, 2026-10-05. The extract named each of the four headings with those words. |
| 3.2.S Drug Substance; 3.2.P Drug Product | substance / product | **Recall** (ICH M4Q(R1)), as in ich-m4-headings.ts. |
| 4.3 Literature References has no subdivisions; single-dose toxicity is 4.2.3.1 (so "4.3.1" is not a heading) | pin: 4.3.1 is not a heading of the record | Already established and labelled in g-ich-m4-headings-facts.md (ICH M4 organisation / M4S). |

The term groups are efficacy/safety/pharmacodynamic/literature/synopses/biopharmaceutic,
pharmacology/pharmacokinetic/toxicology, written/tabulated, overview/summary and
substance/product. They are a test heuristic, not a regulatory fact. Finding 33
named the last four groups. This step added the clinical-summary subject group
so that the two historical defects are caught: the orchestrator's 2.7.3
"Summary of Clinical Pharmacodynamics" and 2.7.5 "Summary of Clinical Safety".

## Found, not fixed here (owned elsewhere; see needs_elsewhere)

- `server/services/market-specs/document-template-library.ts`:
  - The 2.4 Nonclinical Overview template numbers its parts 2.4.1–2.4.6, and the
    2.3 template uses "2.3.Intro".
  - A search extract of ICH M4S(R2) 2.4 (database.ich.org M4S_R2_Guideline.pdf,
    EMA-hosted M4S, FDA-hosted https://www.fda.gov/media/185340/download, all
    2026-10-05) lists the overview's content "in the following sequence":
    overview of the nonclinical testing strategy, pharmacology,
    pharmacokinetics, toxicology, integrated overview and conclusions, list of
    literature references. The extract showed no numbers. That they are
    unnumbered in the guideline is **recall-strength**, because the extract
    cannot prove that numbers are absent.
  - The record has no 2.4.x heading, so the contract reports these codes as
    "not an ICH M4 heading". The library is therefore not registered in this
    file. Its owning step should either decide the numbering or strip the codes
    and register the library in its own consistency file.
- `templates/ectd/fda_template.xml` carries Modules 2–5 nodes that are not M4
  headings (finding 33(f), e.g. m2-2-1). It is not registered here.
