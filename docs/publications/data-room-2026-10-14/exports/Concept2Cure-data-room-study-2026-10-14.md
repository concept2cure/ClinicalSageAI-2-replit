# Concept2Cure Data Room and AnA improvement study

14 October 2026

Scope: biotech, pharma, medical devices and diagnostics in the USA, Europe, Japan, Canada and Australia. Europe includes EU/EEA and a separate UK regulatory track.

Code baseline: concept2cure-v2 at 87b27c897c5d1be20b0527009bcaf425ebbf3af6, in concept2cure/ClinicalSageAI-2-replit.

Implementation follow-up: six specialist agents and the lead produced detailed contracts and local D2 storage integrity, processing recovery, scientific-preview and source-access improvements, alongside D7 validator classification. The durable-receipt continuation adds a default-off metadata ledger for exact source text admitted by the host, with actor-aware history and tenant export/purge integration. Baseline findings below remain pinned to the assessed commit; the relevant subsections distinguish fixes from proposals. [Integrated delivery plan](../plans/DATA_ROOM_ENHANCEMENT_DELIVERY_PLAN_2026-10-14.md).

## Recommendation

Develop the existing Data Room, catalog, Authoring and AnA 1.0 RI into a governed evidence-to-filing system. The strongest opportunity is to make every material claim explainable in its scientific context, traceable to the exact approved source or calculation, and connected to the filings affected by a change.

The current branch has substantial foundations: immutable capture identity, source versions, governed catalog suggestions, human confirmation, keyless passage retrieval, clinical claim comparison, lineage and a reproducible sample-size bridge. Extend those capabilities. A replacement catalog, another chatbot or a separate knowledge graph would duplicate work.

Prioritize three outcomes:

1. Evidence remains findable and interpretable after upload failures, long-document extraction and source changes.
2. AnA uses the right evidence passage and binds each fact to its study, product, device or assay context.
3. A reviewed change shows exactly which claims, calculations, documents and market packages require attention, while filed versions remain reproducible.

Generic AI drafting, source citations, regulatory monitoring, knowledge graphs and cross-market content reuse are already offered by competitors. The moat must come from validated scientific relationships, reproducible computations, reliable jurisdiction adapters, and accumulated reviewer and filing-quality evidence. Competitive superiority remains a hypothesis until customer benchmarks demonstrate it.

## Current features and capabilities

The October 8 Data Room study describes a historical baseline. Many of its gaps have since been addressed. These findings reflect the pinned branch; deployment flags, installed tenant rule packs and accepted agency submissions require separate operational evidence.

| Area | Current implementation | Boundary |
| --- | --- | --- |
| Capture integrity | Original-byte checksum, capture actor, write-once identity, predecessor/successor relationships and chained capture audit | Storage durability and deployment configuration were not qualified here |
| Data management | Shared processing for upload, adopted attachments and edited spreadsheets; explicit failures; version and supersession tracking | Recovery and automatic source-family inference need hardening |
| Data catalog | Project facts, registry/protocol identifiers, dates and study links with rule/offset provenance | Narrow English rules and ambiguity refusal; not universal scientific interpretation |
| Dataset awareness | CSV, TSV, XLSX and define.xml structure profiles; columns, inferred types, rows and domain hints | Profiling is not value-level CDISC conformance or standardized dataset delivery |
| Search | Source full-text search, filters, paging, real totals; keyless Vault passage search and optional hybrid ranking | Source index and language bounds apply; selected-source drafting still uses prefixes |
| AI organization | Suggested/confirmed/corrected catalog states; model/thread/turn attribution; revision-aware decisions and audit | Existing disabled toggles stay disabled; confirmed facts are protected from silent model replacement |
| Review experience | Vault panel shows provenance and full key data; confirms or corrects kind, purpose and summary with role checks | Key data itself has no per-fact correction workflow in this panel |
| Scientific checks | Drafted-number presence checks, same-frame clinical claim comparison and current-document consistency checks | Current vocabulary is principally drug clinical; agreement is not evidence qualification |
| Lineage and change impact | Verified quotations, asserted paraphrases, machine/human provenance, source usage and recursive derived-dependency impact | General computation-output-to-document-span linkage remains incomplete |
| Reproducible calculations | Persisted inputs/outputs, integrity hashes, engine/version/seed and reachable replay for the sample-size bridge | Replay dispatch is not universal; database-enforced write-once protection is not yet established for these runs |
| Filing preparation | Persistent leaves, lifecycle logic, approved PDF materialization, structured FDA Module 1 and retained eCTD 4/device engines | Global catalog labels exceed qualified regional packaging and transport |

Code anchors: [capture immutability](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/migrations/20261001_cre_evidence_sources_capture_immutability.sql#L69), [shared processing](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/data-room-processing.ts#L99), [catalog facts](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/catalog-facts.ts#L105), [dataset profiling](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/dataset-profile.ts#L10), [governed suggestions](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/vault/document-catalog-governance.service.ts#L170), [catalog review](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/client/src/concept2cure/v2/surfaces/VaultCatalogRecord.tsx#L136), [clinical comparison](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/authoring/section-claims-check.ts#L13), [stored runs](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/stats/computation-runs.ts#L55).

## Findings that should drive the next work

### Processing must recover from incomplete derived writes

Chat upload records a successfully extracted source before a separate write persists extracted text and catalog facts. A persistence failure is logged and caught. The repair helper selects only pending rows, so an extracted row missing text can fall outside repair. No production caller of that helper was located in the inspected tree.

Use an idempotent processing job keyed by source version, checksum and processor version. Capture identity and its audit remain atomic. Reconcile pending, failed and inconsistent stage states; mark searchable only when the necessary derived records are committed. Re-uploading identical bytes should be able to request safe repair instead of leaving the first incomplete processing result untouched.

Source-supported failure path, not a reproduced production incident: [upload capture](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/routes/chat/upload.ts#L505), [processing failure handling](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/routes/chat/upload.ts#L553), [pending sweep](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/data-room-processing.ts#L246).

The local recovery continuation now keeps new captures pending until derived text commits, verifies both the capture digest and its recorded original upload, and fences claim/completion/failure writes with a durable attempt token and database-time lease. Same-byte retries preserve capture identity and original provenance. A bounded tenant-scoped operator command defaults to report-only; blocked and not-due diagnostics do not consume runnable slots. Existing Project Home, editor, Vault and AnA results distinguish persisted readable text from capture or a failed attempt.

Genuine independent PostgreSQL connections also exposed and verified a narrow withdrawal-confirmation correction: impact and live-program authority are reread after reservations, so an obsolete preview cannot record a pre-recovery impact receipt. Local concurrency and a synthetic non-owner RLS case are evidence for these exact paths, not deployed isolation qualification. [Recovery contract, failing cases, final checks and limitations](../evidence/D2-PROCESSING-RECOVERY/2026-10-14/README.md). No scheduler or client-backlog repair was activated.

### Artifact reads lacked recorded-byte verification in the assessed baseline

The follow-up review of PR #148 found an integrity gap carried into the current local storage provider. LocalStorageProvider.get reads the file bytes but returns the sidecar's SHA-256 without recomputing it. The IVDR pack download sends those bytes with that checksum header, without comparing the actual digest against the expected artifact record. A changed or incorrectly restored file can therefore carry the original version's checksum.

A fresh synthetic baseline probe returned changed local bytes with the original recorded hash; a foreign-organization read was refused. Follow-up fail-first tests reproduced the same self-consistency gap in the actual local and S3 providers, using synthetic local files and mocked S3 transport. No deployed customer incident is asserted.

The local patch now verifies provider digest/size and independently binds downloaded artifact bytes to the tenant-scoped pack's recorded digest/size. It refuses changed or missing identities, a missing original manifest, and mismatched legacy snapshots before content or a success audit event. Valid response headers describe the actual response bytes. All 106 focused storage/download tests pass. Signed URLs, live cloud durability and guaranteed audit persistence remain outside this patch. [D2 contract and red/green evidence](../evidence/D2-STORAGE-READ-INTEGRITY/2026-10-14/README.md).

[Current local provider](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/storage/local-provider.ts#L144), [IVDR pack download](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/routes/ivdr-binder-routes.ts#L1001), [historical PR](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/148).

### Independent validation needs a qualified class and package binding

A deterministic follow-up probe used the real validator resolver, FDA subset implementation and required-production gate. With no licensed validator configured, the opt-in internal subset returned a clean report and cleared that component's required gate; the noop control blocked. The assessor's configuration predicate distinguishes only `noop` from other names, and the gate does not require qualified independent authority or coverage.

This confirmed a component classification defect, not a full dispatch, signature, export or transport bypass. The continued local D7 patch now distinguishes adapter kind, matched coherent external execution and actual assessment outcome. Subset/missing/mismatched/invalid evidence refuses required clearance; advisory failures remain visibly failed through the assessor, existing views, AnA/QC, pre-transmit and MCP discovery. The final combined suite passes 230 tests; 34 independent runtime/compound checks pass. The current real-resolver probe retains the subset's own pass while refusing required external clearance.

Qualified engine/profile/version, declared coverage, authentic reports and exact-package binding still require a separate increment. The configurable LORENZ adapter and retained report import should be strengthened rather than duplicated. [Baseline/current probe and scope](data-room-research-2026-10-14/validator-classification-verification.md), [D7 implementation evidence](../evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/README.md), [filing adapter milestones](data-room-research-2026-10-14/filing-adapter-plan.md).

### Passage search should actually serve drafting

Relevant-passage search exists, but selected-source drafting reads the first 12,000 characters of each source, with 48,000 characters total. The save contract also requires a prefix beginning at zero. A long CSR can therefore have the decisive endpoint table outside the supplied evidence.

Extend both loader and saved-reference contract to nonzero, multiple, version-bound ranges. Retrieve the table together with its title, headers, denominators and footnotes. Re-verify those exact ranges against the same source hash during save. Keep partial coverage explicit; whole-document comprehension and task-specific passage selection serve different purposes.

[draft source budget](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ana/draft-project-sources.ts#L49), [saved receipt contract](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/authoring/draft-source-references.ts#L19), [existing lexical fallback](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/advancedRAGPipeline.ts#L1173).

### A real number needs the right meaning

A local execution of the current pure catalog verifier used this synthetic source:

```text
Assay A sensitivity: 95.0%.
Assay B sensitivity: 99.2%.
Both studies used adult plasma samples.
```

| Catalog entry | Current verifier result |
| --- | --- |
| Assay A sensitivity = 95.0% | Accepted |
| Assay A sensitivity = 98.4% | Refused |
| Assay A sensitivity = 99.2% | Accepted |

The last value exists in the source, but belongs to Assay B. The whole-text coverage gate also allows that suggestion. This is not a bypass of human confirmation: it demonstrates that value presence cannot validate an unchecked label.

Add typed, source-anchored fact items and a reviewer correction workflow. Verify the subject, measure, unit, denominator, specimen, population and method together. Reuse the clinical frame comparator where appropriate; extend its device/IVD vocabulary rather than replace it. Show transcription, contextual agreement and scientific applicability as separate states.

[verifier meaning and limits](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/vault/document-catalog-core.ts#L135), [executed verifier](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/vault/document-catalog-core.ts#L363), [unchecked key labels](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ana/document-catalog-tool-defs.ts#L109), [existing clinical frame](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/truth-engine/clinical-claims/types.ts#L190).

The scientific-preview increment preserves this legacy verifier's meaning and adds a separate source-verification preview inside the same AnA catalog tool. Five typed families bind written values to exact source/extraction hashes, quotes and supported contextual witnesses. Clinical claims reuse the existing frame engine; the first CMC/device/IVD form is one explicit labelled source row. A passed source/context check remains scientifically unassessed, unreviewed and unsaved. The preview is off by default; per-fact acceptance and scientific applicability have not been implemented.

The continuation also snapshots proposals before embedding, pins the initially admitted programme, freshly checks actor/project/source at catalog acceptance, refuses stale text or zero-row writes, and keeps audit atomic with the update. The existing panel/recall retain historical human decisions with explicit value-only/context-not-recorded scope. Independent PostgreSQL tests exercise source/admission races and rollback; synthetic scientific cases catch swapped context, clipped bounds, omitted qualifiers and remote-header inheritance. [Scientific catalog contract, final proof and limits](../evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/README.md). This is a source-integrity foundation for the proposed moat, not expert qualification or proof of competitive superiority. The scientific checkpoint’s combined verification passed 1,752 tests across 87 files, with 52 separate independently authored checks and 15 genuine PostgreSQL cases on matching final sources. The 70 scientific engineering requests are included in the combined suite; they are not expert scientific-method qualification.

### Make AnA source use match the current client’s access

The source-access continuation applies the existing canonical project-sharing policy to AnA’s document reads, discovery, selected Vault drafting sources, text/meaning/passage adapters and source-file recall. Open-project scope is pinned; organization-level discovery evaluates only accessible uniquely anchored programmes. Filters precede SQL counts, rank and LIMIT. Creator-owned unbound chat files retain access only with matching persisted capture/upload ownership and all recorded private parents enforced. Current actor/extraction checks also protect new source payloads at both host handoffs and before actual legacy receipt insertion.

This closes concrete private-source and stale-read paths in these existing tools, a prerequisite for client-specific evidence reuse. It preserves viewer/custom-role reads, keyless text search, historical disclosure and retained eligible text. At that checkpoint, history remained original-byte-bound host-admission evidence, without durable extraction/actor/provider-delivery checkpoints. Prior transcript replay and memory/profile policy are separate; this is not all-platform source-reader or deployed-RLS qualification. [Source-access contract, final verification and limits](../evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/README.md). Its combined verification passed 2,927 tests across 119 files on unchanged source hashes, with 50 separate independently authored held-out checks and 12 genuine PostgreSQL cases. These are scoped synthetic/engineering checks, with precise limits recorded in the evidence. Competitive advantage still requires the proposed expert-labelled workflow benchmark; these engineering checks do not prove superiority.

### Preserve exactly which source text the host admitted

The next continuation gives each genuine server-deferred read a stable admission identity. A new immutable tenant ledger records the current actor/role, source version, extraction digest, exact range digests and unchanged host payload digest. Identical retries acknowledge the same record; altered metadata refuses. The shared contract represents up to eight disjoint ranges; the existing offset reader produces one exact window. It introduces no new retrieval, authoring or filing workflow.

The checkpoint is `host_budget_admitted`. A gateway request ID can span retries or fallback, and provider adaptation can change the payload, so neither establishes exact provider delivery. No provider SDK, gateway or host invocation code changes in this metadata increment. Existing legacy coverage and scientific-review gates keep their meaning. Actor history includes only the current actor's records in currently accessible projects; historical hashes do not grant new source-use authority or reconstruct deleted text.

The new records are tenant-owned data: the existing complete export discovers them, and controlled offboarding erases them after final-export, retention, status, legal-hold and atomic audit checks. Source-table reservations precede actor/status reservations to avoid reversing the read writer's lock order. Unconfirmed final status updates roll back erasure. The flag `ANA_DURABLE_SOURCE_READ_RECEIPTS=1` remains off by default. Final proof passes 3,303 tests across 134 files, 32 independent held-out checks and 16 genuine PostgreSQL cases on unchanged final source hashes, with ten observed blocking checkpoints. [Durable receipt contract, proof and limits](../evidence/D2-ANA-DURABLE-RECEIPTS/2026-10-14/README.md) distinguishes ordinary-runtime engineering tests from deployed/provider/agency qualification. Reliable provenance is a foundation for the proposed evidence-to-filing moat; expert workflow benchmarks and qualified market adapters remain necessary.

### Preserve original-page and table evidence

The OCR extractor can return page spans and confidence, but the shared capture envelope retains text, method, page count and word count rather than those locators. Source search uses English full-text ranking over a bounded prefix. This limits original-page verification and Japanese/multilingual use.

Retain page/region/table/cell anchors, extraction version, actual coverage and confidence alongside original bytes. Process large documents in bounded background jobs with visible partial status. Test language-specific retrieval and OCR against permitted client samples. Evaluate commodity layout/table tools against the existing extractor; avoid an unmeasured replacement.

[extraction envelope](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ocr/extractDocumentText.ts#L32), [retained capture fields](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/data-room-processing.ts#L38), [search bound](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/data-room-search.ts#L63).

### Make source families and downstream checks deliberate

The upload path can infer supersession from a unique same-title/project/type match. A generic test_report.pdf may describe a different test despite sharing a title. Prefer source-system identity and explicit check-in, with a reviewable successor proposal when identity is uncertain.

Current staleness and withdrawal services already traverse recorded dependencies. Extend them to trigger contextual rechecks after source updates and author edits, with a receipt bound to input/output hashes and a reviewed resolution. Never silently replace approved or filed content.

[family inference](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/evidence-spine.service.ts#L438), [changed usages](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/clinical-regulatory-evidence/source-usage.service.ts#L484), [derived impact](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/document-data-disposition/derived-impact.ts#L47), [draft checks](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/authoring/authoring-from-draft.ts#L337).

### Reconcile filing status contracts

The repository contains real eSTAR and MDR/IVDR packaging engines, but their reachable launch workflows and qualification differ. Current eSTAR assembly determines official artifact producibility from section completeness and template availability without including template currency; the filing readiness service does include currency. Its separate stale-version-table flag also does not participate in canFileNow.

Use one canonical status contract for assembly, AnA, readiness and export. Distinguish preparation, package production, independent technical validation and authorized transmission. Confirm the intended handling of stale currency evidence with focused regression cases before changing it.

These are static findings requiring implementation verification: [assembly decision](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/pathway-engines/device-assembly/assemble-device-submission.ts#L209), [filing decision](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/pathway-engines/estar/estar-filing-readiness.ts#L331), [AnA presentation contract](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ana/AnaToolExecutor.ts#L16801).

## Competitive position

Public product claims establish offered capabilities. Dated releases and named case studies provide stronger deployment evidence, but neither guarantees accuracy for a particular scientific task.

| Competitor | Current relevant capability | Consequence for Concept2Cure |
| --- | --- | --- |
| Weave Bio | Data Room, metadata/extraction, sentence and table-cell tracing, Data Tags, verification, AutoReview, global templates and HAQ workflows | Source citations and automated review are baseline competition; benchmark scientific context and reproducibility |
| Veeva | Shared RIM data, authoring, publishing, lifecycle archive and integrations; Falcon early-adopter availability announced for November 2026 | Respect incumbent workflow depth; treat Falcon announcement separately from deployed evidence |
| ArisGlobal | Regulatory monitoring, impact assessment, health-authority interactions and guideline-to-rule checklist/dossier agents | A regulatory rules compiler alone is not novel |
| Rimsys | Structured product-centric records, knowledge graph, standards/UDI/global workflows and source-linked AI; named Philips use | Product facts, graph relationships and market reuse alone are not a moat |
| Greenlight Guru and MasterControl | Design, risk, quality and test relationships plus specific AI review/summary features | Device traceability and QMS-connected AI already have competitors |
| Benchling | Scientific data context, cited drafting/research, connectors and AI; configurable agents in Preview | Scientific search and MCP are interchangeable foundations |
| Ennov, LORENZ, Certara and Artos | Regulatory content reuse/publishing, structured authoring or source/downstream tracing | Integrate proven client systems and demonstrate the depth of the complete evidence chain |

Primary sources: [Weave Submission Builder](https://www.weave.bio/platform/submission-builder/), [Weave global expansion](https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth), [Veeva RIM](https://www.veeva.com/products/veeva-rim/), [Veeva Falcon announcement](https://www.veeva.com/resources/veeva-announces-falcon-an-agentic-platform-and-standard-agents-to-deliver-agentic-labor-in-drug-development/), [ArisGlobal Intelligence Agents](https://www.arisglobal.com/intelligence-agents/), [Rimsys AI](https://www.rimsys.io/products/rimsys-ai), [Rimsys Philips case](https://www.rimsys.io/blogs/how-philips-scaled-active-product-registrations-more-than-20x), [Greenlight product development](https://www.greenlight.guru/product-development-software), [MasterControl Regulatory Chat](https://www.mastercontrol.com/news/mastercontrol-launches-ai-powered-regulatory-chat-to-simplify-compliance-navigation-for-life-sciences-manufacturers/), [Benchling AI](https://www.benchling.com/blog/benchling-ai-now-generally-available), [LORENZ docuBridge](https://www.lorenz.cc/Solutions/docuBridge/).

The August AnA specification correctly anticipates bound product facts, but its assertions that competitors do not use product records or source-impact relationships are too broad. Likewise, March competitive notes asserting full device/global implementation do not establish today's qualified launch capability. Use current product/version evidence and tested demonstrations.

## AI and architecture improvements

### One scientific evidence contract

Keep the current canonical source IDs, Vault versions, authoring citations, span lineage, computation runs and governed actions. Add the minimum typed relationships needed to express scientific meaning. Search indexes, embeddings and graph projections remain rebuildable views.

A proposed fact/claim contract should include:

```text
identity: organization, project, source family, source version, content hash
anchor: exact quote; character range; page/table/cell where available
meaning: property/measure, subject, value as written, unit, denominator
context: study, data cut, population, arm, timepoint, method
product context: device configuration, software version, assay/analyte,
                 specimen/matrix, reference standard, cutoff
derivation: computation run, output field, input/output hashes, method version
decision: proposed, transcription checked, context checked,
          expert accepted/rejected; actor, reason, timestamp
applicability: intended use, product family, market, pathway, requirement version
```

Not every field is mandatory for every fact. A discriminated schema defines what each product/claim type needs. Missing material context yields unknown or needs review. A schema-valid model response is a candidate, not scientific proof.

For medicines/biologics, extend study/SAP/endpoint, CMC and nonclinical context. For devices, link configuration, design input/output, risk control, verification/validation and labeling. For IVDs, keep scientific validity, analytical performance and clinical performance separate; preserve analyte, matrix, instrument/reagent/software versions, reference method, cutoff and study population. Combination products retain linked but distinct product obligations.

[W3C PROV-O](https://www.w3.org/TR/prov-o/) and [OpenLineage](https://openlineage.io/docs/spec/object-model/) offer interoperable provenance concepts. The existing PostgreSQL core can support initial relationships without adding a graph database.

### Better model work inside existing controls

Use layout and multimodal models to propose table structures, source alignment and applicability explanations. Use schema-constrained responses, exact anchors and independent deterministic checks. Ambiguous merged headers, scanned digits and footnotes go to an expert against the original.

AnA proposes reviewed patches and gap resolutions. Deterministic engines produce numbers and hard-rule verdicts. Reviewers decide scientific sufficiency, strategy and released content. Existing model pins, PQ gates, tenant/source admission and signer boundaries remain the authority.

Benchmark [Docling's document representation](https://docling-project.github.io/docling/concepts/docling_document/) or equivalent layout components against current extraction. Use [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) to constrain candidates; their format does not establish factual correctness.

### Reproducible analytical evidence

Generalize the current method registry gradually: first one existing device/IVD calculation and one additional pharma analysis. Persist exact inputs, dataset slice identity, transform code/environment, parameters, seed, outputs, units, methods and review decisions. Bind the number actually inserted into a document to the run and output field.

A retained approved artifact can be reconstructed. Re-running a hosted model cannot promise identical prose. Preserve accepted outputs and their provenance rather than equating workflow replay with deterministic model regeneration.

[current replay boundary](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/stats/computation-runs.ts#L110), [span contract](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/shared/schema/document-span-lineage.ts#L43), [existing IVD analytics](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/stats/analytical-performance.ts#L1).

### Versioned rule packs and frozen filing manifests

A rule pack should name authority/source version, product family, pathway, jurisdiction, applicability, effective and transition dates, interpretation, reviewer, severity and test fixtures. Separate legislation, guidance, client commitments and internal policy.

Each released filing manifest pins source/fact versions, computations, requirement packs, rendered artifacts, review/signature records and technical validation receipts. Distinguish effective date from the date the platform learned a change. That makes historical submissions reconstructible and present-day differences explainable.

Use existing engines and package services as compiler targets. Buy or integrate qualified external publishing/validation where useful; adding a format label is not a regional adapter.

### New differentiation hypotheses

1. **Evidence reuse with an accepted rationale.** Show which existing evidence can support another market, configuration or indication, which assumptions permit reuse and which bridging work remains. Portability never means automatic agency acceptance.
2. **A read-only change scenario.** Before changing an assay cutoff, supplier, software version, endpoint or intended use, preview the affected facts, calculations, risks, labeling and filings. Explain each dependency and propose review tasks.
3. **An evidence-gap plan.** Rank expert-approved tasks by materiality, dependencies and how many unresolved obligations they address. Avoid invented approval probabilities.
4. **Historical filing reconstruction.** Open the exact submitted evidence/claim/rule snapshot, then explain what changed and why it matters.
5. **A client-specific review learning loop.** Turn accepted corrections and real authority questions into governed regression cases and reusable resolutions. Cross-client pooling requires explicit rights and de-identification.

These ideas extend existing services. They are candidates for differentiation, not claims that no competitor has deployed them.

## Filing needs in the requested markets

Build one accepted evidence core with versioned, product-specific adapters. Include development applications, marketing applications, amendments/variations, renewals, labeling, responses and post-market obligations. Do not treat eCTD as a universal format.

| Market | Medicines and biologics | Devices and diagnostics | Priority implication |
| --- | --- | --- | --- |
| USA | IND/NDA/BLA/ANDA and lifecycle eCTD; applicable SEND/SDTM/ADaM and Define-XML; SPL and safety messages are separate | eSTAR 510(k)/De Novo requirements; route-specific PMA/IDE/Q-Sub support; device incident/UDI obligations | Qualify the existing US path, scientific datasets and official device template handoff |
| EU/EEA | Regional Module 1, MAA procedures; CTIS Part I/II and responses; SPOR/IDMP and pharmacovigilance flows | MDR technical documentation and clinical evaluation; IVDR scientific validity/analytical/clinical performance; GSPR, PMS/PMCF/PMPF, UDI/EUDAMED | Separate CTIS, drug publishing, device evidence and product registry adapters |
| UK | MHRA medicine licensing and lifecycle/IRP; distinct national process | MHRA registration and applicable conformity/PMS obligations | Treat UK rules and channels separately from EU regional content |
| Japan | PMDA regional and Japanese-language content, eCTD 4 new-application transition, electronic study data | Product/classification-specific PMDA/MHLW evidence and local process | A real Japanese adapter and bilingual evidence validation; no silent FDA-format reuse |
| Canada | Health Canada regional electronic filing and lifecycle requirements | IMDRF-based device/IVD submissions; route-specific licensing; verify eSTAR pilot eligibility | Build local envelope/IDs/checklists and qualify actual channel handoff |
| Australia | TGA regional Module 1 and lifecycle/e-ID requirements | ARTG, sponsor/conformity and Essential Principles; IVD clinical/performance evidence | Replace placeholder regional backbone and validate TGA-specific artifacts |

Current dates and scope matter:

- FDA accepts eCTD 4 for new applications from September 16, 2024; existing-v3 forward compatibility and two-way communication remain separate phases. [FDA eCTD 4](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd-v40).
- EU optional eCTD 4 for new centralised MAAs began December 22, 2025; the July 2026 roadmap plans strongly recommended use in Q1 2027 and mandatory use in Q1 2028 for those new applications. [EMA project notices](https://esubmission.ema.europa.eu/eCTD%20NMV/eCTD.html).
- FDA's eSTAR page gives distinct mandatory and voluntary route scopes; official template branches and attachments must be tested. QMSR became effective February 2, 2026. [eSTAR](https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program), [QMSR](https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr).
- EU IVD evidence has three tracks, not a generic CER folder. Four EUDAMED modules became mandatory May 28, 2026 with role/transition distinctions; that is not all modules. [MDCG IVD evidence](https://health.ec.europa.eu/latest-updates/mdcg-2022-2-guidance-general-principles-clinical-evidence-vitro-diagnostic-medical-devices-ivds-2022-01-27_en), [EUDAMED](https://health.ec.europa.eu/medical-devices-eudamed/overview_en).
- PMDA's eCTD v3 transition for new applications ran through March 31, 2026; an old v3-only path cannot simply be labeled Japan-ready. [PMDA transition](https://www.pmda.go.jp/int-activities/int-harmony/ich/0120.html), [PMDA v4 materials](https://www.pmda.go.jp/int-activities/int-harmony/ich/0119.html).
- Health Canada's eSTAR notice contains bounded pilot eligibility; a page update does not prove general deployment. [Electronic filing](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/filing-submissions-electronically.html), [eSTAR pilot](https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices/application-information/guidance-documents/estar-pilot-notice-industry.html).
- TGA's current Module 1 materials distinguish the accepted regional requirements from its eCTD 4 pilot/draft work. [TGA implementation](https://www.tga.gov.au/tga-implementation-ich-ectd-v40-specification), [TGA IVD clinical evidence](https://www.tga.gov.au/resources/guidance/meeting-clinical-evidence-requirements-vitro-diagnostic-ivd-medical-devices).

The current code does not yet justify a claim of complete delivery across these markets. Only FDA has the structured Module 1 builder classification, and even that requires an empty gap report for each build before regionConformant becomes true. Several other region backbones are flat or placeholders. PMDA/Canada transports deliberately refuse unsourced protocols. Existing eCTD 4 serialization does not establish qualified Japanese v4 delivery.

FDA transport has implementation gaps as well as qualification gaps: the AS2 path lacks CMS envelope signing/encryption, cryptographic MDN verification and asynchronous acknowledgement polling. The NextGen REST path explicitly refuses an unverified wire contract. Device preparation has a recorded eSTAR template mismatch: vendored nIVD/IVD 7.0 versus locally recorded current 7.1. Readiness must reflect that mismatch. Retained MDR/IVDR Annex II/III ZIP export is real through a governed backend route, while the canonical market offer remains author-only and the reachable customer workflow is incomplete. That ZIP is not EUDAMED delivery or Notified Body acceptance.

[FDA build-specific qualification](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ectd/regional-backbone-readiness.ts#L117), [FDA transport gaps](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/submission-gateways/fda-esg.ts#L18), [governed technical-file export](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/routes/submissions.ts#L1592).

[regional builder classification](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ectd/regional-backbone-readiness.ts#L54), [canonical market offer](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/regulatory/market-support.ts#L130), [PMDA channel boundary](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/submission-gateways/pmda-gateway.ts#L23), [Canada channel boundary](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/submission-gateways/health-canada-gateway.ts#L30).

Biologics, cell/gene therapies and marketing applications also require deeper CMC evidence. The current composer explicitly supports small-molecule US IND composition and refuses other scopes. Broaden its validated evidence and rule coverage, not merely its gate. [CMC boundary](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/cmc/composition-scope.ts#L7).

## Sequenced implementation work orders

Sequence is based on dependencies and client value, not a delivery-time estimate. These work orders are proposed extensions, not completed feature releases.

| Priority | Work order | Acceptance evidence |
| --- | --- | --- |
| P0 | Durable source processing, storage-read integrity and source-family safety | Inject persistence/OCR failure; recover correct text/index once; refuse corrupted artifacts and wrong version/hash bindings; no duplicate capture or false supersession |
| P1 | Version-bound passage receipts through drafting and save | A decisive table beyond character 12,000 is used with its headers/footnote; changed hash, revoked access and stale save are refused |
| P1 | Typed catalog facts and per-fact review | Two-assay/two-study fixture rejects or flags swapped context; reviewer corrects an anchored fact with reason/audit; no silent approved-fact replacement |
| P2 | Device/IVD frames and computational span lineage | One qualified diagnostic/performance workflow links exact inputs to calculated output to approved document span; reproduced result and contextual mismatch cases |
| P2 | Dependency-triggered rechecks and filing snapshot manifests | One data-cut/configuration change identifies only affected content; filed snapshot reconstructs; original/derived withdrawal and stale review behave correctly |
| P3 | Qualify requested-market adapters and reconcile capability claims | Per product/pathway/region: regulator-sourced rules, version tests, real packaging, independent validation and authorized handoff proof |
| P3 | Evidence reuse, scenario planning and review learning | Expert-approved reuse/bridge rationale; measured impact completeness and review effort; licensed held-out correction/authority-question cases |

Implementation seams:

- P0 uses shared capture/processing and current job infrastructure. A transactional outbox or equivalent recorded work state is preferable to a second upload pipeline.
- P1 passage work must change both draft-project-sources and draft-source-references, plus save verification and locator presentation.
- P1 facts extend the current catalog vocabulary, governance writer and Vault panel. Preserve old records as legacy suggestions; do not silently reinterpret historical approvals.
- P2 lineage adds a typed computation-run/output reference to the canonical span contract and qualified methods to the existing replay registry.
- P2 rechecks compose current source usage, derived impact, clinical comparator, governed actions and tasks. A source change creates review work, not automatic reapproval.
- P3 adapters compose market-support, regional backbones, validators, official templates and existing package services. Preparation and transmission remain separately qualified.

The existing launch decision explicitly defers native XPT/SAS/Dataset-JSON readers, dataset-bundle ZIP intake and m5/datasets delivery. This study places them on the expansion roadmap because they matter to broader clients; it does not classify them as shipped or remove the launch boundary. [recorded dataset scope](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md#L109), [current leaf validation](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/ectd/leaf-source-resolver.ts#L697).

## Modern coding and evaluation techniques

Use contracts and meaningful evidence to guide AI-assisted implementation:

1. Define typed source anchors, scientific fact frames, computation references, status transitions and filing manifests before parallel changes. Reuse existing schemas and canonical paths.
2. Give coding agents bounded file/subsystem ownership on concept2cure-v2, as AGENTS.md requires. An independent reviewer checks domain behavior and held-out failure cases; generated tests alone do not establish validity.
3. Add property/state-sequence tests for retry idempotency, supersession, stale review, permission revocation, withdrawal and snapshot immutability. Include the orderings that cause failures.
4. Use differential tests between source versions, independent computations or qualified external validators. Test table context, rounding, units and denominator changes.
5. Evaluate code, prompts, retrieval, model pins and rule packs against the affected cohort before release. Preserve existing PQ and fail-closed release controls.
6. Keep new infrastructure behind flags and benchmark it. New production dependencies need the repository's written justification. New tenant tables must follow its public/integer-organization/RLS migration rules.
7. Extend the existing model gateway's verified provider/endpoint/region/retention contract. Reauthorization applies before retrieval, model context, tool access and export; outage fallback must preserve client restrictions.

No-training and no-retention are distinct; hosted model features have different retention eligibility. Do not promise compliance from a provider name. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). [Agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [stateful testing](https://hypothesis.readthedocs.io/en/latest/stateful.html), and [durable AI workflows](https://docs.temporal.io/ai/cookbook) provide useful techniques; choose components only when existing infrastructure cannot meet measured needs.

The FDA/EMA January 2026 good AI practice principles support human responsibility, context of use, data quality and lifecycle evidence. FDA drug-AI credibility guidance remains a draft; device PCCP guidance concerns AI-enabled device functions. Authoring assistance and AI-generated evidence need different qualification. [Good AI practice](https://www.fda.gov/about-fda/artificial-intelligence-drug-development/guiding-principles-good-ai-practice-drug-development), [FDA draft credibility guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological), [PCCP](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/marketing-submission-recommendations-predetermined-change-control-plan-artificial-intelligence).

## How to prove the moat

Start with three expert-reviewed workflows: a medicine CSR-to-summary update, a device design/test-to-claim update, and an IVD performance-to-label/PER update. Use synthetic or client-authorized evidence, with held-out cases covering each requested market's material requirements.

Measure:

- Correct source page/cell and context binding, including false support from another assay/study.
- Retrieval of decisive evidence late in long or multilingual files.
- Critical contradiction/gap recall and false positives for legitimately different frames.
- Reproduction of calculations and exact reconstruction of approved artifacts.
- Completeness of affected-content identification after a source or product change.
- Reviewer effort, accepted corrections, repeated defects and processing cost.
- Tenant/access leakage, stale approval acceptance, duplicate work and missing recovery.

Set numerical improvement targets after measuring the current workflow and comparator products on the same cases. Require resolvable provenance for material released claims, no unauthorized context, and explicit disposition of critical unresolved findings. Do not substitute an aggregate AI accuracy score or a prediction of agency approval.

The compounding assets are expert-approved semantic mappings, scientifically difficult regression cases, accepted review resolutions, validated regional packs, reliable integrations and longitudinal filing-quality records. Keep customer evidence owned and controlled by the customer. Improvements across customers use public, licensed or explicitly permitted material.

## Verification and deliverables

This study inspected the current branch, linked code paths and relevant test/evidence artifacts. It ran a fresh, dependency-free execution of the catalog verifier against the three synthetic assay cases above. That probe passed its expected assertions and demonstrated the context-label limitation. A follow-up synthetic current-provider probe confirmed the local IVDR storage digest mismatch while preserving the organization boundary. The PR review also reproduced the historical workspace's declaration-order ReferenceError; that component has since been replaced.

The recovery continuation executed a disposable PostgreSQL 16 concurrency fixture and a synthetic runtime-role RLS case. The full application/database suites, OCR language models, deployed roles and feature flags, regional rule stores and live agency transmission were not qualified in this workspace. Checked-in October evidence is historical proof at its recorded commits, not a fresh production certification.

Deliverables are this assessment, the integrated delivery plan, five detailed specifications, supporting research and reproducible catalog/validator probes, plus local integrity, classification/status, processing-recovery and scientific-catalog-preview patches with tests. Historical fail-first probes remain preserved; the five original recovery contracts are now green in canonical fixtures. The review bundle includes source changes, evidence and exact reproduction commands. Scoped TypeScript checks pass for changed targets; this is not a whole-repository semantic pass. Scoped lint adds no warning after the final corrections; existing size/complexity warnings remain. Application/deployment, deployed database/provider qualification and agency acceptance remain separate. Changes are local on concept2cure-v2; client records and agency submissions were not changed, and nothing was pushed or deployed.

