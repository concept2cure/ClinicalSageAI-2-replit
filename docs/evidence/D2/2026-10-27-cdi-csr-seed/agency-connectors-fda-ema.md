# FDA / EMA acquisition capability audit and bounded repair

Date: 2026-10-27. Scope: existing FDA/EMA clients, their active callers, deleted acquisition scripts, and current official agency metadata surfaces. Health Canada is audited separately. No account was opened, no portal restriction bypassed, no clinical report admitted, and no database write made by this repair.

## What already exists

| Existing path | Actual capability and active callers | Limitation before this repair |
| --- | --- | --- |
| `server/services/integrations/drug-approvals-client.ts` | Public openFDA Drugs@FDA JSON; called by `search_drug_approvals` in `server/services/ana/AnaToolExecutor.ts`. Optional `OPENFDA_API_KEY`, configurable `OPENFDA_API_BASE_URL`, retry/timeout wrapper. | Normalized application, product and approval metadata; dropped all `submissions[].application_docs[]` URLs. No report-byte downloader. |
| `server/services/connectors/fda-drugs.ts` | FDA connector registered by `connector-registry.ts`, searched by the deep-research orchestrator and the governed connector-search integration. `fetch()` reads one application JSON. | Search retained raw submissions in metadata, but had no normalized document classifications. `fetch()` did not fetch a report. |
| `server/services/integrations/ema-epar-client.ts` | `search_ema_epar` AnA handler and `EMAEPARConnector` delegate to this client. | Default `https://medicines.health.europa.eu/api/human-medicines` redirected to veterinary HTML. Previous tests used invented camel-case result envelopes rather than the current official feed. |
| `server/services/connectors/ema-epar.ts` | Federated-search adapter, registered in `connector-registry.ts`. | `fetch()` returned a JSON note about needing a PDF download, without making a request or retrieving an EPAR record. |
| `server/services/integrations/eu-ctis-client.ts`, `server/services/connectors/eu-ctis.ts` | POSTs search metadata to `https://euclinicaltrials.eu/ctis-public-api/search`; called by `search_eu_ctis` and federated search. | No document enumeration/downloader. `fetch()` returns a note pointing to the public portal. A live request returned HTTP 200 with `showWarning:true` and an empty `data` array; that alone does not establish query correctness or absence of CDI trials. Not changed here. |
| `server/services/intelligence/precedent-mining.ts` | Constructs regulator search URLs and web-search queries. | Deliberately search guidance, not acquisition or a retained report corpus. |
| `server/services/learning/harvester.ts` | Horizon scan downloads landing-page/feed text, capped at 20,000 characters. | Not a CSR/PDF harvester. |
| `server/services/clinical-regulatory-evidence/crl-ingestion.service.ts` | Existing shared CRE spine writer accepts supplied CRL text/findings; route is platform-admin gated for global-public records. | Does not discover or download FDA letters. A CRL is not a CSR. |
| `server/services/corpus/live-ctgov-fetcher.ts`, `ingest-ctgov.ts`, `drizzle-corpus-writer.ts`, `scripts/ingest-corpus.ts` | Existing ClinicalTrials.gov JSON normalization/upsert. `server/jobs/corpusIngestionSweep.ts` is called from `server/index.ts`, gated by `ENABLE_CORPUS_INGESTION=true` and configured indications. | Registry rows in `csr_reports` are not retained sponsor CSRs; this path does not acquire uploaded documents. |
| `server/data-importer.ts`, `server/data-importer-v2.ts` | Legacy CT.gov transformations/import helpers, referenced by remaining standalone trial import scripts. | Fetcher points at absent Python files; `downloadPdfs` is not passed to the v2 script. The old transformer even reads maximum age as sample size. Do not reactivate for study-result evidence. No current server caller of `scheduleDataUpdates` found. |
| `server/services/unifiedDocumentIngestion.js`, `ingestion/pdf_extractor.py` | Existing supplied-file PDF extraction and governed ingestion infrastructure. | Requires actual input bytes; not an agency discovery source. |

The FDA ESG, EMA CESP and Health Canada submission gateway adapters are outbound submission transports, not evidence acquisition services. FDA device-universe tables and openFDA FAERS/device endpoints are also different evidence classes.

## Deleted history was inspected

The checkout initially had shallow history. A read-only history fetch made the full reachable repository history available (15,909 commits at inspection; `git rev-parse --is-shallow-repository` returned `false`). The following historical implementations were read using `git show <deletion>^:<path>`; none was restored.

| Deleted implementation | Deletion commit | What the code actually did |
| --- | --- | --- |
| `scripts/farmers/ema-epar-farmer.ts` | `a0f4d73a9`, 2026-04-01 | `harvest()` iterated hardcoded `sampleMedicines`; comment said production would fetch EMA Open Data. Created regulatory atoms from those samples, not original EPAR PDFs or CSRs. |
| `scripts/farmers/ema-ich-farmer.ts` | `a0f4d73a9`, 2026-04-01 | Seeded hardcoded `EMA_REGULATORY_INTELLIGENCE` and ICH records. No report download. |
| `scripts/farmers/fda-openfda-farmer.js` | `a0f4d73a9`, 2026-04-01 | Real openFDA FAERS, label, 510(k), PMA and NDC metadata farming; wrote organization 1 atoms/edges. Not a sponsor CSR downloader. |
| `scripts/lumen-cortex-harvester.js` | `b79f020e1`, 2026-04-05 | Real CT.gov metadata; generated random Health Canada trial records; indexed filenames from local `csrs/` as `processed:false`. Did not acquire or extract those local PDFs. |
| `scripts/cortex_fda_progress.json`, `scripts/cortex_harvest_progress.json` | `b79f020e1`, 2026-04-05 | Historical counters: 900 FAERS / 900 labels / 900 device clearances; another file recorded 450 CT.gov, 500 synthetic HC and 40 local filename entries. Counters do not establish original CSR retention or present database contents. |
| `server/scripts/fetch_clinical_trials.py` | `87d13d7cd`, 2026-03-25 | CT.gov metadata plus attempted legacy `/ct2/show/{NCT}/results.pdf` retrieval. No FDA/EMA acquisition; a registry results PDF is not a sponsor CSR by default. |
| `server/scripts/fetch_and_import.js` | `27ecdb8d2`, 2026-09-22 | Spawned missing `fetch_trials_v2_api.py`, then inserted obsolete schema columns, including a constructed `{NCT}.pdf` name with size zero. These were metadata rows, not proof of a downloaded report. |
| `server/services/harvestEngine.js` | `85616c46f`, 2026-08-02 | Harvested existing internal document/section data in Supabase. Not an agency crawler. |
| `server/services/fdaIntegrationService.ts` | `d7c044897`, 2026-10-15 | FDA device and submission functionality, including explicitly simulated paths; no sponsor CSR acquisition. |

Current EU metadata clients entered in `e1860e866` (2026-06-29), with failure-reporting corrections in `7ca45ee8b` / `c1a5c8153` (2026-10-15). The present repair extends these existing owners instead of reinstating the old farmers.

## Current agency surfaces and permitted scope

1. **openFDA Drugs@FDA** is application/product/submission JSON. Its `application_docs` entries provide document IDs, types, dates and links, including review-package index pages. Those links can support subsequent acquisition but do not themselves contain a CSR. [Official result documentation](https://open.fda.gov/apis/drug/drugsfda/understanding-the-api-results/) and [field reference](https://open.fda.gov/fields/drugsfda_reference.pdf).
2. **FDA review packages** contain reviewer assessments and related documents. Preserve agency document types. The separate [Clinical Data Summary Pilot FAQ](https://www.fda.gov/drugs/development-approval-process-drugs/fdas-clinical-data-summary-pilot-program-questions-frequently-asked-industry) describes sponsor CSR bodies, protocols/amendments and SAPs, with complete patient listings/narratives outside scope. This does not turn every Drugs@FDA review into a sponsor CSR.
3. **EMA website JSON** is explicitly offered for automated metadata/document discovery. The medicine and centrally authorised medicine document feeds provide exact product numbers and source URLs and are updated twice daily. The public site feed is separate from the Clinical Data Publication portal. [Official JSON documentation](https://www.ema.europa.eu/en/about-us/about-website/download-website-data-json-data-format).
4. **EMA Clinical Data Publication / Policy 0070** contains clinical data submitted in support of marketing authorisation, with EMA-account access and terms for viewing/downloads. No existing account/entitlement/terms acceptance was verified. Do not bypass the account or imply commercial training/reuse rights from public discoverability. [Official access guidance](https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/clinical-data-publication).
5. **CTIS / EUCTR (EudraCT)** are separate registry/public-document surfaces. Public results attachments may be sponsor synopses, protocols, SAPs, or reports; each must be acquired and inspected before classification. Existing EU CTIS client does not implement attachment acquisition. No current EUCTR or Policy 0070 downloader was found in executable code.

## HTTP receipts

Read-only probes were made at approximately 20:50–20:52 UTC on 2026-10-27. Raw public metadata snapshots and receipts are retained with the task research evidence; only small real-record subsets are included as repository fixtures.

| Probe | Observed response |
| --- | --- |
| Existing EMA `/api/human-medicines?searchTerm=Zinplava&pageSize=1&page=1` | HTTP 200 after redirect to `https://medicines.health.europa.eu/veterinary/select-language?destination=/node/210934`; `text/html`; 9,347 bytes; SHA-256 `65b54e9fa3821d3d47a763c1d74271097e30da2caec4872cd5ac780aefc91be6`. |
| [Official medicine feed](https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json) | HTTP 200 JSON, 6,795,904 bytes, 2,754 records including human and veterinary; SHA-256 `5d6cd024196ba7ff25f211019ad4b934814b6733fac7fe4f09932b309295a0ab`. |
| [Official document feed](https://www.ema.europa.eu/en/documents/report/documents-output-epar_documents_json-report_en.json) | HTTP 200 JSON, 29,280,313 bytes, 20,329 document records; SHA-256 `d08fbfd9329ffaed65ab64d4d57c67d20a611fd5dbe1728ddfc8caff84008941`. This is a metadata count, not a retained-report count. |
| openFDA `drug/drugsfda.json?search=products.brand_name:%22ZINPLAVA%22&limit=1` | HTTP 200, 4,102 bytes, BLA761046, six `application_docs` entries; SHA-256 `e29d38571f3449fe3e7da74bbe5e6c8a0581fcd6e5e1dc005adc68a5207dc8e6`. |
| Existing CTIS search for Clostridioides | HTTP 200 JSON, 127 bytes, `showWarning:true`, `data:[]`; SHA-256 `5b3de231e27fca7b3ff50506efacac8fb77c16023a417a8eddf331d3c67fa350`. Query semantics were not qualified by this probe. |

The EMA fixture preserves Zinplava's reported `Withdrawn` status and nine listed documents; no past authorisation status is silently substituted for the current source record.

## Changes and remaining work

- Reused the EMA client and connector. They now read the official feeds, select human medicines, search source fields locally, join document metadata by the exact EMA product number, and retain canonical source URLs/status/types. A six-hour in-process cache and shared pending request avoid downloading roughly 36 MB for every query. Streamed response limits are 8 MiB for medicines and 40 MiB for documents; HTTP errors, HTML and malformed envelopes/rows fail closed. `EMA_EPAR_API_BASE_URL` now denotes an origin hosting these same feed paths, not the retired `/human-medicines` API.
- EMA connector `fetch()` now retrieves the actual matching metadata record and returns `epar_metadata`, with listed document URLs. It no longer returns the placeholder JSON note.
- Reused the FDA approval normalizer and connector. `applicationDocuments` now carries agency type, exact URL, ID, date, submission type/number and a conservative classification. Labels, letters, HTML review-package indexes and regulatory reviews remain distinct. Both search surfaces reject unexpected result envelopes. No classification claims full-CSR possession.
- All exposed documents carry `acquisitionStatus: listed_only`. No original PDFs, embeddings, model training, document-rights approval, or cross-tenant evidence admission is performed by these connector changes.
- Next reuse step is to pass appropriately classified, verified discovery links into the existing retained-original/CRE evidence path, with checksum, document identity, extraction quality and permitted-use gates. Policy 0070 acquisition still requires an authorised account and applicable terms. CTIS attachment discovery needs its own verified public-interface contract; its metadata API must not be reported as an existing bulk-CSR downloader.

## Verification

Before production edits, the new real-response tests failed on three actual gaps: official EMA shape unsupported, FDA document links absent, and unexpected FDA JSON reported as zero matches. Focused HTTP/connector tests cover the repaired behavior, existing search/error contracts, real source classifications, human-only filtering, byte limit, metadata caching, malformed-record refusal, and no PDF requests. Test logs and final outcomes accompany this audit. These are connector qualification results, not proof of deployment or production database ingestion.

Executed results: focused Vitest **61/61 passed in six files**; targeted TypeScript check exited 0; ESLint exited 0 with only the pre-existing test-suite length warning; both new production complexity warnings were removed. The initial two production warnings blocked the warning ratchet, so URL validation/document classification and alias lookup were separated into small helpers without changing normalization behavior. No baseline or suppression was changed. Original RED was 3/3 failed. Receipts: `agency-connectors-endpoint-receipts.json`; logs: `agency-connector-red.log`, `agency-connector-green.log`, `agency-connector-typecheck.log`, `agency-connector-eslint.log`. Full application typecheck/build and deployment are the integrating agent's responsibility.

A direct live execution of the repaired Node clients was blocked by this executor's DNS (`EAI_AGAIN api.fda.gov`). The official endpoints were verified through the permitted proxy using Python/urllib, and real-record fixtures exercise the repaired clients. This is not a claim that the application's production egress has been verified. The `.log` files are ignored by repository defaults; use explicit force-add if retaining them in Git.
