# Concept2Cure Data Room enhancement delivery plan

14 October 2026. Products: biotechnology, pharma, biologics, medical devices and diagnostics. Markets: USA, EU/EEA, Japan, Canada and Australia, with a separate UK track. Platform: Concept2Cure and AnA 1.0 RI.

Assessment baseline: `concept2cure-v2`, `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. The integrity and validation-classification patches below are local work on that branch. Research, proposed contracts, completed tests and operational qualification are distinguished throughout this plan. No deployment or agency transmission occurred.

## Product direction

Make the Data Room the scientific evidence foundation of the existing platform: preserve original records, interpret results in their scientific context, retain accountable decisions, and carry those relationships into Authoring and filing preparation. AnA proposes and explains; deterministic services calculate and check; named reviewers decide scientific applicability and release.

The advantage to pursue is reliable evidence reuse and change assessment across a product's lifecycle. A percentage appearing in a PDF is not enough: a claim must identify the study or assay, population or specimen, measurement, method, unit, denominator and relevant configuration. A citation must resolve to the precise version and passage or calculation. A change should identify affected claims and obligations while preserving the historical filing.

Competitors already offer AI drafting, citations, global dossier reuse, structured regulatory data and impact assessment. The five hypotheses below require direct comparison, rather than claims that competitors lack them. Defensibility would accumulate through expert-approved scientific relationships, qualified methods, difficult regression cases, reliable integrations and demonstrated client outcomes.

## Seven coordinated contributors

Six specialist agents and the lead worked in separate scopes on the canonical branch. They covered current data management and storage; scientific catalog/AnA behavior; retrieval and durable workflow design; filing implementation; regulatory requirements; and competition/customer benchmarks. The lead integrated their findings, implemented filing-pack byte binding, and coordinated an independent review of the integrity changes.

The [main study](../reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md) contains baseline features, code evidence, competitor sources and priorities. Detailed handoffs are preserved as repository documents:

- [Scientific fact contract and 20 expert fixture groups](../reports/data-room-research-2026-10-14/scientific-catalog-spec.md).
- [Relevant-passage receipts, authorization and restartable AnA work](../reports/data-room-research-2026-10-14/ana-retrieval-spec.md).
- [Current filing matrix and F0–F9 delivery milestones](../reports/data-room-research-2026-10-14/filing-adapter-plan.md).
- [Regulatory route packs, lifecycle matrices and qualification](../reports/data-room-research-2026-10-14/regulatory-rule-packs.md).
- [Five moat hypotheses and customer benchmark protocol](../reports/data-room-research-2026-10-14/moat-benchmark-plan.md).

## Completed local implementation: artifact integrity

Both local and S3 storage now recompute loaded-byte SHA-256 and check recorded length before returning an owned object. Missing or malformed digest/length, changed bytes and changed length produce a typed integrity error. Existing tenant/path isolation and missing-object behavior are preserved.

The IVDR download route independently binds PDF, DOCX, ZIP and manifest bytes to the selected tenant's pack-row digest and length. This catches joint file-and-sidecar changes that pass storage self-consistency. It validates the requested format and emits the checksum of the actual response bytes. A missing original manifest is refused rather than replaced with another snapshot rendering. For legacy packs without an original manifest, the tenant-scoped snapshot must match both recorded canonical hashes before its JSON view is rendered.

This work moves the integrity portion of launch row D2; it does not close the whole launch row. It adds no schema, dependency, model call or new product surface. Signed-URL downloads are outside this byte-returning read path. Audit emission retains its existing best-effort behavior, so this patch does not establish guaranteed durable download auditing or proof of client receipt.

Evidence: [D2 contract, failing cases and passing results](../evidence/D2-STORAGE-READ-INTEGRITY/2026-10-14/README.md). The combined storage/download suite passes **106 tests across six files**. Focused TypeScript checks pass. Changed storage files/new tests have clean ESLint; the route retains its four pre-existing warnings with no new warning. An independent agent found no blocking integrity or async-control-flow issue. S3 transport and route database access were mocked; real cloud/PostgreSQL deployment qualification remains separate.

## Completed continuation: validation classification

The continued D7 slice now prevents a clean internal FDA subset from clearing a required-production external-validator gate. Explicit server-selected adapter kind, selected/report engine identity and report execution/count/pass coherence replace the old non-noop predicate. Unknown error counts remain unknown, with a validity marker accompanying the retained numeric field.

Advisory policy remains nonblocking, while failed, invalid and unassessed results retain their actual status through the assessor, readiness and market screens, AnA context, deterministic QC warnings and pre-transmit checks. MCP reports adapter discovery separately from execution or qualification. These changes migrate existing consumers; they do not add another validator or alter signing/Shadow Review controls.

The final combined Node 22 run passes **230 tests across 15 files**. Selected-source TypeScript checks pass, and scoped lint adds no warning after the final MCP helper correction. Independent runtime/compound/pre-transmit checks pass 34/34. [D7 contract, source scopes, red/green evidence and limits](../evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/README.md). This is a classification/status fix, not authenticated provider coverage, exact-package report binding, licence qualification or agency acceptance.

The parallel [processing-recovery preparation](../evidence/D2-PROCESSING-RECOVERY-STUDY/2026-10-14/README.md) executes actual processing SQL and selected real migrations in embedded PGlite: five intentionally failing contract assertions and three passing controls. It reproduces lost recovery after partial persistence, missing canonical source-byte binding, stale superseded commits/candidates and completion reporting of failed extraction. Successful derived persistence updates Data Room full-text search atomically; there is no separate asynchronous Data Room index stage to invent. Processing code remains unchanged; the portable opt-in probe is excluded from normal tests.

## Prioritized delivery backlog

These are ordered, bounded increments, not a commitment to ship every proposed capability simultaneously. Each has an owner, contract and observable acceptance evidence. One implementation exists per capability.

| Order | Client outcome and canonical seam | Acceptance evidence and boundary |
| --- | --- | --- |
| 0: completed locally | Loaded storage objects and generated IVDR artifacts match their recorded identity. `storage-provider.ts`, local/S3 providers and `ivdr-binder-routes.ts`. | 106 focused passing tests with fail-first corruption cases; scoped typecheck/lint; independent review. No deployed durability or agency acceptance claim. |
| 1: classification completed locally; qualification remains | External-validator classification and actual advisory outcomes now agree in the existing gate, assessor, screens, QC, pre-transmit and MCP. Official-format currency, qualified package receipts and delivery remain separate work. | 230 passing focused tests and 34 independent checks. Clean subset cannot clear required external validation. Matching qualified reports still need package/report hashes, engine/profile/version, authority and coverage before qualification is claimed. |
| 2: processing recovery | Uploads remain visible and repairable after failed extraction/catalog/index persistence. Existing capture and `data-room-processing.ts` paths. | Inject failure after capture; bounded retry repairs the same source without duplicate identity/audit. Derived-state inconsistency is visible and reconciled. Search eligibility follows committed stages. |
| 3: source and extraction identity | Original bytes, extracted text and page/table anchors remain distinguishable. Existing capture, processor and chunking records. | Same-length re-extraction invalidates old anchors; table/cell/page locators resolve; partial/OCR/translation uncertainty is disclosed. Family identity comes from stable origin/check-in or reviewed matching, rather than title alone. |
| 4: contextual scientific catalog | A reviewer can inspect, accept, reject or correct each framed fact. Existing catalog core, governance service, tools and Vault panel. | Wrong-assay number, measured-result/specification swap, wrong specimen/method/unit/denominator and incomplete context refuse or stay unresolved. Per-fact revisions and decisions survive retries and source changes; real PostgreSQL access/race tests and reviewer workflow pass. |
| 5: relevant evidence for AnA | Drafting retrieves complete-context passages anywhere in selected eligible documents. Existing Vault index/RAG, loader and authoring verification. | Late table beyond character 80,000 is retrieved with headers/footnotes. Versioned multi-range receipts round-trip through generation/save/export; stale source, changed extraction and revoked project access refuse. Ten specified failure fixtures and legacy-prefix compatibility pass. |
| 6: reproducible calculated claims | One admitted calculation links its inputs, approved analysis policy and exact output to a document span. Existing computation runs, method/replay registry and span lineage. | Independent reference values and inclusion/exclusion rules match; original inputs and method versions reproduce the result; unsupported designs refuse. Begin with a qualified pharma or IVD method on existing admitted formats. |
| 7: reviewed change consequences | Proposed source, cutoff, configuration or rule changes identify affected scientific claims and review tasks. Existing source-usage, derived-impact, comparator and governed actions. | Critical affected nodes found; unaffected controls preserved; stale preview cannot apply; no silent edits to approved content. Historical package remains reconstructible. |
| 8: scoped filing qualification | One application/pathway at a time gains a verified outline, package, validator and applicant channel. Existing regional packager, official-template engines and gateway owners. | Official golden artifact, local expert scope review, independent validator receipt and honest handoff/delivery state. Accepted transmission requires real authorized channel evidence. See F0–F9 for ownership and fixtures. |

Priority 1 began as a **confirmed component finding**, not a full submission bypass. The original probe showed clean subset clearance without a licensed validator; the current portable regression shows required clearance false. The continued tests also exercise the actual assessor with controlled DB boundaries and preserve composed release gates. Transport and real database/provider qualification remain untested. [Baseline/current probe and exact scope](../reports/data-room-research-2026-10-14/validator-classification-verification.md). A configurable LORENZ adapter and report import already exist; further qualification should extend these rather than create a parallel validator subsystem.

## Scientific facts and AI behavior

Start with five discriminated families: pharma clinical results; CMC results/specifications; device test results/acceptance criteria; IVD diagnostic performance; and IVD analytical performance. A source-stated fact and a server-computed result have different origins. Every fact carries its complete candidate revision, exact witnesses, original/extraction identity, evaluation and attributable human decision.

Review a claim's transcription, contextual agreement and scientific applicability separately. Missing denominator, reference standard, specimen or assay identity remains unresolved. Comparator agreement is not automatically sensitivity/specificity. A measured test result cannot inherit a specification's label. OCR confidence is not original-page confirmation. Preserve real legacy catalog confirmations while explicitly stating that their property/context binding was not recorded; never silently reinterpret an old approval as typed scientific verification.

Useful new AI capabilities include constrained structured proposals, relevant multi-range retrieval, original-page/table inspection, bilingual source/translation comparison, bounded tool use, and explanations of deterministic differences. Qualify each for its declared purpose. Multimodal inspection can propose evidence regions; it does not establish a calculation, scientific conclusion or regulatory decision by itself.

Reuse the existing model gateway and approved model registry. Version and evaluate model, prompt, retrieval, extraction and rule changes together for the affected cohort. Client placement, retention, purpose and project rights apply before model context is sent. A provider outage cannot relax those terms. Long-running work should checkpoint successful sections, propagate cancellation and fence retries within existing AnA run/job mechanisms; no new orchestration platform is justified by this study.

## Market and lifecycle delivery

All requested sectors and markets are research targets. Installed metadata, a retained engine or a generated ZIP alone does not establish a qualified customer workflow. The detailed matrix separately records authoring, artifact production, independent validation, template and transport.

| Market | Medicine/biotechnology priorities | Device/diagnostic priorities |
| --- | --- | --- |
| USA | Qualify one real IND sequence and current validation/channel contract; separate new-application eCTD4 from v3 lifecycle. Biologic/CGT CMC, BLA and safety obligations need their own scoped packs. | Qualify current official nIVD/IVD eSTAR and attachment behavior on one 510(k) pathway; then exact De Novo/PMA/request scopes. Vendored 7.0 versus recorded current 7.1 requires truthful format policy. |
| EU/EEA | CTIS trial evidence and country-specific Part II; distinguish centralised marketing from national/MRP/DCP. IRIS manages the new iMAA procedure, while the dossier goes through eSubmission Gateway. | Retain existing Annex II/III technical-file export, then qualify reachable MDR/IVDR workflows and NB handoff. IVD scientific validity, analytical and clinical performance are separate evidence tracks. EUDAMED registration is a separate obligation/channel. |
| UK | Combined IRAS trial preparation under effective rules, with dated transition decisions; marketing recognition and lifecycle need separate MHRA packs. | GB and NI classification, conformity, registration, study and PMS/MORE branches remain separate. EU technical files do not automatically complete UK obligations. |
| Japan | Japanese regional v4 medicine-approval scope, vocabulary and bilingual signoff; trial notification and regenerative-product requirements separately classified. | Product/class-specific approval, certification or notification with local MAH/DMAH and performance evidence. Medicine eCTD4 rules do not automatically govern devices/IVDs. |
| Canada | Activity-specific eCTD/non-eCTD/REP and Canadian M1; CTA, Schedule D biologic, site/lot and lifecycle obligations separately scoped. | Class-specific MDL/ITA and local evidence/ToC requirements; current availability of any limited eSTAR programme must be verified before offering it. |
| Australia | Current AU M1 and medicine lifecycle; distinguish prescription biological medicines from the legal biologicals framework before selecting trial/dossier/biovigilance obligations. | ARTG/sponsor/classification, Essential Principles, conformity, clinical/performance evidence, changes and vigilance. No drug eCTD default for device registration. |

Each route pack should encode product/class, pathway and lifecycle stage; binding law versus guidance; official source and retained version; effective and transition dates; local language/entity; applicable evidence; format/template; channel; and platform qualification. Preserve historical rules and decisions instead of rewriting previous filings when guidance changes. Q0–Q4 progression in the regulatory specification separates scoped drafts, expert-reviewed requirements, qualified deterministic exports, authorised official-channel tests and sponsor-controlled operational use.

Current launch boundaries remain explicit. Native XPT/SAS/Dataset-JSON readers, dataset-bundle ZIP intake and m5 dataset delivery are deferred. CMC composition currently supports small-molecule Module 3 for a US IND and refuses wider scopes. Hidden device-kit activation and new regional composition/transmission belong to their recorded product/release workstreams. This plan prepares those increments without removing refusals or claiming they shipped.

## Proving a moat

Evaluate five concrete hypotheses: scientifically justified reuse and bridging; reproducible exclusions/denominators/units; precise pre-change impact; historical filing reconstruction; and reviewed corrections that become regression evidence. These may outperform a specific workflow even where a competitor advertises a similar category. Public product pages cannot establish competitive absence.

The proposed full benchmark contains **90 cases**, from three product archetypes × five requested market groups × six variants, with a separate UK extension. This is a protocol, not an executed benchmark or reliability estimate. Begin with three expert-labelled science workflows and the customer's current process; then compare relevant licensed workflows from Weave, Veeva/ArisGlobal/Certara, Rimsys, Greenlight Guru/MasterControl or Benchling as applicable.

Freeze independent expected source anchors, frames, calculations, reuse decisions, affected/unaffected nodes and route boundaries before runs. Use clean, lookalike, late-table, change, historical-rule and revoked/stale-access variants. Measure critical unsupported claims, useful coverage, calculation disagreement, impact precision/recall, reconstruction, active SME review time, retries and total workflow cost. Report unavailable competitor capabilities as not assessed. Japanese outputs need scientific and bilingual review.

Build the context/decision/lineage semantics and evaluation corpus. Reuse existing canonical catalog, computation, authoring, lifecycle and gateway services. Buy or integrate qualified publishing/validation, OCR/table extraction and existing customer systems when they solve a measured problem. Start with reliable source connectors and reviewed publishing handoff; retain customer-owned relationships and portable exports. Cross-client improvement uses public, licensed or explicitly permitted evidence rather than pooling private dossiers.

## Implementation and release discipline

Publish the shared interface and meaningful failing examples before parallel implementation. Divide ownership by subsystem on `concept2cure-v2`, then use an independent reviewer and held-out cases. Prefer state-sequence, differential, transaction and fault-injection tests over tests that merely repeat implementation details. A gate must be observed refusing the bad case before being credited as effective.

New tenant content needs replay-safe migrations, public/integer organization identity, RLS/access proof, append-only privileges where promised, and export/purge integration. Experimental paths remain off until their corpus, database, UI and operational checks pass. Extend existing launch rows with exact evidence; do not declare D1–D10 green from this local patch. Full application builds, live storage recovery, real PostgreSQL isolation, installed rule packs, provider qualification and genuine agency acknowledgements require their own evidence.

The next implementation slice should apply the bounded processing-recovery contract and prove its five negative cases, including exact captured-byte binding and stale-attempt refusal. Processing/extraction identity makes contextual catalog facts and relevant-passage AnA drafting safe to extend. Qualified external package receipts remain a separate D7 increment. Competitive pilots should assess the resulting client workflow before broader adapters or infrastructure are enabled.
