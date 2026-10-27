# Public CSR report expansion for LMN-201 — 27 October 2026

Workstream: D2, existing Authoring / AnA evidence retrieval. This follows the founder’s request for additional public full CSR examples for Lumen Bioscience’s RePreve / CDI02 (NCT05330182). It records acquired evidence and a proposed readiness matrix. It does not claim application admission, training, deployment or a regulator-approved CSR.

## What already exists

- `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` owns the canonical source store and source provenance. This acquisition inventory is review evidence, not a second source database.
- `server/services/clinical-regulatory-evidence/public-reference-sources.ts` already provides permitted source search and bounded, checksum-bound page reads. It requires external-reference identity and honest extraction/use status; this work does not widen admission.
- `server/services/ana/AnaToolExecutor.ts` already exposes the clinical/regulatory evidence capability. Retaining a file outside that store does not make its text available to the tool.
- `server/data/public-csr-reference/manifest.json` contains the earlier source release, including the 87-page Crofoot/SYMTUZA report. SHA-256 comparison caught its ReSTART alias as a duplicate.
- `scripts/cre/prepare-public-reference-seed.mjs` and `scripts/db/migration-set.mjs` provide the existing preparation/deploy-seed route. No alternate importer, new model or runtime migration is added here.
- `docs/evidence/D2/2026-10-27-cdi-csr-seed/` records the prior acquisition, agency-connector audit, reference reader and activation limitations. This package supplements that evidence.

Current-code searches rechecked the evidence source reader, AnA executor, original manifest and seed preparation path. The earlier workstream’s code and deleted-history search is retained in the linked evidence directory. This is a documentary acquisition extension, not a new capability design.

## Verified new acquisitions

| Classification | New originals | Pages | Qualification |
|---|---:|---:|---|
| NIH/BPCA main report bodies | 11 | 3,821 | Eight prospective and three retrospective/integrated reports; available main bodies, not certified complete unredacted appendix packages |
| SPARTAN redacted main CSR | 1 | 891 | Sponsor-origin report; rights hold despite FDA hosting |
| **New main-report total** | **12** | **4,712** | No new full CDI CSR |
| Quetiapine CSR compilation | 1 | 8,027 | Separate mixed-identity compilation; sponsor-rights/depositor-authority review required |
| SALVO tables/listings/results | 1 | 88 | Not a complete integrated narrative CSR |
| CDI CSR synopses | 2 | 48 | Fidaxomicin OPT80-003 and Pfizer CLOVER; excluded from full-CSR count |
| RSV CSR synopsis | 1 | 8 | Inherited pagination does not mean the 120-page parent CSR was acquired |
| PolyCAb registry basic results | 1 DOCX | Unverified | Not a CSR; native Word pagination not independently verified |
| Regulatory reviews/assessments | 5 | 301 | Official comparator evidence, not sponsor CSRs |
| ICH E3 and E9(R1) | 2 | 71 | Reporting/statistical guidance, not CSRs |

The main delivery bundle contains **25 new originals: 24 PDFs and one DOCX**, with **13,255 PDF pages** and **158,657,022 original bytes**. The page total includes the large quetiapine compilation and must not be presented as 13,255 pages of qualified CDI CSR training material.

The **87-page ReSTART report is an exact prior-file duplicate** under the Crofoot/SYMTUZA name. It was re-reviewed but is not new. Four previously retained FDA reviews are also included for offline verification of the readiness matrix and are not recounted. A 63-page RNHE2041 protocol appendix that appeared under CSR headers is cataloged as a false-full-report lead and excluded from the reference bundle.

## NIH source packages and rights

The 11 unchanged official NLM source archives preserve **77 PDF member records / 76 unique PDF hashes**: 11 main reports and **65 unique non-main companion PDFs (6,199 pages)**. The sole duplicate member is the ACY02 main report. Companions include protocols, SAPs, forms and supporting analyses; their titles do not make them additional full CSRs. Full source XML, images and original license notices remain preserved in the archives.

Eight NIH item records explicitly identify public-domain content. Three rely on the source package’s conditional public-domain default and need further document-level review. Native-text screening cannot clear image-only pages or separately credited third-party content. Preserve attribution, original notices and study-family relationships. See [NLM’s official download service](https://www.ncbi.nlm.nih.gov/sites/books/about/ftp/) and [Bookshelf copyright guidance](https://www.ncbi.nlm.nih.gov/books/NBK554842/).

Public access is not a universal commercial-training license. SPARTAN, the quetiapine compilation, ReSTART and the CDI sponsor synopses retain their separate restrictions. ISRCTN Additional-file licensing is recorded for SALVO, the RSV synopsis and PolyCAb, with document-specific review still outstanding.

## Review evidence

- [Acquisition summary](acquisition-summary.json): identifiers, exact original hashes, source URLs, classifications, rights and family grouping, plus bounded CDI search coverage.
- [Regulator-anticipation matrix](regulator-anticipation-matrix.md): 17 proposed checks, source document/member names, physical PDF pages, applicability limits and required client evidence.
- [Verification](verification.json): actual checks and remaining limits.
- [Delivery receipt](delivery-receipt.json): eight saved artifacts, exact sizes and SHA-256.

All 25 newly delivered originals were checked against the previous retained manifest. New main files, source archives and companion bytes were hash verified; main PDF page counts were parsed. The searchable directory’s relative links resolve inside its download package. Source inspection is not comprehensive scientific or semantic table qualification.

## Regulatory preparation and the client dependency

The matrix prioritizes global-cure/recurrence denominators, diagnosis and event ascertainment, time windows, analysis populations, missingness and intercurrent events, antibiotics/rescue treatment, Part A versus randomized Part B, Bayesian specifications and any borrowing, multiplicity, safety exposure, event narratives, immunogenicity, clinical lots, generalizability and public effect-measure reconciliation.

The sponsor release reports global cure counts of 10/12 versus 4/11 and OR 7.8; the crude cross-product ratio is 8.75. This is a reconciliation question for the SAP and verified output, not proof of an error. The matrix preserves the difference between historical agency observations and our proposed LMN-201 checks.

Needed from the client: approved protocol/amendments and dated SAPs; database-lock/unblinding chronology; analysis data and derivations; validated programs and TLFs; episode/assay/medication timelines; exposure and safety narratives; actual Bayesian model, priors, decision rules and simulation/sensitivity evidence; relevant agency correspondence and product-lot context.

## Admission and learning status

Every record remains `external_reference`, with `client_study_evidence=false` and `training_approved=false`. The 12 new main reports are retained originals pending qualification. This commit supplies research evidence; it does not change the 78-record canonical application release, claim those files are available in production AnA, run embeddings, or fine-tune a model.

The continuation should qualify selected passages and table structures, preserve exact page/source citations, extend the existing evidence store for permitted references, and evaluate drafting and issue detection on held-out study families. Keep POP01-related and acyclovir-family materials together until overlap review. Actual client numbers must come from controlled analysis outputs. A larger document collection alone cannot establish model competence or guarantee no regulatory questions.
