# b1-consistency-defects — regulatory facts relied on

Checked 2026-10-04. Regulator sites are blocked for direct fetch in this
environment; the regulator-hosted documents below were found by web search
(restricted to fda.gov / ecfr.gov) on 2026-10-04, and the statements are taken
from the search result's summary of those documents.

| # | Fact | Source | Confidence |
|---|------|--------|------------|
| 1 | CDER may refuse to file an NDA under 21 CFR 314.101(d)(3) when the application is incomplete because it does not **on its face** contain information required under FD&C Act section 505(b) and 21 CFR 314.50. The RTF guidance is about completeness on the face of the application. | FDA, *Refuse to File: NDA and BLA Submissions to CDER* (guidance for industry), https://www.fda.gov/files/drugs/published/Refuse-to-File--NDA-and-BLA-Submissions-to-CDER-Guidance-for-Industry.pdf | regulator-text (via search result, 2026-10-04) |
| 2 | CDER's internal procedure for the filing review is a MAPP (Good Review Practice — Refuse to File). | FDA CDER MAPP, https://www.fda.gov/files/about%20fda/published/Good-Review-Practice---Refuse-to-File.pdf (cited by the verification pass); a CDER MAPP result also returned at https://www.fda.gov/media/87035/download | regulator-text (URL from search, 2026-10-04; contents not re-read here) |

## What this step concludes from them

- A within-document difference between two labelled values (two arms' n, two
  dose cohorts, a narrative N that differs from a table N) is a defect a
  reviewer will query. Neither source names it as a refuse-to-file ground, so
  the tool no longer tells AnA "this is RTF territory". The new wording states
  only the fact: the same document-level quantity is stated with two values;
  fix it before finalizing.
- Nothing in this step depends on recall-only regulatory content.

## Not changed here (outside this step's files)

- `server/services/ana/document-intake-tool-defs.ts:199` still describes
  check_numerical_integrity as "the classic 'numbers drift between text and
  table' failure that triggers FDA RTFs". Same unsupported claim; it needs the
  same correction in that file.
