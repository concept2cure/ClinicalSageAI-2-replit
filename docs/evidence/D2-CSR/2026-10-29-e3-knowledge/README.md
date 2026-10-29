# D2 / CSR slice 4 (knowledge part): the E3 knowledge at senior-writer depth

Row: D2 (Authoring). Workstream: W1. Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 4.
This change covers the knowledge part of slice 4, which does not depend on slice 2. It does not cover
converging the synopsis template, the csr-report flow or the auditor (see "Not done" below).

## What already exists

These pieces were extended. Nothing was built beside them.

- `server/services/ind/ctd/csr-e3-sections-plan.ts`, `csr-e3-sections-results.ts` and
  `csr-e3-sections-appendices.ts` hold the one E3 tree (119 headings), which `csr-e3-guidance.ts`
  assembles as `ICH_E3_GUIDANCE`.
  - Before: 34 headings had neither a purpose nor contents. They were mostly in §14 and §16, plus the
    group headings 9.4, 9.5, 10, 11, 11.4, 12.2, 12.3, 12.4 and 12.4.2.
  - Before: no heading carried writing rules, §9.7.1 and §11.4 had no estimand content, and there
    were no E3 Annexes.
- `csr-e3-guidance.ts` `renderE3Brief` is the one renderer. It is reached through
  `requirements-resolver.ts` and serves the AnA tool `get_document_section_requirements`.
- `csr-e3-basis.ts` and `regulatory-basis.ts` hold the basis. Every E3 basis was `recall`.
- `server/services/ana/medical-writing.ts` (`medical_writing_guidance`) had ten global rules and a
  top-level CSR standard. Its therapeutic-area entries had no CSR vocabulary, and psychiatry was an
  alias of neuroscience.
- Searches run: `writing`, `estimand`, `Annex`, `tense`, `sentence pattern`, `CTCAE`, `WHODrug` and
  `reactogenicity` across `server/services/ind/ctd`, `server/services/ana` and `shared/regulatory`. No
  per-heading writing record and no E3 annex record existed anywhere.

## What changed

- **No title-only headings.** All 119 headings now say what they are for or what they carry. Every
  §14–§16 heading carries `presentation`, which covers:
  - TFL numbering 14.1.x, 14.2.x and 14.3.x
  - AE table conventions: count each patient once per PT, SOC and PT ordering, and exposure-adjusted
    incidence
  - grading scales named with their version: CTCAE, DAIDS and the FDA vaccine scale
  - how the 16.1.2 unique CRF pages are selected
  - 16.3.1 CRF selection by the death, SAE and discontinuation-for-AE flags
- **Writing rules on every heading AnA drafts (82 headings).** The new `writing` field is optional and
  added to `OutlineNode` in `server/services/ind/ctd/types.ts`. Each heading gets:
  - its tense and voice
  - its standard sentence, written with slots only
  - its hedging and causality rule
  - "never interpret beyond the data"
- **The report-wide standard is stated once.** It lives in `server/services/ind/ctd/csr-e3-writing.ts`
  and includes:
  - `CSR_WRITING_RULES` (10 topics)
  - `CSR_SENTENCE_PATTERNS`: disposition, demographics, efficacy estimate, time-to-event,
    non-significant, AE frequency, exposure-adjusted, SAE/death, lab shift, narrative opener and
    conclusion
  - `CSR_TERMINOLOGY`: MedDRA, CTCAE, DAIDS, the FDA vaccine toxicity scale, WHODrug and CDISC
- **E9(R1) estimands.** These are in §9.7.1 (contents, writing and pitfalls), §11.4 (purpose and
  writing) and §11.4.1 (contents). The new `ICH_E9_R1` basis is graded recall.
- **E3 Annexes I, II, IIIa, IIIb, IVa and IVb.** `E3_ANNEXES` is in `csr-e3-sections-appendices.ts`.
  Each annex is rendered as "Display model" in the brief of the heading it serves: §2, §16.1.5, §9.1,
  §9.5.1 and §10.1.
  - E3 has no title-page annex. §1 carries its own elements, and Annex II is the signature page.
- **`medical_writing_guidance`** takes a new `section` input.
  - For a CSR it returns `csrWriting`: the rules, the patterns, the terminology, and the requested
    heading's own rules and annexes.
  - An unknown heading returns `sectionNotFound`. It is never answered with another heading's rules.
  - Therapeutic-area `csrVocabulary` was added for oncology (RECIST/iRECIST, PFS, OS, ORR, DoR),
    cardiology (MACE, CEC), neurology, psychiatry (MADRS, PANSS, C-SSRS), infectious disease,
    immunology, endocrinology (HbA1c, hypoglycaemia levels), respiratory, rare disease, vaccines
    (solicited and unsolicited reactogenicity) and general.
  - Psychiatry is now its own entry.
  - The composer is in `server/services/ana/medical-writing-csr.ts`.

## How the basis is graded

The task asked for E3 and E3 Q&A (R1) to be re-read verbatim. That was not possible: fda.gov, ich.org
and database.ich.org were refused by the session's egress policy on 2026-10-29 (curl CONNECT 403, and
WebFetch ENOTFOUND).

As a result, nothing was upgraded to `regulator-text`:

- Eight E3 headings now carry E3's wording as recalled, in `E3_RECALLED_WORDING` (csr-e3-basis.ts):
  §2, §7, §10.1, §11.4.1, §12.2.2, §12.2.4, §12.3.2 and §13. The basis field is
  `RegulatoryBasis.quote`, a new optional field in `shared/regulatory/regulatory-basis.ts`.
- Each of those quotes stays `recall`. The brief renders it as "recalled wording, not yet checked".
- The annexes and E9(R1) are `recall`.
- Tense, voice and sentence shape are graded `platform-convention`, because they are craft and not
  regulation.

The census enforces three rules:

- a `regulator-text` basis must carry a quoted span
- a recalled quote is never shown as read
- every basis passes `basisProblems`

**Owed:** read fda.gov/media/71271 and the E3 Q&A (R1). Then upgrade each matching span to
`regulator-text` with its `checked` date, and correct any span that does not match.

## Proof

- **Red first.**
  - `red-overlay-census.txt`: 5 census tests fail on the unchanged tree (34 title-only headings, 82
    headings without writing rules, 35 §14–§16 headings without presentation, no E9(R1), no annexes).
  - `red-tools.txt`: 8 of 9 handler tests fail.
- **Gates seen failing on the case each exists to catch** (`mutations.txt`). Each mutation was reverted
  afterwards.
  - A figure typed into a writing rule fails.
  - A `regulator-text` basis with no quote fails.
  - A recalled quote rendered as read fails.
  - A brief long enough to be clipped fails.
- **Green** (`green.txt`): the overlay census, the tool handlers (`csr-writing-guidance-tools.test.ts`),
  requirements-resolver, the medical-writing suites, basis-constants-one-home, search-extract-bases
  and regulatory-knowledge-tools.
- **Snapshot.** `requirements-snapshot-delta.json` lists the 124 CSR fingerprints that moved: 118
  headings and the six other §12.2 alias forms. No CTD, lifecycle or outline fingerprint moved.

## Failures in the neighbouring suites that this change did not cause

These failures are already present at HEAD (14b27100d `document-template-library.ts`) or are another
lane's in-flight edit:

- `csr-e3-overlay` "market-specs CSR spine is E3's sixteen headings" and `template-library-truth`: the
  spine now returns all 119 headings.
- `ich-e6r3-citations`: an E6(R2) label in `server/services/ana/skills/library/clinical.ts`, which is
  slice 1's file.

## Not done (rest of slice 4)

- Derive the synopsis template (`clinical-csr-templates.ts`) from §2 and E3 Annex I.
- Key the csr-report flow and csr-auditor to E3 node ids.
- The verbatim re-read.
- The end-to-end critique of §11.4.1 on the slice-2 PUNCH CD3 draft.
- The clinical.study-report skill (slice 1's file) should tell AnA to pass `section` to
  `medical_writing_guidance`.
