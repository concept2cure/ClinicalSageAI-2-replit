# PQ `rag` component: verdict on `notExecutableReason`

**Filed by** session `…019ZvHmh` (row 74) on 2026-09-28 as D4 evidence. Two independent read-only verifiers were run, one tasked to confirm and one to refute (`verifiers.json`); both returned `claim_false`, and this synthesis re-derived each decisive point from source. The files it corrects (`pq-protocol.json`, `run-eval.ts`, `ga-readiness-report.mjs`) were inside session `…01VB8JEG`'s 24h window (`7cfba3ab6`, 2026-09-28 01:21), so those corrections are handed on, not made here.

Repo: /home/user/ClinicalSageAI-2-replit, branch concept2cure-v2, HEAD 39b3027c (2026-09-28). This was a read-only review. The only code run was one pure tsx simulation over `rag-metrics.ts` and `gold-dataset.json`, with no network and no database.

## Verdict

**CLAIM FALSE.** Both verifiers reached `claim_false`, and I re-derived every decisive point from source. The claim says CT.gov ingestion is "the only remaining blocker" and that the blocker is "operational, not code". Both halves are wrong:

1. The harness guarantees empty retrieval whatever is in any table. The cause is in code.
2. The named unblock writes to tables the RAG pipeline never reads, and those tables hold neither guidance text nor vectors.
3. The gold set cannot meet `minHitRate` against any corpus.
4. The PQ verdict and the PQ runner have no rag path. Flipping `executable: true`, the step the claim implies is all that remains, would be fail-open.
5. RAG answers carry no served model, so PQ rule 4 cannot be applied to them.

What is accurate in the claim:
- The sweep is gated on `ENABLE_CORPUS_INGESTION` (corpusIngestionSweep.ts:152-161). It also needs `CORPUS_INGESTION_INDICATIONS` (:73, :103-108).
- The generator pin is forwarded: run-eval.ts:103 → ragRouter.ts:168 → advancedRAGPipeline.ts:1599.
- The judge pin is in place (run-eval.ts:111-119), and self-grading is refused (run-eval.ts:136-143).

## Decisive evidence

**E1. The eval harness produces zero retrieval by construction.**
- `buildQueryParams` returns only `query`, `intent: 'regulatory_qa'`, `model`, `limit`, `useReranking` and `useMmr` (server/eval/rag/run-eval.ts:96-108). There is no `organizationUuid`, `corpus`, `organizationId` or `artifactScope`, and `parseArgs` has no flag for any of them (:44-62).
- `optionsForIntent` forwards all of these as `undefined` (server/services/ragRouter.ts:180-183).
- `retrieve()` binds `deps.search` to `searchInitial(..., options.organizationUuid, artifactScope, scope)` (advancedRAGPipeline.ts:528). `searchInitial` falls through to `searchVaultSimilar` (:631-640), which logs a warning and returns `[]` when `organizationUuid` is absent (:973-982).
- `assertTenantIsCurrent` stands down when there is no session scope (server/db/currentTenant.ts:97-98). The result is therefore a silent empty set, not an error.
- **Consequence:** `ENABLE_CORPUS_INGESTION` is not the cause of "retrieval scores 0 items". No corpus, however complete, changes this result.

**E2. The named unblock writes a store the pipeline never reads.**
- `scripts/ingest-corpus.ts:84-85` and `corpusIngestionSweep.ts:116` both call `ingestCtgovToCorpus` (server/services/corpus/index.ts:35-43). That wires `DrizzleCorpusWriter`, which imports only `csrReports` and `csrDetails` (drizzle-corpus-writer.ts:20) and writes only to those tables (:102, :107, :111, :114).
- Neither table has an embedding or vector column: a grep over shared/schema.ts:13190-13262 returns 0 hits.
- The rows are registry metadata. `statisticalMethods` is null and `results` is null (ctgov-normalizer.ts:207, :209).
- The runbook gives the corpus's purpose as "precedent benchmarking, design-rule evaluation, success-prior calibration" (docs/runbooks/corpus-ingestion.md:3-4). It does not mention RAG.
- The pipeline reads exactly five stores:
  - `vault.document_chunks` (advancedRAGPipeline.ts:1040, :1096)
  - `rag_chunks` (:1180, :1224), only when `corpus==='rag_chunks'` (:614)
  - `client_memory_entries` (:1304) and `project_memory_entries` (:1355), each only with `organizationId` (:1281, :1331)
  - `lumen_data_atoms`, only via `artifactScope` (:611-612)
- A grep for `knowledge_entries|csr_|document_vectors` over advancedRAGPipeline.ts, ragRouter.ts and rag-retrieval-strategies.ts returns nothing.

**E3. No regulatory-guidance corpus exists anywhere the pipeline reads, and `rag_chunks` has no writer.**
- A `git grep` for inserts into `rag_chunks` or `rag_documents` in server/ and scripts/ returns nothing. The tables are only created (migrations/0000_sweet_joseph.sql:4681, :4713; server/db/ensureCoreTables.ts:544, :559).
- `data/ich_guidelines/` tracks only README.md, which describes PDFs to be added later (:38-40).
- The only existing path into a readable store is Vault ingest: server/routes/vault-ingest.ts:233 → `ingestVaultDocument` → `chunkDocumentForIngest` (vault-ingest.service.ts:669) → `INSERT INTO vault.document_chunks` (document-chunking.service.ts:250).
- That path is gated per tenant on both the document catalog and `ana.vault_chunking` (vault-ingest.service.ts:380-385; document-chunking.service.ts:34-39). Both are off by default.

**E4. The gold set cannot meet `minHitRate` against any corpus.**
- The gold set has 20 items and `expectedSourceIds` is empty on all 20 (node check). Its own `$comment` says "SEED … Expand to 30-50 items" (gold-dataset.json:2), and its version is `0.2.0-seed` (:3).
- run-eval pushes to `hitRates` only when `expected.length > 0` (run-eval.ts:170-174). `mean([])` is 0 (rag-metrics.ts:31-33). 0 < 0.6, so the run FAILs (run-eval.ts:214-216).
- Simulation with a perfect retriever: `{items:20, scoredForHitRate:0, hitRate:0, passes0_6:false}`.

**E5. With empty retrieval, the model under qualification never runs, and faithfulness reads 0.**
- `queryWithGeneration` returns the canned refusal (advancedRAGPipeline.ts:1561-1567) before the `aiRouter.route` generation call (:1597).
- Faithfulness is scored only when `sources.length > 0` (run-eval.ts:181), so `mean([])` = 0 < 0.7 (:218-220).
- Simulation with empty retrieval: faithfulness is scored on 0 items. answer-contains is 0.100, which comes only from the two negative controls (gold-dataset.json:132-143).
- run-eval still prints "Attributable to <model> … usable as PQ evidence" (run-eval.ts:226-230), because it decides attribution from the flags alone.

**E6. The PQ has no rag path. Flipping `executable: true` would be fail-open.**
- rag reaches the verdict only through `unexecutableComponents` (pq-verdict.ts:92-96).
- `computeVerdict(protocol, generation, extraction)` takes no rag results (:201-205). `PqRecord` has no rag field (:244-263).
- The "required and executable but ran nothing → INCOMPLETE" guard exists only for extraction (:150-172).
- run-pq.ts imports no RAG module (:39-56) and runs only the generation and extraction phases (:202-243). No package.json script runs the rag eval (package.json:94-95).
- **Consequence:** setting `executable: true` removes rag from the INCOMPLETE reasons, and an approved protocol could then PASS with rag never executed.

**E7. RAG answers cannot satisfy PQ rule 4 (`servedModelVerified`, pq-verdict.ts:14-15, :105-111).**
- `AIResponse.model` carries the model that actually served the request (aiProviderRouter.ts:117-122). `queryWithGeneration` keeps only `response.content` (advancedRAGPipeline.ts:1644-1649). `RagRouterResult` has no model field (ragRouter.ts:112-118).
- run-pq verifies the reported model with `gateway.evaluateModel` and `servedModelMatches` (run-pq.ts:111-126, :205-213). The RAG path uses `aiRouter.route` and verifies nothing.
- The pin can also be silently ignored. When LiteLLM is enabled, `aiRouter.route` calls `liteLLMAdapter.execute(request, modelConfig)` (aiProviderRouter.ts:643-644), which sends `selectedModel.model`, not `request.model` (LiteLLMAdapter.ts:134). `selectModel` does not read `request.model` (aiProviderRouter.ts:398-481).
- Only a check on the served model catches this. The generator-pin "resolvedBlocker" (pq-protocol.json:36) is therefore overstated. pq-protocol.json:29 and run-pq.ts:89 still say rag is blocked on attribution, which is closer to the truth.

**E8. The named verification step cannot observe the named unblock, and the unblock command as quoted does not run.**
- scripts/verify-rag-corpus.mjs:89-97 counts nine tables. `csr_reports` and `csr_details` are not among them.
- A bare `tsx scripts/ingest-corpus.ts` exits 2 without `--indication`, `--intervention` or `--sponsor` (scripts/ingest-corpus.ts:52-55).

**E9. The GA dashboard repeats and amplifies the error.**
- scripts/ops/ga-readiness-report.mjs:767-769 says: "rag's remaining blocker is a corpus that was never ingested, and a session that cannot see that goes looking for the code".
- :771-787 quotes `notExecutableReason` into the D4 PQ row's unblock text (:808-811).
- The corpus row's gate (:843) names `scheduleCorpusIngestionSweep` and `buildIngestionPlan`. Neither exists: the real functions are `startCorpusIngestionSchedule` (corpusIngestionSweep.ts:152) and `buildCorpusIngestionPlan` (:53).

## Where the verifiers differed, resolved from code

- **Can the CRE atom bridge (scripts/cre/generate-atoms.ts) reach RAG?** Verifier 1 said "only via `artifactScope`, which run-eval never passes". Verifier 2 said it is unreachable through ragRouter entirely. **Verifier 2 is correct.**
  - `artifactScope.projectId` is a required field (advancedRAGPipeline.ts:161-164), and `searchProjectAtoms` always passes `projectId` (:660).
  - The `projectId` clause admits only `source_type IN ('artifact','data_room_upload')` (enhancedEmbeddingService.ts:567-568).
  - CRE atoms are `'clinical_regulatory_evidence'` (retrieval-atoms.service.ts:51, :418, :426).
  - CRE atoms also carry trial-design features, not guidance text.
- **Can faithfulness pass?** Verifier 1 said it "cannot rescue" the component. Verifier 2 said it could pass once a tenant and a guidance corpus exist. **Both are right, and one caveat matters.**
  - Faithfulness needs no `expectedSourceIds` (run-eval.ts:181-190), but it grades support, not correctness (rag-metrics.ts:107-133).
  - The generator is told to "say so clearly" when the sources are insufficient (advancedRAGPipeline.ts:1605). `isGroundedRefusal` matches only three phrasings (rag-metrics.ts:91-98).
  - A hedged "the sources do not address this" answer over irrelevant sources is therefore judged, and can score high. A faithfulness pass over a wrong corpus is possible, so `minHitRate` over real expected ids is the criterion that ties the answer to the right source.
- **Chunk ids or document ids? (Neither verifier raised this.)** run-eval compares `s.documentId || s.id` (run-eval.ts:166). Both the vault arm and the rag_chunks arm always set `documentId: row.document_id` (advancedRAGPipeline.ts:994, :1154). **Expected ids must therefore be document ids.** Chunk ids would never match, even though gold-dataset.json:2 and rag-metrics.ts:17 tell authors to use "chunk/atom ids".
  - Vault document ids are generated per database, so a gold file keyed on raw ids only works in the one database it was built against.
  - It needs a stable key, such as `document_code` + `version`, which is the vault upsert key (vault-ingest.service.ts:491), resolved to ids at run time.

## What rag needs to become executable and passable

Tags: **[code]** means build in this repo; **[data]** means content or files in this repo; **[operational]** means environment or run steps; **[governance]** means an owner decision. The items are listed in dependency order.

1. **Corpus content [data + operational].**
   - Use the official texts the 18 positive gold items ask about: ICH Q1A(R2), Q2(R1/R2), Q3A(R2), Q7, Q8(R2), E2A, E6(R2/R3), E9 and E9(R1), M4; 21 CFR 312.23 and 21 CFR 316 (the orphan 200,000 threshold); FDA guidance on Breakthrough Therapy, 510(k) substantial equivalence and BLA vs NDA (PHS Act 351 / FD&C 505); EMA PIP (Reg. 1901/2006); EU MDR 2017/745 Art. 61 and Annex XIV.
   - Pin revisions and dates, record a manifest (file, source URL, revision, sha256), and check redistribution terms for each source.
   - CT.gov data does not supply any of this.
2. **Store and ingestion path.**
   - **Recommended: `vault.document_chunks` under a dedicated evaluation organization [operational].** The path exists: Vault ingest (routes/vault-ingest.ts:233 → vault-ingest.service.ts:669 → document-chunking.service.ts:250). Turn on the document catalog and `ana.vault_chunking` toggles for that org only (vault-ingest.service.ts:380-385). The org needs a program to file under.
   - Optional **[code]**: a batch loader that calls `ingestVaultDocument` over the manifest, so the corpus is reproducible rather than hand-uploaded. It must use the same single admission path, with no second writer.
   - Alternative: `rag_chunks`. This needs a writer to be built **[code]**; none exists (E3).
3. **Scope flags on run-eval [code].** Add `--org-uuid` (vault), and `--corpus rag_chunks --org-id` if that store is chosen. Thread them through `buildQueryParams` (run-eval.ts:96-108), and fail the run up front when no tenant is given. Add a test that fails when the tenant is dropped, mirroring the existing test for the model pin (`__tests__/run-eval-attribution.test.ts`).
4. **Gold set [data], plus stable keying [code].**
   - Grow the set from 20 items to 30-50 (gold-dataset.json:2). Fill `expectedSourceIds` on every positive item with **document-level** keys (see "Chunk ids or document ids?" above), and keep the negatives' empty lists.
   - Key items on `document_code` + `version` and resolve them to ids at run time.
   - Version and hash the gold file and the corpus manifest the way run-pq records `goldBankSha256`.
   - Fix the stale "12-item seed" text (server/eval/rag/README.md:18, :70) and the "chunk/atom ids" instruction (gold-dataset.json:2, rag-metrics.ts:17).
5. **Fail closed on unscored metrics [code].** When 0 items are scored for hit-rate or faithfulness, report NOT_EXECUTED/INCOMPLETE rather than a numeric 0 read as FAIL (run-eval.ts:198-221; rag-metrics.ts:31-33). Also withhold the "usable as PQ evidence" line when the generator never ran (run-eval.ts:226-230).
6. **Served-model attribution [code].** Return `response.model` from `queryWithGeneration` (advancedRAGPipeline.ts:1644-1649) through `RagRouterResult` (ragRouter.ts:112-118), or route RAG generation through `gateway.evaluateModel` as run-pq does. Verify the generator per item with `servedModelMatches`, and verify the judge the same way.
7. **PQ integration [code], then the flag flip [data].**
   - Add `PqRagResult` (served model, verified flag, hit, faithfulness, error) and `PqRecord.rag` (pq-verdict.ts:244-263).
   - Add a rag phase in run-pq.ts.
   - Add a `ragFindings` step in `computeVerdict`, mirroring `extractionFindings` (:155-195). It should return INCOMPLETE when rag is required and executable but scored nothing, and measure `minHitRate` and `minFaithfulness` only over verified items.
   - Only after that set `components.rag.executable: true`, and update run-pq.test.ts:124-131, whose comment at :128 is stale.
8. **Reproducible retrieval [code or protocol].** `regulatory_qa` runs strategy `advanced` (ragRouter.ts:140-152), which uses unpinned HyDE (rag-retrieval-strategies.ts:72-73), unpinned multi-query (:98-99) and an LLM reranker (rag-reranker.ts:107-110). Either pin these or run the PQ with strategy `basic` and reranking off. Otherwise the retrieval set behind hit-rate depends on models nobody qualified, contrary to README.md:51.
9. **Protocol [governance].**
   - Consider a rag sample floor, for example `minScoredItems`, sourced from gold-dataset.json:2 ("30-50"), matching generation's `minTasksPerDocType`.
   - Consider whether a correctness criterion is needed alongside faithfulness (see "Can faithfulness pass?" above).
   - Owner approval of pq-protocol.json (`status: "draft"`, :6) is still required for any PASS (pq-verdict.ts:231-238).
10. **Corrections [data/code].**
    - Replace pq-protocol.json:34 with the text below.
    - Fix ga-readiness-report.mjs:767-769 (comment) and :843 (gate function names).
    - Fix :845 (unblock text): it offers CT.gov ingestion as the unblock and `verify-rag-corpus.mjs` as its check, and that check cannot see `csr_*`.
    - Fix scripts/verify-rag-corpus.mjs: report the specific store and org the PQ will read, and exit non-zero when that eval corpus is empty.

## Corrected `notExecutableReason` (one paragraph, for pq-protocol.json)

> Not executable, and the blockers are code and data in this repository, not an operational switch. (1) server/eval/rag/run-eval.ts buildQueryParams passes no organizationUuid, corpus or artifactScope, so ragRouter falls to the vault arm, which returns no documents without a tenant (advancedRAGPipeline.ts searchVaultSimilar). Retrieval is therefore empty whatever any table holds, the pinned generator is never called and faithfulness scores 0 items. (2) No regulatory-guidance corpus exists in any store the pipeline reads. The gold questions need the official ICH Q1A(R2), Q2, Q3A(R2), Q7, Q8, E2A, E6, E9/E9(R1) and M4 texts, 21 CFR 312.23 and Part 316, FDA Breakthrough, 510(k) and BLA/NDA material, EMA PIP rules and EU MDR, ingested with embeddings into vault.document_chunks for a named evaluation organization (Vault ingest with the document catalog and ana.vault_chunking enabled for that org), or into rag_chunks, which has no writer. ClinicalTrials.gov ingestion (scripts/ingest-corpus.ts and the ENABLE_CORPUS_INGESTION sweep) writes csr_reports/csr_details, which the pipeline never reads and which hold no embeddings, so it does not unblock this component. (3) server/eval/rag/gold-dataset.json is a 20-item seed with every expectedSourceIds empty, so hit-rate scores 0 items and cannot meet minHitRate against any corpus. It needs 30-50 items whose expected sources are vault document ids (run-eval compares documentId, not chunk id) under a stable key. (4) server/eval/pq/run-pq.ts has no rag phase, and pq-verdict.ts computeVerdict and PqRecord take no rag results, so setting executable to true today would silently drop rag from the verdict. A rag phase and a ragFindings step that returns INCOMPLETE when nothing was scored must land first. (5) queryWithGeneration discards the served model, so the servedModelVerified rule cannot be applied to RAG answers, and the LiteLLM path does not honour the pin at all. (6) HyDE, multi-query and the LLM reranker route unpinned, so the PQ must run strategy 'basic' without reranking or pin them. Until (1)-(6) are done, this component stays executable: false.
