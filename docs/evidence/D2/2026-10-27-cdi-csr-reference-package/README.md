# Public CSR reference package for AnA review

**This publication retains publicly sourced reference originals and a classified source catalog for review. It does not import evidence into the application database, enable live AnA retrieval, deploy a migration, create embeddings, or train a model.**

The application implementation remains separately available in [review commit `e6efa61109eddbe0d9e508642a28e710a48f3b1f`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/e6efa61109eddbe0d9e508642a28e710a48f3b1f), tree `311538c0cc6e66cfb75383ea7dc50921d0c587bf`. Its 97 focused software tests and production build passed, but its whole-repository TypeScript check did not complete under the execution environment's 8 GiB memory limit. That incomplete verdict is not a pass. This documentary package does not publish that implementation.

## Open the package

- [Searchable source directory](source-directory.md): all 78 source records, classifications, original links and study families.
- [Complete documentary catalog](manifest.json): exact identities, versions, source URLs, permissions, acquisition status and package-relative asset paths.
- [LMN-201 / RePreve target profile](lmn-target-profile.json): dated public registry and sponsor context, with conflicts requiring the client's approved records.
- [Comparator applicability matrix](comparator-fit-matrix.json): useful reporting patterns and explicit scientific differences.
- [Package integrity receipt](package-verification.json): hashes, original-byte checks, page counts and file inventory.
- [Implementation verification receipt](implementation-review/verification.md) and [CSR capability qualification guide](implementation-review/ana-csr-reference-learning.md): evidence and next steps for the separately prepared application work.

## What is retained here

| Measure | Count |
| --- | ---: |
| Source records | 78 |
| Permitted original PDFs included | 22 |
| Pages in those PDFs and page derivatives | 718 |
| Original PDF bytes | 20,449,078 |
| Catalog-only source records | 56 |
| Included FDA review documents | 21 |
| Included primary trial publication | 1 |
| Included sponsor full CSRs | 0 |
| Live application imports or training runs established here | 0 |

The originals are FDA regulatory review documents and one CC BY trial publication. They are not 22 full sponsor clinical study reports. The catalog separately distinguishes main redacted reports, parts, amendments, annexes, synopses, protocols, statistical analysis plans and supporting material.

Sponsor-restricted originals remain outside this publication. Where an original was privately retained during the research, the catalog preserves its checksum, byte/page counts, exact source and version, and unresolved use restriction. Private retention does not make that PDF part of this package or admit its text for application retrieval.

The seven latest GSK files belong to the existing 100388/104106 longitudinal varicella family: two main redacted CSR files plus versions, parts and annexes. They are not seven independent studies. The two public Year 6 files remain distinct acquisition identities with uncertain equivalence and one logical-report identity. Their bytes are excluded here.

## What already exists

The application already has a canonical clinical-regulatory evidence store, tenant-controlled Vault/Authoring workflows and an AnA evidence-search tool. The prepared integration extends those paths; this package creates no additional application store or tool. The [implementation architecture note](implementation-review/README.md) identifies the existing services, source-retention contracts and migration authority.

Every addition in this publication is under `docs/evidence/`. No runtime source, script, migration, schema, application configuration, baseline or gate is changed. The unchanged full pre-push hook must still complete. Its documented type-irrelevant skip applies to a genuine documentary diff and does not validate the separate integration.

## Original and derivative identity

The catalog declares paths relative to this package directory: `originals/<sha256>.pdf` and `pages/<sha256>.jsonl`. Original PDFs are copied unchanged. Their SHA-256 filenames and catalog hashes identify the exact retained bytes. Page derivatives record PDF page number, text hash, extraction method and review state. For FDA ZIP downloads, `archiveMember` identifies the exact member represented by the retained PDF.

All 718 page derivatives remain unreviewed: 684 native-text pages and 34 OCR pages. Hash verification establishes identity, not clinical accuracy, table semantics or completeness of a sponsor submission. Verify clinically consequential content against the cited original page. Do not reconstruct redacted material.

## Use and applicability

Every source is external reference evidence with `clientStudyEvidence=false` and `trainingApproved=false`. Preserve source attribution and the stated permitted-use basis. Discovery, private acquisition, documentary publication, application admission and model training are separate events.

The target profile and applicability matrix preserve dated public observations for NCT05330182 / CDI02. Registry estimates and sponsor announcements require reconciliation with the client's approved protocol, SAP, analysis populations and final outputs. They are not verified client results. Other trials' denominators, analysis windows, Bayesian priors, decision thresholds and treatment effects must not be transferred to LMN-201.

The matrix's `acquired_documents` field describes the broader research acquisition record, including documents whose bytes are excluded here. Actual included originals are exactly the 22 `manifest.records` entries. The 56 `manifest.catalog` entries contain no included original or extracted report text.

## Application integration remains pending

No migration or reader implementation is included. Live evidence and application behavior are unchanged by this documentary publication. The review commit contains the proposed checks, scoped source reads and replayable seed, together with its incomplete whole-repository compiler receipt. Completing that verification and the separately governed deployment/admission steps is required before claiming live AnA availability.

Archived implementation notes describe that review commit. Their code paths and reported tests must be read in that context. Public examples can support expert-reviewed reporting once properly admitted; neither this package nor the focused software tests establishes medical-writing qualification or regulatory acceptance.
