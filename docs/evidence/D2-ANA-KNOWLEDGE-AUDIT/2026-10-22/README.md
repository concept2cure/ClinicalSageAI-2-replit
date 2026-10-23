# D2 — AnA's question flows and war-game auditors stop telling clients wrong regulatory facts

Row **D2**. Audit claimed on the board 2026-10-21. The corrections were filed on 2026-10-22.

## What already exists

This change corrects text. It adds no capability.
- The question flows live in `server/services/ana/intelligence-questions/flows/*.ts`. They are AnA's guided interviews for IND, NDA, BLA, CSR, protocol, labeling, CMC, stability, PMA, 510(k), risk management, briefing books and SOPs. Their `question`, `guidance`, `helpText`, option labels and `regulatoryReference` strings are shown to clients as they answer.
- The war-game auditors live in `.../war-game/auditors/*.ts`. They are the deterministic reviewers that return findings with a regulatory reference.
- Nothing was rebuilt or duplicated. Every edit is in place.

## Method

1. `audit-workflow.js.txt` (the workflow script, stored as text so it is not linted as code) was the workflow that ran. It used:
   - one finder per file, which read the file and listed statements of regulatory fact it believed wrong, with the exact quoted text;
   - independent verifiers per finding, prompted to refute it.
2. Of 325 candidate findings, **322 survived verification**, and 3 were rejected. `confirmed-findings.json` holds each one: file, line, severity, quote, error and correct fact.
   - Severity: 30 high, 145 medium, 147 low.
3. Six agents applied the corrections, each owning separate files, with this brief:
   - change only the wrong statement;
   - keep option `value`s and question `id`s, which are machine keys;
   - where a sub-paragraph, title or year was uncertain, drop that pinpoint rather than replace one fabricated citation with another.

**Every correction is recall.** eCFR, ich.org and fda.gov are not reachable from the build environment. The verifiers and fixers worked from model knowledge, so treat these as reviewer-grade corrections and not as text checked against the source. Places where a fixer was unsure are listed below.

## Measured before (6b63513e4)

`tests/regulatory/ana-knowledge-audit.test.ts` failed on unchanged trunk (`red-at-6b63513e4.txt`):
- 312 of the 322 quotes were present verbatim. The other 10 quoted elided text, and those were fixed by reading the context.
- The recurring miscitations were present too:
  - REMS cited to 21 CFR 314.42, a section that does not exist (the authority is FD&C Act 505-1);
  - "follow-up within 8 additional days" attributed to 312.32(c)(2);
  - companion diagnostics cited to 21 CFR 809.30, which covers analyte specific reagents.

Examples by class:
- **Retired regimes cited as current.**
  - QSR sections (820.20, .30, .70, .75, .90, .184) after the QMSR took effect on 2026-02-02. They now point to 21 CFR 820.10 and the ISO 13485:2016 clause.
  - 21 CFR 610.11 general safety test (removed in 2015).
  - Drug-interaction guidances that ICH M12 has replaced.
  - Q3C(R8), now Q3C(R9).
  - The 2020 ISO 10993-1 guidance, now the 2023 version.
  - The QSR "ISO 13485 certification expected" text.
- **Sections that do not exist, or are misnumbered.** These include E2B(R3) "Section 2.x", E2A "Section IV", MEDDEV and ICH Q1A/Q1E/Q6A/Q10 section numbers, Form 1571 item numbers, and the 21 CFR 312.23 and 314.50 paragraphs.
- **Requirements that are not requirements.**
  - A three-batch PPQ minimum.
  - A 20% missing-data threshold.
  - A mandatory benefit-risk table.
  - A five-dimension FDA benefit-risk framework (FDA's has four).
  - FDA requiring ISO 13485 certification.
  - 21 CFR 14.25 used as an advisory-committee content rule.
- **Wrong clocks and triggers.**
  - PDUFA goal dates for non-NME versus NME applications.
  - Paragraph IV notice timing.
  - iPSP timing, including the orphan exemption for molecularly targeted oncology drugs.
  - SUSAR clock start.
  - Biennial device inspections.

## Change

- **31 files** in `server/services/ana/intelligence-questions/`, string text only, except for three changes:
  - The 12-month exposure threshold in `nda-submission.ts` went from 300 to 100 subjects, per ICH E1. The check's field id is unchanged.
  - A `pdac` option (Psychopharmacologic Drugs Advisory Committee) was added to the advisory-committee list in `briefing-book.ts`. Grep confirmed no code reads those values.
  - The transitional device (`class_ii_pma`, now labelled "deemed Class III") is read as **Class III**, not Class II, in `programme-facts.ts`. FD&C Act 520(l) puts transitional devices in Class III, and FDA calls for PMAs only for Class III. The PMA caution in `shared/regulatory/pathway-cautions.ts` no longer says that a device "reclassified into Class II, for which FDA has called for premarket approval" can take a PMA. Both pinning tests were updated, with a dated note, in `every-offered-value-is-read.test.ts` and `project-setup-projection.test.ts`.
- **Repeat occurrences:** where an error text named other lines repeating the same wrong citation, those were fixed too, along with a few unlisted repeats of the same error. The two cover-letter lines in `nda-submission.ts` were fixed the same way.

## Green

- `tests/regulatory/ana-knowledge-audit.test.ts` passes 3/3:
  - the fixture holds 322 findings;
  - no quote remains in its file;
  - the three recurring miscitations appear nowhere in the 31 files.
- No existing test had pinned any of the wrong text.
- Typecheck shows 0 errors, and the ESLint warning ratchet shows no file changed its count.
- The suites over the flows, auditors, regulatory, c2c, ana, cmc and shared tests: see `green.txt`.

## Where a fixer was unsure (recall; review against the source when reachable)

- **Drug guidances and EU safety reporting:**
  - The Adaptive Designs guidance section pinpoint was removed.
  - Diversity Action Plan final-guidance status is stated as a draft (June 2024) plus FDORA 3601.
  - EU SUSAR reporting is cited to CTR Art. 42.
- **NDA review and labeling:**
  - The PK subsection is cited as 201.57(c)(13)(i), without a sub-letter.
  - The Formal Meetings guidance is cited by title, with no year or status.
  - The REMS guidance years were dropped.
- **IND content:**
  - Genotoxicity is cited as ICH M3(R2) Section 9; the finding suggested Section 7.
  - The Form 1571 item numbers are from recall.
  - ICH M12 is dated August 2024.
  - Nitrosamine Rev. 2 is dated September 2024.
- **Biologics and stability:**
  - The October 2025 draft guidance on comparative efficacy studies for biosimilars is cited by topic.
  - The removal of the autologous CAR-T REMS is dated June 2025.
  - The stability-auditor citation formerly "Q1E Section 4.1" is mapped to Appendix A.
- **Devices and CER:**
  - The cybersecurity guidance is cited as "June 2025", by topic.
  - The 510(h) amending act is not named.
  - The MEDDEV 2.7/1 Rev. 4 appraisal stage is cited as Section 8.
  - Sterilization validation is cited to ISO 13485 clause 7.5.7.
- **Safety reporting:**
  - The E2B(R3) data-element mappings are at group level (E.i, G.k.9.i).
  - Dechallenge and rechallenge are tied to E2A II.A.2.

## Not changed, handed on

- **Out of scope for this pass:** citations the audit did not list, which fixers saw and did not touch. They were outside the 322 and are left for a second audit pass:
  - E10 sections 2.6.1 / 2.1.3 in `protocol-auditor`;
  - Directive 2001/83/EC Art. 104a for the EU RMP;
  - E2D section numbers and E2B "Section 1.8" in `safety-narrative-auditor`;
  - `211.186` traceability lines in `sop-auditor`;
  - Section 9 state-of-the-art lines in `cer-auditor`.
- **Logic, not text:**
  - `nda-auditor` still runs the missing-patent-certification check for 505(b)(1) applications. Its text now explains both cases.
  - The `bla-auditor` batch-count check still uses three batches as its "generally accepted minimum" heuristic, which it does not attribute to FDA.
  - `safety-narrative-auditor` now reads `days_to_report` as counted from the sponsor's receipt. Whether the interview asks for that quantity should be checked.
- **Golden journeys:** `device-510k-estar.journey` and `cer-eu-mdr.journey` fail before any wording is checked, because their test database lacks `regulatory_programs.eu_mdr_class`. The fixer reported this; see `green.txt` for the run.
