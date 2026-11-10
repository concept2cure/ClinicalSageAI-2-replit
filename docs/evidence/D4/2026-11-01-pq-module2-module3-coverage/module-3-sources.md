# CMC / Module 3 gold-bank tasks: sources and authoring notes

For founder decision P-56 item 4 (P-31 condition 4, `docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md` §4).
The output is `m3-tasks.json`: 24 tasks, all `docType: "module-3-quality"`, 12 generation and 12 extraction.
They were retrieved and authored on 2026-11-01.

## What already exists

- `server/eval/doc-quality/gold-tasks.json` v0.5.0 holds 72 tasks across `510k`, `cer` and `ind` (12 generation and 12 extraction each). It has no Module 3 or CMC document type. Its `$comment` says the 0.5.0 authored passages are *fictional*. **These 24 are not fictional.** Each `input` is real published text, so whoever merges them must not inherit that sentence for them.
- The rules every task must pass are in `server/eval/pq/__tests__/gold-bank-floor.test.ts`. The scoring code is `server/eval/doc-quality/doc-quality-metrics.ts` (`norm`, `sectionCoverageScore`, `forbiddenPatternHits`, `fieldExtractionScore`, `buildGenerationPrompt`, `buildExtractionPrompt`).
- Nothing reads the bank against a strict key schema. The new `source` object is an extra key that `GoldDocTask` ignores, and `docType` is free-form (`run-pq.ts`, `verify-pq-record.ts`, `ga-readiness-report.mjs` count by it).
- The bank's SHA-256 and version are recorded per PQ run (`run-pq.ts`, `verify-pq-record.ts`), not pinned anywhere. Merging changes the hash, which is expected because no PASS record exists. Bump `version` when merging.

## How the text was obtained

- Retrieval used only the PubMed MCP tools: `search_articles`, then `get_copyright_status`, then `get_full_text_article` (PMC). No open web.
- **Licence.** All 11 articles returned `source: "pmc"`, `license.type: "CC BY 4.0"`, `url: https://creativecommons.org/licenses/by/4.0/`, `is_open_access: true` from `get_copyright_status`. The PMC full-text export the tool returns has no in-body licence statement, so that record is the licence evidence.
- **Excluded for licence.** Articles whose tool record gave only "© The Author(s)" with no licence type were excluded even where the journal is OA by policy: BMC Chemistry 41241756 (mesalamine) and Scientific Reports 41519856. The mesalamine paper also contradicts itself: its Methods give methanol:water 60:40 on a 150 mm column, and its Conclusion gives phosphate buffer:ACN 70:30 on a 250 mm column. That is unsafe ground truth.
- **Excluded for scope.** Lactoferrin (PMID 34371755) is a protein, outside the P-28 small-molecule boundary.

## Edits made to the source text (the only ones)

`m3tools/build.py` makes every edit and asserts each one before it applies it:

1. It removes empty citation brackets left by the export (`[]`, `[,]`, `[,,]`).
2. It removes empty figure/table call-out parentheses (`()`, `(,)`, `(and)`, `(,,,,,,and)`).
3. It drops named call-out phrases or sentences, each listed per task in `build.py`:
   - itraconazole-stress: " listed in"
   - itraconazole-hplc: ", as listed in,"
   - latanoprost-forced-degradation: "The results are presented in. The chromatograms … are included in the."
   - latanoprost-lod-loq: "presents the experimentally determined limits."
   - miglitol-forced-degradation: "The summary of the forced degradation is captured in."
   - ramipril-impurities: "; this is demonstrated in"
   - ramipril-specificity: ", as demonstrated in" (twice) and "The regression parameters are provided in."
   - bupropion-release: the leading "From, " (the remnant of "From [Figure N],"). That input therefore starts in lower case, "it became evident…".
4. It joins paragraphs with one space and collapses whitespace.
5. One excerpt is truncated at a sentence boundary: latanoprost-forced-degradation ends after "…into a pharmacologically active moiety.", which is mid-paragraph.

**Artefacts kept verbatim.** The PMC export lost sub- and superscripts. Examples: "HO" for H₂O₂, "0.5 mg mLsubjected", "ESand", "Nimbexdrug", "an= 6", "(NH)(HPO)". The article title "Cistracurium" is also spelled that way in the original. All of these were left as retrieved, because correcting them would be rewriting. No expected value depends on one.

## Scoring hazards the merger should know

- **Micro sign.** `norm()` does no Unicode normalisation. Sources use both U+00B5 µ and U+03BC μ. Expected values that contain one use the exact code point of their own input:
  - itraconazole `assay_working_range` and `related_substances_working_range`
  - latanoprost `verification_concentrations` and `reporting_threshold`
  - levothyroxine `injection_volume`
  - miglitol `injection_volume`

  A model that retypes μ as µ will miss those fields. Every other value avoids µ, ×, ≥ and ≤ where a shorter exact substring exists, for example `"0.99"` rather than `"≥0.99"`, and `"5.0"` / `"2.0%"` for the levothyroxine system-suitability limits.
- **Not literal.** One `requiredSections` entry does not appear literally in its input: "mass balance" (itraconazole-stress). The excerpt defines it in place: "the MB, calculated by the summatory of the degraded ITZ peak and the observed impurities". `buildGenerationPrompt` hands the model the section names, so a faithful draft will name it.
- **Forbidden patterns.** They are positive over-claims chosen so that a faithful negation does not contain them verbatim. For example, "chemically stable for up to 7 days" is not a substring of "chemically stable for up to 24 h". Patterns whose negation is plausible were left out, such as "not completely stable" or "not fully characterized". The residual risk is that a draft quotes a forbidden phrase in order to deny it.

## Judgement calls (unsure; review)

- **CTD section tags are my mapping.** The articles do not state them. Forced degradation of a drug substance is tagged 3.2.S.7.3. Forced degradation in or of a drug product is 3.2.P.5.5. Specification and acceptance-criteria passages are 3.2.P.5.1.
- **Two sources are hospital-compounded preparations,** not IND drug products: cisatracurium 10 mg/mL injection and meropenem 50 mg/mL eye drops. Their stability designs (storage condition, time points, 90–110 % criterion, ICH Q1E shelf-life estimate) are what a 3.2.P.8 section summarises, which is why they were used. Levothyroxine is a marketed-product stability study.
- **Cisatracurium acceptance limits** (4 %, 4.3 %, 2.5 %, 14.4 %) are stated in the article as the USP monograph's. They are extracted as the passage states them, not as independently verified compendial values.
- **Velpatasvir** covers a drug substance and a copovidone solid dispersion (an intermediate). The bupropion/naltrexone tablets are novel compounded bilayer matrices.
- **No `candidateContent` or `candidateExtraction`.** None was captured.

## Self-check

Run `python3 -I m3tools/selfcheck.py m3-tasks.json m3src server/eval/doc-quality/gold-tasks.json`. It checks:

- 12 + 12 tasks;
- ids unique, and none already in the bank;
- every expected value contained in its own input under `norm()`;
- no forbidden pattern in its own input;
- no forbidden pattern that is a single word under 8 characters;
- licence on the allowed list;
- input lengths and counts within range;
- no captured candidates;
- **verbatim provenance.** Each input must be a sequence of slices of the retrieved full text, in source order, and every gap between two slices must match a call-out-remnant pattern. Any other gap fails.

The output is in `m3-selfcheck.txt` (PASS).

**Shown failing.** `m3-selfcheck-mutated.txt` is the same checker on a copy with 10 deliberate faults. It reports all 10 and exits 1. The faults were:

- an expected value not in its input;
- `"proven"` as a forbidden pattern;
- a forbidden pattern that occurs in its own input;
- an "All rights reserved" licence;
- a duplicate id;
- an id that clashes with the bank;
- a one-number substitution (16.3 → 18.3 months);
- a one-word rewording;
- a fabricated `candidateContent`;
- an input that is too short.

## Articles
| PMID | PMCID | DOI | Journal, year | Licence | Title |
|---|---|---|---|---|---|
| 42515747 | PMC13414520 | 10.3390/ph19071066 | Pharmaceuticals (Basel), 2026 | CC BY 4.0 | Development and Optimisation of a Stability-Indicating Analytical Method for Itraconazole in Drug Product by High-Performance Liquid Chromatography Using a QbD Approach |
| 40430439 | PMC12114650 | 10.3390/ph18050619 | Pharmaceuticals (Basel), 2025 | CC BY 4.0 | Developing a Chromatographic Method for Quantifying Latanoprost and Related Substances in Glaucoma Treatments |
| 39861185 | PMC11768339 | 10.3390/ph18010124 | Pharmaceuticals (Basel), 2025 | CC BY 4.0 | The Stability-Indicating Ultra High-Performance Liquid Chromatography with Diode Array Detector and Tandem Mass Spectrometry Method Applied for the Forced Degradation Study of Ritlecitinib: An Appraisal of Green and Blue Metrics |
| 35884151 | PMC9311562 | 10.3390/antibiotics11070897 | Antibiotics (Basel), 2022 | CC BY 4.0 | Forced Degradation Studies and Development and Validation of HPLC-UV Method for the Analysis of Velpatasvir Copovidone Solid Dispersion |
| 27754407 | PMC5198025 | 10.3390/scipharm84040654 | Scientia Pharmaceutica, 2016 | CC BY 4.0 | Development and Validation of Miglitol and Its Impurities by RP-HPLC and Characterization Using Mass Spectrometry Techniques |
| 34683893 | PMC8538641 | 10.3390/pharmaceutics13101600 | Pharmaceutics, 2021 | CC BY 4.0 | Solid-State Stability Profiling of Ramipril to Optimize Its Quality Efficiency and Safety |
| 37242646 | PMC10221331 | 10.3390/pharmaceutics15051404 | Pharmaceutics, 2023 | CC BY 4.0 | Cistracurium Besylate 10 mg/mL Solution Compounded in a Hospital Pharmacy to Prevent Drug Shortages: A Stability Study Involving Four Degradation Products |
| 38256876 | PMC10819580 | 10.3390/ph17010042 | Pharmaceuticals (Basel), 2023 | CC BY 4.0 | Potency and Powder X-ray Diffraction (PXRD) Evaluation of Levothyroxine Sodium Tablets under Ambient, Accelerated, and Stressed Conditions |
| 42654088 | PMC13516646 | 10.3390/pharmaceutics18080971 | Pharmaceutics, 2026 | CC BY 4.0 | Stability Study of Meropenem 50 mg/mL Eye Drops in Polypropylene Dropper Bottles |
| 42653752 | PMC13516048 | 10.3390/ph19081255 | Pharmaceuticals (Basel), 2026 | CC BY 4.0 | AQbD-Driven RP-HPLC Method for Rapid Dissolution Monitoring of Amiodarone Hydrochloride Tablets Without Sample Dilution |
| 36499947 | PMC9739382 | 10.3390/ma15238451 | Materials (Basel), 2022 | CC BY 4.0 | Dissolution Assay of Bupropion/Naltrexone Hydrochloride Salts of Bilayer Composition Tablets Following the Development and Validation of a Novel HPLC Method |

## Tasks

| id | type | CTD tags | source section | chars |
|---|---|---|---|---|
| `m3-itraconazole-stress-mass-balance-generate` | generation | 3.2.P.5.5, 3.2.P.5.3 | 42515747: 2. Results and Discussion > 2.4. Selectivity Study of the Optimised Analytical Method (stress study results, paragraphs 4-6) | 1426 |
| `m3-latanoprost-forced-degradation-generate` | generation | 3.2.P.5.5, 3.2.P.5.3 | 40430439: 2. Results > 2.2. Method Validation > 2.2.2. Specificity and Stability-Indicating Power (paragraphs 2-3, second truncated) | 1558 |
| `m3-ritlecitinib-validation-generate` | generation | 3.2.S.4.3 | 39861185: 2. Results and Discussion > 2.2. Method Validation (paragraphs 3-5) | 1153 |
| `m3-ritlecitinib-forced-degradation-generate` | generation | 3.2.S.7.3, 3.2.S.3.2 | 39861185: 2. Results and Discussion > 2.3. Forced Degradation Study (paragraphs 3-5) | 1342 |
| `m3-velpatasvir-forced-degradation-generate` | generation | 3.2.S.7.3, 3.2.P.5.5 | 35884151: 3. Results and Discussion > 3.7. Forced Degradation Studies (paragraph 1) | 974 |
| `m3-miglitol-forced-degradation-generate` | generation | 3.2.S.7.3, 3.2.S.4.3 | 27754407: 3. Results and Discussion > 3.2. Results of Forced Degradation Studies | 726 |
| `m3-ramipril-degradation-impurities-generate` | generation | 3.2.S.3.2, 3.2.S.7.3 | 34683893: 4. Discussion > 4.7. Degradants | 1723 |
| `m3-cisatracurium-shelf-life-generate` | generation | 3.2.P.8.1, 3.2.P.8.3 | 37242646: 3. Results and Discussion > 3.3.3. The HPLC-UV Analysis of Compounded Ampoules (paragraphs 2-5) | 1766 |
| `m3-levothyroxine-accelerated-stability-generate` | generation | 3.2.P.8.3, 3.2.P.8.1 | 38256876: 3. Discussion > 3.1. Possible Role of Excipients on Levothyroxine Tablets Stability (paragraph 1) | 837 |
| `m3-meropenem-in-use-stability-generate` | generation | 3.2.P.8.3, 3.2.P.8.1 | 42654088: 3. Results > 3.2.2. Refrigerated Conditions (paragraphs 2-4) | 925 |
| `m3-amiodarone-dissolution-accuracy-generate` | generation | 3.2.P.5.3 | 42653752: 2. Results and Discussion > 2.4. Method Validation > 2.4.5. Accuracy | 1500 |
| `m3-bupropion-naltrexone-release-generate` | generation | 3.2.P.2.2 | 36499947: 3. Results and Discussion > 3.5. Dissolution Study Results (paragraph 2) | 880 |
| `m3-itraconazole-hplc-conditions-extract` | extraction | 3.2.P.5.2, 3.2.P.5.3 | 42515747: 4. Conclusions (paragraphs 1-2) | 905 |
| `m3-latanoprost-lod-loq-criteria-extract` | extraction | 3.2.P.5.3 | 40430439: 2. Results > 2.2. Method Validation > 2.2.5. Limit of Detection and Quantification (paragraphs 3-4) | 795 |
| `m3-velpatasvir-stress-conditions-extract` | extraction | 3.2.S.7.3 | 35884151: 2. Experimental > 2.4. Forced Degradation Studies | 1108 |
| `m3-cisatracurium-acceptance-criteria-extract` | extraction | 3.2.P.5.1, 3.2.P.8.1 | 37242646: 2. Materials and Methods > 2.4.6. Data Analysis (paragraph 1) | 874 |
| `m3-ramipril-specificity-limits-extract` | extraction | 3.2.S.4.3 | 34683893: 3. Results > 3.1. Validation of the Analytical Method | 907 |
| `m3-levothyroxine-storage-conditions-extract` | extraction | 3.2.P.8.1 | 38256876: 4. Materials and Methods > 4.2. Storage Conditions for Tests Samples | 1175 |
| `m3-levothyroxine-system-suitability-extract` | extraction | 3.2.P.5.2 | 38256876: 4. Materials and Methods > 4.3.1. Levothyroxine Sodium Tablets USP Assay Methods 1 and 2 (chromatographic system and system suitability) | 307 |
| `m3-meropenem-validation-results-extract` | extraction | 3.2.P.5.3 | 42654088: 3. Results > 3.1. Validation of the Analytical Method | 715 |
| `m3-miglitol-related-substances-conditions-extract` | extraction | 3.2.S.4.2 | 27754407: 2. Materials and Methods > 2.2.2. Chromatographic Conditions | 751 |
| `m3-amiodarone-dissolution-procedure-extract` | extraction | 3.2.P.5.2 | 42653752: 3. Materials and Method > 3.5.3. Dissolution Samples | 860 |
| `m3-amiodarone-dissolution-linearity-extract` | extraction | 3.2.P.5.1, 3.2.P.5.3 | 42653752: 3. Materials and Method > 3.6. Method Validation > 3.6.3. Linearity and Range | 1264 |
| `m3-bupropion-naltrexone-dissolution-media-extract` | extraction | 3.2.P.2.2, 3.2.P.5.2 | 36499947: 2. Materials and Methods > 2.5. In Vitro Dissolution Studies | 806 |
