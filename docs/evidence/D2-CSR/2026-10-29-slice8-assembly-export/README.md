# D2 — CSR slice 8: complete CSR assembly and export into Submission Center for a very large document

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 8, on the LMN-201 / RePreve study shape (NCT05330182). Launch row: D2 (Authoring, Submission Center). Workstream W1. Board row: "AnA builds a CSR end to end".

Boundary: the D5 CSR-path lane keeps release, review, approval, signing and transmission, plus the AnA tools `draft_safety_narrative`, `narrate_statistical_result` and `record_endpoint_result`. None of those tools was touched, and neither were their handlers in `AnaToolExecutor.ts` or `shared/authoring/csr-scientific-review.ts`. The assembly carries no approval or signature, and its title page says so.

## What already exists

Searched for: assembl\*, TOC, bookmark, outline, hyperlink, GoToR, cross-reference, abbreviation, listing, 16.2, 16.1, appendix, study tagging / STF / file-tag, leaf PDF, PDF/A, Ghostscript, pdfkit, rendered leaf, EctdCompile and 5.3.5. The search covered `server/`, `shared/`, `client/src/` and `migrations/`. `git log --all --diff-filter=D` on `*csr*assembl*`, `*listing*` and `*bookmark*` found no deleted CSR assembler.

| Piece | Path | What it does today | What it did not do (before this slice) |
|---|---|---|---|
| The only CSR assembly path | `server/services/authoring/workflow-source-import.ts` | Takes the hash-verified `csr_section_outputs` of a job into one Authoring document. Every import gets access, scope and hash checks. | It had no TOC, §14, §16, bookmarks, links or leaves, and the assembler could not reach its verified sections and run binding. **Extended** with `materializeCsrAssemblySource`: the same checks, plus the job's study, `source_run_id` and newest generation time. |
| Retained engine tables | `server/services/csr/saved-clinical-tables.ts` `readSavedClinicalTables` | Re-derives the tables from a sealed run, with ACL, digest, seal and receipt checks. | It never returned subject rows, by design. **Extended** with `readRetainedStudyForAssembly`, a server-only read with the same verification plus current-approval checking. The shared verifier was factored out and `readSavedClinicalTables`'s behaviour is unchanged (its suite is green). |
| Engine tables | `server/services/csr-tabulation-builders.ts` `buildCSRTables` | 13 tables, slice 6. | **Reused unchanged.** Numbered for §14 by slice 4's convention. |
| §14 / §16 knowledge | `server/services/ind/ctd/csr-e3-sections-appendices.ts` (slice 4) | Holds the 14.1.x / 14.2.x / 14.3.x numbering and the §16.1.x / §16.2.x contents and applicability. | **Reused.** Every title and every "always / when-applicable / authority-dependent" decision comes from `ICH_E3_GUIDANCE`. |
| Abbreviations | `server/services/ana/medical-writing-qc.ts` `buildAbbreviationList` (`build_abbreviation_list`) | Extracts acronyms and their first-use definition. | It returned the sentence before an acronym as its expansion ("study of an Investigational Medicinal Product"). **Fixed** red first (`red-abbreviation-expansion.txt`). |
| Leaf PDF renderer | `server/services/ectd/leaf-pdf.ts` (pdfkit), `typeset-leaf-pdf.ts`, `leaf-pdf-renderer.ts` (pdf-lib) | Renders one leaf in memory, with one bookmark or heading bookmarks. | It could not stream, nest bookmarks to four levels, set named destinations or link between documents. **Not replaced.** The CSR writer uses the same library as `leaf-pdf.ts` (pdfkit), with `bufferPages:false`, and reuses `toWinAnsiSafe`. |
| Bookmark generator | `server/services/ectd/pdf-bookmark-generator.ts` | Adds an outline to finished bytes (pdf-lib, whole document in memory). | It is not usable for a streamed document. Not changed. pdf-lib is reused to **read back** outlines, name trees and links in the structural check. |
| STF generator | `server/services/ectd/stf-generator.ts` `generateStfFiles`, `STF_DOCUMENT_FILE_TAGS` | Writes one `stf-<study-id>.xml` per study and checks tags. | It received no CSR leaves. **Reused unchanged.** Every CSR tag is asserted to be in its reviewed list. |
| Packager | `server/services/submission-gateways/regional-packager.ts` `packageEctdSubmission`, `EctdLeaf.studyId/stfFileTag`, `crossReferences` | Places study leaves under `m5/5-3-5-1/<study>/`, writes the STF, resolves cross-references and runs the PDF/A grade and DTD checks. | **Reused unchanged.** The assembly emits `EctdLeaf[]` and `CrossReference[]` in exactly its input shape. |
| Cross-reference resolver | `server/services/ectd/cross-reference-resolver.ts` | Resolves leaf-to-leaf references inside the packager. | **Reused** through the packager. |
| PDF/A | `server/services/ectd/pdfa-pipeline.ts` `finalizePdfA` (Ghostscript), `pdfa-readiness.ts` (`ECTD_REQUIRE_PDFA`) | Converts each leaf at packaging when `gs` is installed. | **Reused, not duplicated.** `gs` is not installed in this sandbox, so the packager reports `allPdfA: false` with every leaf listed (`end-to-end-synthetic-lmn201.json`). |
| Rendered-leaf store | `server/services/ectd/rendered-leaf-files.ts` | Lets a server-rendered PDF become a `submission_leaves` source. | **Not yet wired** (see Remaining). |
| EctdCompile / Builder | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx`, `StudyTaggingInputFields.tsx` | Compile, the leaf hierarchy and study tagging, for leaves placed in a sequence. | Not changed. No client control starts an assembly yet (see Remaining). |

Nothing in the repository assembled a CSR before this slice: there was no TOC, no §14 leaf and no §16 listings, as the design inventory already said ("missing").

## What changed

New modules inside the existing csr service, which the design names `csr-assembly.ts`, split by concern so that each file stays under the lint limits:

- `server/services/csr/csr-assembly.ts` is the orchestrator. It produces the leaves in this order: listings, then §14, then the body that links to both. It then runs the structural check and the per-listing source check, and returns `status: 'complete' | 'incomplete'`, `leaves: EctdLeaf[]`, `crossReferences`, `missing`, `notApplicable`, `bodyGaps`, `unresolvedReferences`, `structure`, `listings`, `abbreviations`, `stfWarnings` and the `pdfa` statement.
- `csr-assembly-plan.ts` holds the plan:
  - §14 numbering: 14.1.1 disposition, 14.1.2 populations, 14.1.3 demographics, 14.1.4 conmeds, 14.2.1/14.2.2 efficacy, 14.3.1.1–14.3.1.3 AEs, 14.3.2.1 deaths/SAEs, and 14.3.5.1–3 exposure, labs and vitals.
  - STF roles: body and §14 `study-report`; 16.1.1 `protocol-or-amendment`; 16.1.2 `sample-case-report-form`; 16.1.4 `list-description-investigator-site`; 16.1.5 `signatures-investigators`; 16.1.9 `statistical-methods-interim-analysis-plan`; 16.2.x `discontinued-patients`, `protocol-deviations`, `patients-excluded-from-efficacy-analysis`, `demographic-data`, `adverse-event-listings` and `listing-individual-laboratory-measurements-by-patient`; 16.3 `case-report-forms`.
  - eCTD file names (`csr-body.pdf`, `csr-14-tables.pdf`, `csr-16-2-7-adverse-events.pdf`, …).
- `csr-assembly-body.ts` builds the body in E3 order:
  - §3 is a generated contents list to four levels. Each line is linked and carries its page number, from a two-pass layout that must paginate identically or the assembly fails.
  - §4 is the abbreviation list. A term with no definition at first use is shown as "Not defined at first use in this report".
  - §14 and §16 list every leaf with a link. A missing leaf reads "Not supplied … must be supplied, or declared not applicable with a reason".
  - For §10–12 there are "Supporting outputs" lines.
  - Every "Table 14.x / Listing 16.2.x / Appendix 16.1.x / Section n" in the text is linked.
- `csr-cross-references.ts`: a reference that names nothing in the assembly is left unlinked and reported, so the status is `incomplete`.
- `csr-pdf-writer.ts` is a streaming pdfkit writer:
  - Page objects leave memory as the next page starts. The bytes are hashed on the way to the file, and the writer waits for drain at every page.
  - It writes bookmarks to any depth, named destinations, GoTo links and GoToR links (a sibling leaf by relative file name plus a named destination), and ruled tables whose header repeats on every page.
  - Output is PDF 1.7 with `PageMode /UseOutlines`, pinned producer strings and content-derived dates, so the bytes are deterministic (test "renders identically twice").
- `csr-listings.ts` generates the §16.2 listings row by row:
  - 16.2.1 discontinued, 16.2.2 deviations (as supplied; `[]` declares none), 16.2.3 efficacy-set exclusions (from population flags), 16.2.4 demographics, 16.2.7 AEs and 16.2.8 laboratory (from ADLB rows).
  - Rows run by group, then subject, with group and subject bookmarks.
  - A value the source lacks reads "not recorded". Columns that E3 asks for but the contract does not carry (verbatim term, onset and end day) are named in the footnote, never filled.
  - A row whose subject the source does not hold is refused.
  - 16.2.5 and 16.2.6 are never generated, because the source has no subject-level compliance or efficacy data. They are listed as missing, with that reason.
- `csr-listing-verify.ts`: each drawn row is written to a receipt (NDJSON) as it is drawn. The check streams the receipt and holds every row to its subject's source record, each record used once. It names the subject and column that disagree, and every source record left unlisted.
- `csr-pdf-structure.ts` is the structural check. It reads the PDFs with pdf-lib and requires:
  - the body outline to reach four levels;
  - every drawn heading to have a bookmark at its own depth;
  - every link to resolve: GoTo to a destination in the same file, GoToR to a file of this assembly and a destination (or page) that file defines.
- `csr-assembly-source.ts` `assembleCsrJob` assembles a saved job from `materializeCsrAssemblySource` and `readRetainedStudyForAssembly`.
  - It refuses a job with no retained run (`CSR_ASSEMBLY_RUN_REQUIRED`) and a source whose records do not name their subjects.
  - The import's own §3, §14 and §16 gap lines are dropped because the assembly composes those sections. **§15 (reference list) stays a gap.**

Fail closed:
- §16.1.x and §16.3 are only ever **supplied**. The supplier names a PDF by its exact SHA-256; anything else is refused (`CSR_ASSEMBLY_SUPPLIED_DIGEST`, `_NOT_PDF`, `_UNREADABLE`).
- An unsupplied appendix that E3 marks "always" or "authority-dependent" is blocking unless it is declared not applicable with a reason of at least 8 characters. A "when-applicable" one is listed but does not block.
- A supplied copy of a generated listing, or a not-applicable claim on a generated listing, is refused (`CSR_ASSEMBLY_APPENDIX_AMBIGUOUS`).

## Proof, red first

| What | Red | Green |
|---|---|---|
| Broken §14 hyperlink: a body linking to `csr-14-tables.pdf#T14.9.9`, to a file outside the assembly, and to an undefined internal destination | `red-structure-and-listing-checks-off.txt`: with the link check switched off, the test fails (`expected true to be false`) | `csr-assembly.test.ts`: three `BROKEN_LINK` findings; the good link to T14.1.1 resolves |
| Bookmarks shallower than four levels, and a heading drawn without its bookmark | Same file: with the bookmark check off, two tests fail | `BOOKMARK_DEPTH` and `BOOKMARK_MISSING`; an assembled body with no 4th-level heading is `incomplete` |
| A listing that disagrees with its source subject | Same file: with "any row of a known subject accepted", the test gets "not listed" instead of the Age disagreement | "Listing 16.2.4: a row for subject SYN-LMN201-B-S05 disagrees with the source in Age."; a dropped row → "1 source record(s) … are not listed"; a doubled AE → fails |
| Abbreviation expansion | `red-abbreviation-expansion.txt` ("The Clinical Study Report") | "Clinical Study Report", "Investigational Medicinal Product", "Adverse events" |

## End to end (SYNTHETIC)

`end-to-end-synthetic-lmn201.json` (script `run-end-to-end-synthetic.mts`). It uses the slice-6 LMN-201-shaped ADaM set (23 subjects 12:11, every row invented), derived through the engine. The section prose is invented with real cross-references, and the "supplied" PDFs are invented one-liners.
- The assembly is `complete`. The body outline depth is 4. 91 links were checked, all resolved, and no reference was unresolved.
- It produced 16 leaves under 5.3.5.1. Six listings verified row by row against the source.
- **Packaged by `packageEctdSubmission`, unchanged:** one STF (`stf-syn-lmn201-b.xml`) with 16 tagged leaves and 0 untagged; 15 cross-references resolved and 0 broken; index.xml, us-regional.xml and the STF are well-formed.
- **Agency validator:** no FDA validator runs in this sandbox. The packager's own DTD validation did not run ("Declared DTD … is missing from the package"), because the DTD bundle is not vendored here. That is a packager or environment condition, not a CSR one. It is filed as recorded.
- **PDF/A:** `submissionGrade.allPdfA: false`, with all 16 leaves "notConverted", because Ghostscript is absent here. The existing converter (`finalizePdfA`) is the only PDF/A path. It converts at packaging where `gs` is installed, and `ECTD_REQUIRE_PDFA=true` refuses an unconverted package. The assembler emits PDF 1.7 and does not claim PDF/A.

## Scale (SYNTHETIC, streaming)

`scale-3000-subjects.json`, from `CSR_ASSEMBLY_SCALE_SUBJECTS=3000 npx vitest run server/services/csr/__tests__/csr-assembly-scale.test.ts`. The set has 3,000 invented subjects, 36,000 AEs and 216,000 ADLB records.

| | |
|---|---|
| Listing pages | **9,228** (16.2.8: 7,449; 16.2.7: 1,602; 16.2.4: 167) |
| Total pages | 9,237 |
| Bytes written | 23.8 MB |
| Wall time (assembly + every check) | **79.9 s** |
| Heap before / peak | 182 / 344 MiB (growth 163 MiB) |
| RSS before / peak | 295 / 496 MiB |
| Every listing verified against source | yes |

`listing-phase-memory.ndjson` (script `measure-listing-phases.mts`) splits generation from checking for the 16.2.8 listing:

| Subjects | Rows | Pages | Generation peak heap growth | Retained after generation | Verification peak growth |
|---|---|---|---|---|---|
| 750 | 54,000 | 1,863 | 20 MiB | 4 MiB | 39 MiB |
| 3,000 | 216,000 | 7,449 | 35 MiB | 10 MiB | 81 MiB |

At four times the pages, generation's peak heap rose from 20 to 35 MiB. Generation never holds the document in memory. Two things do grow:
- pdfkit keeps roughly 1.4 KB per page (the page dictionary reference) until the end. At 100,000 pages that would be about 140 MB.
- The row-by-row verifier holds the source's expected rows, about 0.4 KB per row.

The source itself is the input and is in memory. The default suite runs 400 subjects (1,235 pages, 11 s).

Correction from the adversarial review: as built, the structural check read every linked leaf whole (`fs.readFile` plus a full pdf-lib parse) to learn its page count and named destinations, so the check did hold the largest listing in memory. That is about 37.8 MiB of heap for the 7,449-page 16.2.8 leaf, plus its 17 MiB file buffer, and it grows with pages. The 25 ms heap sampler in the scale test cannot see it, because the parse is synchronous. The review's change is described below.

## Verification

- `green.txt`: 16 files and 213 tests passed. They cover the slice suites (csr-assembly, csr-assembly-source, csr-assembly-scale at 400) and their neighbours:
  - workflow-source-import.pglite (+3), saved-clinical-tables (+2), medical-writing-qc (+1)
  - csr-section-evidence-tool, csr-builder-e3-outline, csr-jobs-narratives.pglite, authoringCrfSourceImport.pglite
  - stf-generator, structured-leaf-bookmarks, adam-source-derivation, vault-adam-bundle, the lmn201 integration, writing-precision-gate
- `pre-existing-red-packager-fake-pdf-fixtures.txt`: `stf-packaging.test.ts` and `cross-reference-packaging.test.ts` fail at HEAD. Their `%PDF-1.4` stub fixtures predate the original-PDF integrity check ("no readable catalog and page tree"), as `CSR_PATH_REVIEW_2026-10-29.md` §6 records ("the fake PDF fixtures predate the PDF integrity check"). No file of this slice is involved. This slice's own packager test uses real PDFs and passes.
- `npx eslint` on every new and changed file reports no new warning. The one warning in `medical-writing-qc.ts` (`assessReadability` complexity 21) is at HEAD and untouched. Every new file is under 350 lines.
- `npx tsc --noEmit -p .` (12 GiB heap) exits 0 with no diagnostics (`tsc.txt`). The first run found three type errors in this slice's own files, which were fixed.

## Remaining (not done in this slice)

1. **Reach.** No route or EctdCompile control starts `assembleCsrJob` yet. The assembled leaves are not yet written into a sequence's `submission_leaves`. The seam exists:
   - `rendered-leaf-files.ts` `storeRenderedLeafFile` + `leafSourceFor`, with a new `renderedFrom` kind (the column has no CHECK);
   - `upsertLeaf` with `studyId` and `stfFileTag`.
   - The catch: `storage.put` takes a Buffer, so a 9,000-page listing would be read into memory once at storage time, as the packager already does (`fs.readFile(leaf.sourcePath)` and `finalizePdfA`).
2. **Population flags, protocol deviations and ADLB are not in a retained run.** `assembleCsrJob` takes them from the caller. Without them, 16.2.2, 16.2.3 and 16.2.8 are listed as missing (blocking). Reading ADLB through the receipt's ADaM bundle manifest (`adam-bundle-load.ts`) is the next step.
3. **16.2.6 (individual efficacy response) and 16.2.5 cannot be generated.** Efficacy is imported as the SAP's summary results (design decision 2). They must be supplied.
4. **§15 Reference List** is never drafted by a job ('manual'), and the assembly does not compose it. An assembled job stays `incomplete` until it exists.
5. **§16.3 CRFs** and **§16.4** (US archival datasets) are supplied documents or datasets. 16.4 is not assembled here; datasets are packaged as `.xpt` with their TRC-1735 tags.
6. **PDF/A** depends on Ghostscript in the deployment image. The assembler does not embed fonts (it uses the standard 14), so a PDF/A-1b conversion relies on Ghostscript's font substitution. That is not verified here.
7. **The STF tags are the reviewed recall list.** `study-report-body` (named in the CSR path review) is not in that list. The body is tagged `study-report`, and the official STF specification has not been read (egress refused).
8. Verbatim term, onset and end study day in 16.2.7 need the contract to carry them (ADAE AETERM / ASTDY / AENDY). Slice 6's derivation does not carry them yet.

## Adversarial review (2026-10-29)

The review re-ran the slice's suites and their neighbours: 18 files and 224 tests passed, including the new `csr-assembly-review.test.ts` (5 tests). It found and fixed the following. Every fix was seen red first; `red-review.txt` is that suite run with the fixes reverted.

| Finding | Before | Fix |
|---|---|---|
| ADLB without an `ABLFL` column | 16.2.8 listed every record as "Baseline: No", a value the source does not record | `labBaseline` (`csr-listings.ts`) reads "not recorded" when the dataset has no `ABLFL`. A blank `ABLFL` in a dataset that has the column still reads No, the ADaM convention. |
| An XPT ADLB's `ADT` | A SAS day count (for example 23436) was printed under "Date" and sorted as text | `labDate` converts it through the existing `adamDate` (`narrative-subject-facts.ts`, slice 7) and sorts by the ISO date. Text that is not a full date is shown as recorded; any other value reads "not recorded". |
| A listing value the fonts cannot draw | `toWinAnsiSafe` printed it as '?', but the receipt recorded the source value, so the row check passed a listing that does not show the source | The receipt now records each cell as drawn. The verifier's `drawnAs` accepts a substitution that keeps the value (CO₂ to CO2) and refuses one that introduces a '?', naming the subject and column. |
| A run with no engine table | The body said "The tables of Section 14 are filed as a separate document, csr-14-tables.pdf" when no such leaf existed, and the assembly could be `complete` | The body says Section 14 is not supplied, and a body gap makes the assembly `incomplete`. |
| The structural check loaded linked leaves whole | See the correction under Scale | `readLeafTargets` (`csr-pdf-structure.ts`) reads only the page count and the Dests name tree through the leaf's classic xref table. That is the layout pdfkit writes, and the result matches the whole read (test). For the 7,449-page leaf, the read takes 4.7 MiB of heap instead of 37.8 MiB (`structure-read-memory.ndjson`, script `measure-structure-read.mts`). A leaf laid out otherwise is still read whole: an xref stream, an incremental update or a parse failure, as a sponsor-supplied PDF may be. That fallback is tested. A large supplied 16.3 CRF set is therefore still read whole. |

These were reviewed and left as they are:
- `crossReferences` lists every target leaf, not only the leaves the text cites. Every leaf is linked from §14 or §16 anyway.
- The receipt stream's `write` return value is not awaited. It flushes whenever the PDF writer yields at each page break.
- Listing formatting is shared between generation and verification (`STATUS_LABEL`, `orNotRecorded`, `labDate`). The check is therefore independent in which records it lists, and in their per-subject correspondence, but not in how a value is formatted.
