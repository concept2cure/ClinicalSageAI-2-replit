# g-stf-name-tags-and-shape — regulatory facts relied on (2026-10-05)

Finding 36 (`stf-naming-and-file-tags`), the naming, file-tag and XML-shape part.
The TRC 1789 coverage part is step `g-stf-1789-fail-closed`.

fda.gov, ich.org and admin.ich.org are refused by this environment's egress
policy, so no document was opened. "Regulator text (search)" means the passage
was read in web-search results quoting the regulator-hosted document on
2026-10-05, not in the document itself. Everything else is labelled recall.

| # | Fact | Basis | Source / checked | Where used |
|---|---|---|---|---|
| F1 | The STF XML file name starts with "stf-", then the sponsor's study-id, then ".xml". | Regulator text (search) | ICH eCTD STF Specification v2.6.1, https://fda.gov/media/159383/download (FDA-hosted copy); also https://admin.ich.org/sites/default/files/inline-files/STFV2-6-1_0.pdf (2026-10-05) | `stfFileName`, `StfFile.fileName`; the packager writes `${folder}/${file.fileName}` |
| F2 | In the STF, file-tags are heading elements inside the doc-content element. The study is described by the study-identifier element, which holds title, study-id and category. | Regulator text (search) | Same STF v2.6.1 copies (2026-10-05) | `renderStf`: `<study-identifier><title/><study-id/></study-identifier>`, `<doc-content>…<file-tag/></doc-content>` |
| F3 | FDA eCTD validation 1735 (high severity, one of the study-data TRCs effective 2021-09-15) requires the correct STF file-tags on every standardized dataset and its define.xml. | Regulator text (search) | https://www.fda.gov/media/160970/download, https://fda.gov/media/135256/download (2026-10-05) | `checkStfLeaf` throws `FDA TRC 1735` |
| F4 | The 1735 tags: .xpt is `data-tabulation-dataset-sdtm` (SDTM), `data-tabulation-dataset-send` (SEND) or `analysis-dataset-adam` (ADaM). define.xml is `data-tabulation-data-definition` (SDTM and SEND) or `analysis-data-definition` (ADaM). | Regulator text (search) | https://fda.gov/media/135256/download, https://www.fda.gov/media/123099/download, https://fda.gov/media/160960/download (2026-10-05) | `STF_DATASET_FILE_TAGS` (basis `FDA_STUDY_DATA_TRC`). The plan listed the SEND tag as recall; the 2026-10-05 search found it in FDA-hosted TRC material, so it is regulator text (search). |
| F5 | The commonest 1735 error is a wrongly tagged define.xml. | Regulator text (search) | https://fda.gov/media/160960/download (2026-10-05) | Why define.xml is checked as strictly as .xpt |
| R1 | Element nesting below study-identifier: `study-document` holds `doc-content` elements. Each doc-content has `xlink:href` = the relative path to index.xml + `#` + the leaf's ID there, an optional `title` and one or more `file-tag` elements. | Recall | Not read | `renderStf` |
| R2 | Every file-tag carries `info-type="ich"` (the dataset tags are part of the ICH STF vocabulary). The verifier saw `<file-tag name="legacy-clinical-study-report" info-type="ich"/>` quoted from the spec in search. | Recall (one example seen in search) | fda.gov/media/159383 not opened | `renderStf` writes `info-type="ich"` on every tag |
| R3 | The STF DTD is `ich-stf-v2-2.dtd`, so `dtd-version="2.2"`. The old value "2.6.1" is the specification's version, not the DTD's. | Recall | Not read | `STF_DTD_VERSION` |
| R4 | `<category>` is a named, typed value (name and info-type attributes, e.g. species, route, duration, control type), not free text. `clinical-study-report` is not a category. | Recall | Not read | The generator no longer writes `<study-category>` or a default category. A supplied `studyCategory` is reported in `warnings`. |
| R5 | The document file-tag vocabulary (`study-report`, `synopsis`, `protocol-or-amendment`, `sample-case-report-form`, `statistical-methods-interim-analysis-plan`, `legacy-clinical-study-report`, `pre-clinical-study-report`, `annotated-crf`, `data-listing-dataset`, …). `study-report-body` and `sample-crf`, used in fixtures, are probably not ICH tags. | Recall | Not read | `STF_DOCUMENT_FILE_TAGS` (basis `recall(...)`). Warns only; nothing is refused on it. |
| R6 | A leaf deleted in this sequence is not tagged in the STF (no file ships). | Recall | Not read | `generateStfFiles` drops `operation: 'delete'` leaves |
| R7 | eCTD file names are lower case a-z, 0-9, '.', '-', at most 64 characters (ICH eCTD v3.2.2 Appendix). | Recall, as already recorded on the platform's one copy | `FILENAME_PATTERN`, `server/services/ectd/ectd-regional-rules.ts` | `stfFileName` reuses it. No second copy. |

## Departure from the plan: case-folding the study id

The plan said an upper-case study id should be refused. This change instead
case-folds it for the file name only and keeps `<study-id>` verbatim. A study
id that still breaks the file-name rule after folding (space, '&', '_', '/', too
long) is refused, and so is a pair of ids that fold to the same name.

Why: FDA's validation compares STUDYID in ts.xpt with the STF's study-id. For
studies that started on or before 2023-03-15 that comparison is part of 1734 (F3
in `g-study-data-trc-requirements-facts.md`); for studies that started after
2023-03-15 it is validation 1738 (medium severity, all sections except 4.3, 5.2,
5.4 and 5.3.6), and 1734 no longer checks the study id. Basis: regulator text
(search), FDA TRC presentations https://www.fda.gov/media/169452/download and
https://www.fda.gov/media/169455/download (Study Data TRC, Spring 2023), seen in
a fda.gov-restricted search, checked 2026-10-05. The exact cut-over wording
("started after March 15th, 2023") is from the search summary of those decks, not
read from the PDFs (WebFetch to fda.gov is blocked). Requiring a lower-case
study-id would make every sponsor whose STUDYID is upper case (the usual case,
e.g. `ABC-301`) either misstate the study-id or fail the TS match. The file name
must be lower case (R7). The two rules are satisfied together only by keeping the
id verbatim in the XML and folding it in the name. Whether FDA's validator
compares the file-name suffix to study-id case-sensitively is **not known**
(recall gap, owed to fda.gov/media/159383 and the eCTD validation criteria).

## Not done here (owed elsewhere)

- TRC 1789 coverage, the packager's silent filter, and `auditStudyIdTagging`:
  step `g-stf-1789-fail-closed`.
- `FDA_STUDY_DATA_TRC.ref` still reads "(1734, 1736)"; 1735 and 1789 belong in
  it, and in the rule corpus (`g-acceptance-corpus-fold`).
- `generateStfFiles` returns `warnings`, but `SubmissionBundle.stf`
  (`server/services/submission-gateways/types.ts`) has no field to carry them.
  The packager therefore cannot yet show them to the user.
- An STF in a later sequence should reference the study's leaves from earlier
  sequences too (`../0000/index.xml#ID`). This generator tags only the leaves
  of the current sequence (recall; not changed).
