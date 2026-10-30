# Health Canada acquisition connector audit — 2026-10-27

> Archived implementation-review evidence for [commit e6efa61109ed](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/e6efa61109eddbe0d9e508642a28e710a48f3b1f). This document describes the separately prepared application implementation, which has an incomplete whole-repository TypeScript verdict. Its application paths refer to that review commit, not to deployed functionality or this documentary publication. This package does not deploy or import the implementation.

## Finding

The repository did contain Canada acquisition and scheduling code. The relevant scripts were removed on 1 April 2026, and the surviving guides still describe them as available. At the audited `concept2cure-v2` checkout, there is no reachable Health Canada PRCI report-download route or running Canada report collector established by this audit.

The historical implementation also mixed three different things: trial registry metadata, synthetic trial profiles, and a separate manifest-driven PDF downloader. The actual PDF job was disabled in the historical scheduler. This distinction prevents historical “CSR import” counts from being treated as retained clinical study reports.

**Audit outcome:** repository source and history reviewed; official metadata API access verified; PRCI access attempted and unavailable in this session; **0 new Canada report originals acquired**. No collectors, database imports, terms acceptance, training, or deployment were run. No production code was changed. Synthetic importers were not restored.

## What already exists

| Component | Exact path | Operational state and capability |
| --- | --- | --- |
| Real PDF acquisition | `scripts/import/download_and_harvest_canada_csrs.js` | Deleted. Read a supplied manifest, downloaded PDF bytes, retained originals and SHA-256, then wrote a 1,200-character preview into processed JSON and intelligence atoms. It did not discover PRCI reports or implement a Health Canada search API. |
| Batch metadata import | `scripts/import/import_batch_of_50.js` | Deleted. Used optional `HC_CSR_FEED_URL`; absent, failed or empty feed triggered synthetic record generation. Wrote `csr_reports`, `csr_details` and JSONL atoms. These records were not PDF CSR originals. |
| Monthly bulk wrapper | `scripts/import/import_500_more_canada_trials.js` | Deleted. Repeated the preceding batch importer, default ten batches. No independent report acquisition. |
| Knowledge scheduler | `scripts/automation/knowledge_scheduler.js` | Deleted. Weekly and monthly batch jobs were enabled; the distinct real-PDF job was explicitly disabled. Historical configuration does not establish an active deployed schedule. |
| Older Canada “CSR” downloader | `scripts/automation/download_canada_csr.js` | Deleted. Made unauthenticated JSON listing/detail requests against `https://clinical-trials.canada.ca/api/v1/trials`; transformed trial records and inserted metadata. No PDF download. That URL is not the endpoint in the official API documentation inspected here. |
| File-based metadata importer | `scripts/import/import_canada_trials.js` | Deleted. Read `canada_trials.json` and inserted trial metadata. No source discovery or document acquisition. |
| Canada manifest | `data/sources/canada_csr_manifest.json` | Present, but no current consumer found. Two records: esketamine and Medicago vaccine. Both `downloadUrl` values are the same PRCI search landing page, not report files. Historical strict-PDF mode rejects them. |
| Continuous-learning guide | `docs/guides/CSR_CONTINUOUS_LEARNING_OPERATING_SYSTEM.md` | Present. Its “Current State (as of March 23, 2026)” describes the former loop, including synthetic fallback; it is not current operational evidence. |
| Enhancement guide | `docs/guides/KNOWLEDGE_ENHANCEMENT_README.md` | Present. References removed commands and scheduler. Its manifest section says direct PDF links must be supplied manually. |
| Auto-vault helper | `server/cer2v/auto-vault.ts` | Present, no callers found. Saves caller-supplied JSON, labels it `CSR`, `HEALTH_CANADA_API`/`OFFLINE_FALLBACK`, and `APPROVED`. It performs no network acquisition or scientific approval. Do not use those labels as evidence of retained originals. |
| Current Canada horizon source | `server/services/learning/regulatory-horizon-sources.ts` | Present. `health-canada` is a monthly HTML scan of a broad guidance landing page, not PRCI. |
| Current horizon fetcher and job | `server/services/learning/harvester.ts`; `server/jobs/regulatoryHorizonScan.ts` | Present. Fetches HTML/feed text, capped at 20,000 characters, and distils knowledge cards. Schedule requires `ENABLE_REGULATORY_HORIZON_SCAN=true`. It does not retain CSR PDFs. |
| Current horizon API | `server/routes/learning-horizon.ts`; mount in `server/bootstrap/register-regulatory-routes.ts` | Authenticated, read-only `/api/learning/horizon` views. No Canada import action. Source comments explicitly state that promoted cards are not yet consumed by AnA answers. |
| Current corpus job | `server/jobs/corpusIngestionSweep.ts`; `server/services/corpus/ingest-ctgov.ts` | Separate CT.gov metadata ingestion. It is not a Canada PRCI collector. |
| Current public-reference integration | `scripts/cre/prepare-public-reference-seed.mjs`; `server/services/clinical-regulatory-evidence/public-reference-sources.ts` | Present in this workstream. Uses canonical `cre_evidence_sources`, explicit permitted-use disposition, original/page hashes and bounded page reads. This is the destination to extend; no separate Canada evidence store is needed. |

The current boot calls the corpus and horizon schedules from `server/index.ts`. Neither activates the deleted Canada scripts. The current external-intelligence sweep is another separate scan; no Canada PRCI source was found in its source registry.

## Deletion and recovery history

The local checkout was shallow (294 reachable commits at the start of this audit). Local `git log --all --diff-filter=D` did not reach the relevant deletions, so the audit used GitHub per-path commit histories and immutable file reads.

- [`869efe59357be6f5cd105b1f33a636e99412056e`, 24 March 2026](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/869efe59357be6f5cd105b1f33a636e99412056e): **Audit and harden Canada CSR ingestion and batch import reliability**. This is a recoverable source version for the real downloader, batch importer and scheduler.
- [`a0f4d73a9f01b72deae4b46949efb88fff61ed44`, 1 April 2026](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/a0f4d73a9f01b72deae4b46949efb88fff61ed44): **refactor: remove dead scripts, configs, shared stubs, agents (~62,000 lines)**. The commit removed `scripts/import/` (26 files) and `scripts/automation/` (112 files), including the Canada downloader and scheduler.
- [`1c5d12c36e366ab81061a5170d00ae3a816d4b79`, 24 January 2026](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/1c5d12c36e366ab81061a5170d00ae3a816d4b79): earlier root-level script paths changed during consolidation. Their later versions existed under `scripts/import/` and `scripts/automation/`; their disappearance at root alone should not be mistaken for the final deletion.

Immutable source reads:

- [Real PDF downloader](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/869efe59357be6f5cd105b1f33a636e99412056e/scripts/import/download_and_harvest_canada_csrs.js)
- [Batch importer](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/869efe59357be6f5cd105b1f33a636e99412056e/scripts/import/import_batch_of_50.js)
- [Bulk wrapper](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/869efe59357be6f5cd105b1f33a636e99412056e/scripts/import/import_500_more_canada_trials.js)
- [Scheduler](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/869efe59357be6f5cd105b1f33a636e99412056e/scripts/automation/knowledge_scheduler.js)
- [Older trial-metadata downloader](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/869efe59357be6f5cd105b1f33a636e99412056e/scripts/automation/download_canada_csr.js)

### Historical schedules

| Task | Cron | Enabled in recovered source | Target |
| --- | --- | --- | --- |
| `canadaImport` | `0 3 * * 1` | Yes | Batch metadata/synthetic importer |
| `bulkCanadaImport` | `0 1 1 * *` | Yes | Repeated batch metadata/synthetic importer |
| `canadaRealCsrDownload` | `30 2 * * 2` | **No** | Manifest-driven PDF downloader |

### Historical downloader limits

The recovered PDF downloader uses `CANADA_CSR_MANIFEST` and `CANADA_CSR_MAX_DOWNLOAD_BYTES` (default 25 MiB). It performs two download attempts. It has no per-request timeout, no source-host/redirect restriction, and checks the size only after reading the complete response into memory. Its strict mode checks URL shape and content type, rather than a PDF byte signature. It does not handle document archives, validate study identity, determine full-CSR versus synopsis scope, or attach per-page provenance.

Its useful parts are manifest processing, original retention, SHA-256 and a structured acquisition report. Those should be recovered and strengthened if this collector is reactivated. Its preview-atom writing is not sufficient for the current source-integrity contract.

## Official source access verified in this session

All checks were read-only public GETs on 27 October 2026.

| Source | Observed result | Meaning |
| --- | --- | --- |
| [PRCI search](https://clinical-information.canada.ca/search/ci-rc) | Direct request: HTTP 503. Web retrieval also timed out. | No package listing or report download verified. This is a session observation, not a claim of a permanent outage. |
| [Archived collector URL](https://clinical-trials.canada.ca/api/v1/trials?page=1&size=1) | HTTP 503, text/plain. | The old code's endpoint was not operationally verified. |
| [Official CTA API documentation](https://health-products.canada.ca/api/documentation/cta-documentation-en.html) | HTTP 200, HTML. | Documents the distinct `https://health-products.canada.ca/api/clinical-trial/` metadata API. |
| [Official status endpoint](https://health-products.canada.ca/api/clinical-trial/status/?lang=en&type=json) | Anonymous HTTP 200, JSON with ONGOING/CLOSED/PENDING vocabulary. | Confirms public metadata API access without a key for this request. It supplies no CSR files. |
| [Official protocol endpoint, id=1](https://health-products.canada.ca/api/clinical-trial/protocol/?lang=en&type=json&id=1) | Anonymous HTTP 200, but an empty/default protocol record. | Reachability only; this response does not establish retrieval of a real trial record. |
| [Current trial-search portal](https://clinical-trials-search.canada.ca/en/home) | Anonymous HTTP 200, HTML. | Current registry discovery portal; separate from PRCI. |

The [official current portal description](https://www.canada.ca/en/health-canada/services/drugs-health-products/clinical-trials/search-portal.html) says it supplies selected trial metadata and links to international registries and summary results. Its API/export link goes to the [Open Government trial dataset](https://open.canada.ca/data/en/dataset/d6fe4b32-2eaf-4ac0-9e35-b3841f25e3a7). Registry exports must not be counted as full CSRs.

No Health Canada API key is used in the recovered public fetchers, and the documented metadata request worked anonymously. No authenticated PRCI API/session mechanism or documented PRCI bulk API was verified. Credentials would not turn metadata into report content.

## PRCI report scope and use terms

The [official PRCI guidance](https://www.canada.ca/en/health-canada/services/drug-health-product-review-approval/profile-public-release-clinical-information-guidance/document.html), sections 2.2 and 3.2, covers clinical overviews, summaries, CSR material in Module 5.3, and selected appendices (protocol/amendments, sample CRFs and SAPs). It does not mean every release contains every appendix or patient-level record.

**Appendix H, sections 2 and 3.1–3.4**, governs acceptance and use. It requires non-commercial access; expressly excludes supporting a marketing-authorization application anywhere and selling/trading the information; and conditions onward sharing on the recipient's undertaking. It does not grant unrestricted commercial intellectual-property rights. This bears directly on client CSR authoring and application support. A PRCI record must not automatically receive `retrieval: allowed` or training approval for this purpose.

The [guidance profile](https://www.canada.ca/en/health-canada/services/drug-health-product-review-approval/profile-public-release-clinical-information-guidance.html) displayed a website-outage notice, with page details dated 22 October 2026. It does not prove the cause of this session's HTTP 503.

No terms were accepted on the user's behalf. No report-content access restriction was bypassed. No PRCI document was copied into the public repository.

## Extension into the current CRE pipeline

1. Recover and extend the historical PDF downloader at its existing path if approved; do not create a second Canada evidence system.
2. Keep registry metadata discovery separate from PRCI package/report acquisition. Do not restore synthetic fallback into genuine evidence ingestion.
3. Supply verified document/package links and record the release identity, source version, actual document class and study family. Portal landing pages remain catalog entries.
4. Use bounded streaming acquisition, timeouts, appropriate rate limits/backoff, source and redirect validation, byte-signature checks, and archive-member limits where applicable. Retain immutable originals and SHA-256 before extraction.
5. Map acquired records to the existing manifest consumed by `scripts/cre/prepare-public-reference-seed.mjs` and the canonical `cre_evidence_sources` store. Keep rights-restricted/review-required content in the catalog until a sufficient permitted-use basis is recorded.
6. Preserve `evidenceRole: external_reference`, `clientStudyEvidence: false` and `trainingApproved: false`. Page extraction and original integrity must be independently recorded before the reader can expose text. Do not auto-create client findings from external examples.
7. Enable a resumable schedule only after a legitimate actual report succeeds through acquisition, classification and intended-use admission. Report discovery, retained originals, complete/redacted reports, synopses, companions and usable text separately.

No downloadable report manifest entries were added because no legitimate new full-report URL was discovered and acquired in this audit.

