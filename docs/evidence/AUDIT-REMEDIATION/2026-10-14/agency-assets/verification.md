# Official filing assets — O02/D7, 2026-10-14

The current official FDA eSTAR Program page was read verbatim (HTTP200; full
HTML and headers preserved). The three linked government interactive PDFs were
acquired without modification under the directory's existing vendoring policy.
The PDF XFA version banners confirm nIVD/IVD 7.1 and PreSTAR 3.1 dated 2026-09-21;
all SHA-256 pins are in `assets/estar-templates/checksums.txt` and the source
URLs/byte counts/hashes in `template-acquisition.json`.

The actual 7.1 forms declare every primary/secondary path in the six existing
marketing maps and include it in their datasets skeletons. Enumeration measured
1,314 nIVD fields (519 fillable), 1,573 IVD (603 fillable), and 1,109 PreSTAR
(466 fillable). `template-map-validation.json` reports zero missing marketing
paths. The existing actual-template script/recomputation suite passed 23/23
against the externally staged new PDFs before replacing repo assets.

Changing registry tests to expect these acquired current bytes and official
current-table provenance first produced 4 failures/17 passing. The first wider
regression produced 172 passing/1 stale pinned-version fixture; the fixture was
updated to the new current bytes while retaining stale7.0 refusal tests. The
corrected registry/currency suites pass 21/21. The final complete rerun passes **173/173 across seven suites**; all three
exact FDA asset checksums also pass. Logs are filed here. Existing independent PDF-reader checks pass but emit parser warnings;
no interactive Adobe/agency acceptance evidence is claimed.

One official PreSTAR PDF now serves Q-Sub/IDE/513(g) descriptors. The production
fill still refuses empty verified PreSTAR maps. Correct mapping, form behaviour,
attachment routing and an independently rendered completed request remain
engineering qualification work, explicitly surfaced by filing readiness. A PDF
on disk is not a completed request. The subsequent remediation implements four
verified shared administrative mappings and exact cover-letter embedding,
connects their native preparation UI, and preserves separate completion/filing
refusals. Current evidence and remaining measured form constraints are in
[prestar-prefill-verification.md](../prestar-prefill-verification.md).

Safe local preflight uses checksums, targeted actual-template tests and
`node scripts/ops/ga-readiness-report.mjs --all --json`. The checked-out environment
has no deployment/provider credentials, so the report has 35 blocked rows and an
expected nonzero exit; it is not staging-launch evidence. Template presence now
reads 9/9 logical descriptors over 3 physical official PDFs, independently of the
blocked PreSTAR map row and other prerequisites.

## Acquisition dependencies left explicit

The FDA eCTD source page moved from `/industry/...` (observed 404) to
<https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd>
(observed 200). The canonical source pointer was corrected. EMA's Module1 page
(observed 200) names implementation guide 3.1.1 and validation criteria 8.2; no
DTD bytes/version metadata were invented or substituted. The ICH landing page
returned a JavaScript shell, which is not a read of normative specification text.

[The DTD vendoring runbook](../../../../runbooks/ectd-dtd-vendoring.md), step 1,
requires: “Counsel signs off per DTD. **Do not proceed to step 2 until every DTD
has a sign-off.**” No such signoff was supplied. Current official source pages
and downloadable-document links are preserved as a concrete review packet;
DTD/stylesheet acquisition and full external validator qualification remain
blocked on that approval, not on a fabricated egress-policy explanation.

The initial recognized-standards probe read only the search page. The subsequent
complete acquisition found its unfiltered browser export form, obtained the
official CSV and acquired all 1,738 identity-matched official SIS records
(HTTP200, zero failures). The complete normalized dataset is now vendored;
canonical loader/lookup verification and 53 focused service/UI regressions pass,
including actual acquired-data mounted UI cases with explicit association scope.
It contains 1,621 product codes and 7,582 literal FDA-published associations;
681 complete records with no published code retain empty arrays. No association
was inferred. Precise cumulative list/date provenance, exact source hashes,
normalization rules and the separate list 066/067 publication distinction are
in [recognized-standards/verification.md](recognized-standards/verification.md).
The current GA report has 8 ready/34 blocked rows after this asset acquisition;
it remains a local unconfigured preflight, not staging-launch evidence.
Recognition records do not license the SDO standards' full copyrighted texts.

The official FDA AS2 guide was read separately; its current supported cipher
facts are preserved in `fda-as2-guide-provenance.json` and text. This improves
protocol-source evidence; it is not an agency UAT, credential issuance or receipt.
