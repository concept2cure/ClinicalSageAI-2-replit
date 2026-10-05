# PQ `rag` component, data track: guidance-corpus manifest and gold keys

**Filed by** session `…019ZvHmh` on 2026-09-28 as D4 evidence. The authority is `docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/`: E3 and E4, and items 1, 2 and 4 of its "What rag needs" list. The founder decisions of 2026-09-28 apply:

- The corpus is the official guidance texts.
- The single admission path is Vault ingest into a dedicated evaluation organisation.
- Each document has a manifest entry with source URL, revision, date, sha256 and terms.
- The gold set has 30-50 items, keyed by `document_code@version` and resolved to ids at run time.
- The PQ runs retrieval strategy `basic` with reranking off.

This track moves no D-row to green. Row 74 of `docs/work-orders/README.md` does not describe this work, and that file is outside this lane; see "Handed on".

Repo: /home/user/ClinicalSageAI-2-replit, branch concept2cure-v2, HEAD `eb62b566c`. Nothing is committed. Only this lane's two data files and this folder were written.

## Status: BLOCKED on verification (RULE 2: blocked, not done)

The manifest and the gold keys are complete, consistent and fail-closed. Two things are missing:

- **Nothing is verified.** The session's egress policy refused every issuer host twice on 2026-09-28: during the build, and again at 17:25Z during the fix pass. See `red/egress-recheck.txt`. No file was downloaded, so no sha256 was computed, no terms were read, and no URL was fetched.
- **The gold set is not expanded.** It has 20 items against the 30-50 target. A new item requires a quote from the **verified** official text, and no text could be read. No quote was written from memory.

`check-gold-manifest.mjs --ready` records this state as a red check: 0 of 18 positive items are PQ-ready (`red/readiness.txt`).

## What changed

**`server/eval/rag/guidance-corpus-manifest.json`** is a new file with 24 entries, all `verified:false`.
- **Answer sources (18).** One per keyed document:
  - ICH Q1A(R2), Q2(R1), Q3A(R2), Q7, Q8(R2), E2A, E6(R2), E9, E9(R1) and M4(R4);
  - 21 CFR 312.23 and Part 316;
  - FDA Expedited Programs and 510(k) SE guidance;
  - 42 USC 262 and 21 USC 355;
  - Reg. 1901/2006 and Reg. 2017/745.
- **Revision distractors (2), not keyed:** Q2(R2) and E6(R3).
- **Supporting documents (4), not keyed until their text is read:**
  - FDA Multiple Endpoints (2022);
  - FDA "Deemed to be a License" Q&A;
  - Commission guideline 2014/C 338/01;
  - EMA procedural advice on paediatric applications, `UNPINNED`.
- The file also records:
  - issuers (the authoring bodies) separately from publishers (the terms holders);
  - a version scheme per source family;
  - the admission path;
  - ten fail-closed rules;
  - a six-step verify procedure;
  - every refused host.

**`server/eval/rag/gold-dataset.json`**: version 0.2.0-seed → 0.3.0-seed. It keeps the same 20 items, and no original field changed (checked against `462a6ca7a`). Added:
- `expectedSourceKeys` on every item: 18 positives keyed to answer sources, `[]` on the two negative controls;
- `keysProvisional: true`;
- `openChecks` on five items whose expected substrings may not appear in the keyed text.

`expectedSourceIds` stays `[]`, because the key-to-id resolver belongs to `run-eval.ts`. `$comment` now cites this evidence instead of row 74.

### Review objections, resolved

| # | Objection | Resolution |
|---|---|---|
| 1 | No new items; the expansion is not complete. | Accepted. The track is reported **BLOCKED**, and readiness is a recorded red check. |
| 2 | "Row 74" does not describe this work. | Both `$comment`s now cite this folder and the misdescribed-unblock folder. A row-74 clause is handed on. |
| 3 | `351` probably appears nowhere in the codified 42 USC 262 text. | This is an `openChecks` entry on fda-bla-vs-nda. The index shows `§351` only in the source credit. The FDA "Deemed to be a License" Q&A, which per the index names section 351, is the candidate to key once it has been read. |
| 4 | The two US Code keys use different editions. | Both are now `USCODE-2024`: the index now returns 2024 for 42 USC 262 too. Rule: one edition per code, enforced by the check. |
| 5 | `Step4` alone does not tell E6(R3) Annex 2 from the main E6(R3) file. | Rule "one entry is one file". `ICH-E6-R3-ANNEX2` is reserved for Annex 2. The check refuses two verified entries sharing a sha256. |
| 6 | FDA Multiple Endpoints guidance is missing. | Added as `supporting`, final-2022-10. The multiplicity item carries an `openChecks` entry: its grounding source is undecided until E9 has been read. |
| 7 | `issuer` names the publisher. | Split into `issuers` (ICH, US-FDA, US-CONGRESS, EU-EP-COUNCIL, EU-COMMISSION, EMA) and `publishers` (whose terms apply). |
| 8 | `OJ` described as authentic, and pinning the unamended text. | EU-OJ now says the electronic OJ is authentic only from 2013-07-01 (Reg. 216/2013). The amended acts pin dated consolidated versions (`CONS-2019-01-28`, `CONS-2026-01-01`), with the OJ texts kept as `authenticTextCandidates` for checking articles. |
| 9 | Dates the index gave were recorded as missing. | Index dates added for E9 (1998-02-05), E9(R1) (2019-11-20), E2A (1994-10-27), E6(R2) (2016-11-09), Q7 (2000-11-10) and M4(R4) (2016-06). Two of them carry an **echo risk** note, because the query contained the date. |
| 10 | The CFR edition looks final. | `versionCandidates` added (2025-04-01, 2026-04-01) and the version marked PROVISIONAL. `keyFormat` and verify step 3 require re-pinning to the latest edition. The gold file carries `keysProvisional`. |
| 11 | Quote marks in the unfetched ICH terms summary. | Paraphrased. The check refuses quote marks in any `termsSearchIndexSummary`. |
| 12 | No EMA PIP document. | `EMA-PROC-ADVICE-PAEDIATRIC-APPLICATIONS` added as `UNPINNED`: the index gives both Rev. 12 and Rev. 15. The three queries run are recorded. An UNPINNED entry cannot be keyed or ingested. |

## Proof

The base for the gold comparison is `git show 462a6ca7a:server/eval/rag/gold-dataset.json`, the last commit that touched the file (2026-09-05).

| File | What it shows | Exit |
|---|---|---|
| `red/prefix-structure.txt` | The new check on this lane's pre-fix build. It fails: no `publishers`, no issuer/publisher split, no EU-CONS or UNPINNED scheme, no `keysProvisional`. | 1 |
| `green/structure.txt` | The check on the fixed files: 20 items, 24 entries, 18 keys, 5 items with open checks, 0 structural errors. | 0 |
| `red/readiness.txt` | `--ready` on the fixed files: 0 of 18 positives ready. Each lacks an evidence quote and a verified key; five also have open checks. **This is the blocked state, recorded as a red check.** | 1 |
| `green/mutations.txt` | 19 mutations of the real data, each caught for its stated reason (the objection it tests is in brackets); `--ready` red on the real data; a positive control (one verified, quoted item) green. **21 of 21 as intended.** | 0 |
| `green/rag-tests.txt` | `rag-metrics.test.ts` and `run-eval-attribution.test.ts`, `--maxWorkers=2`: 2 files, 28/28. | 0 |
| `green/e4-simulation.txt` | A perfect retriever over the new gold set: `{items:20, withKeys:18, scoredForHitRate:0, hitRate:0}`. **The keys do not change E4 until the resolver exists; this is intended.** | 0 |
| `red/egress-recheck.txt` | 14 issuer and archive hosts, each refused with CONNECT 403. | — |
| `search-log.md` | Every query in the fix pass, what the index returned, and where it was used. | — |

`check-gold-manifest.mjs` and `mutations.mjs` are ESLint-clean. They are evidence scripts, not CI; promoting the check to a test is handed on.

## Handed on

### To session `…01VB8JEG`

These files are inside that session's window (`7cfba3ab6`).

1. **pq-protocol.json:34 `notExecutableReason`.** Replace it with this paragraph. It supersedes the version in the misdescribed-unblock README, because it now reflects the manifest and the gold keys:

   > Not executable; the blockers are code and data in this repository, not an operational switch. (1) server/eval/rag/run-eval.ts buildQueryParams passes no organizationUuid, corpus or artifactScope, so ragRouter falls to the vault arm, which returns no documents without a tenant; retrieval is empty whatever any table holds, the pinned generator is never called and faithfulness scores 0 items. It also sends useReranking: true and no strategy, so regulatory_qa runs strategy 'advanced' with unpinned HyDE, multi-query and an LLM reranker, where the PQ requires strategy 'basic' with reranking off. (2) No regulatory-guidance corpus exists in any store the pipeline reads. server/eval/rag/guidance-corpus-manifest.json names the official texts the gold questions need, to be admitted only through Vault ingest into a dedicated evaluation organisation (document catalog and ana.vault_chunking enabled for that organisation only), but none of its entries is verified (no file, sha256 or reuse terms has been read), so none may be ingested. ClinicalTrials.gov ingestion (scripts/ingest-corpus.ts, the ENABLE_CORPUS_INGESTION sweep) writes csr_reports/csr_details, which the pipeline never reads and which hold no embeddings; it does not unblock this component. (3) server/eval/rag/gold-dataset.json is a 20-item seed, below the 30-50 required; its expectedSourceKeys (document_code@version) are provisional and nothing resolves them to vault document ids yet, so every expectedSourceIds is empty and hit-rate scores 0 items. (4) server/eval/pq/run-pq.ts has no rag phase. (5) queryWithGeneration discards the served model, so the servedModelVerified rule cannot be applied to RAG answers, and the LiteLLM path does not honour the pin. Until (1)-(5) are done, this component stays executable: false.

   Clause (4) relies on the verdict side refusing a rag component that was not run. Another lane's uncommitted `pq-verdict.ts` (`ragFindings`) and `run-pq.ts` (`ragNotRun()`) add that. If they have not landed when this text is applied, restore the misdescribed README's clause (4): flipping `executable` would drop rag from the verdict silently.
2. **Scope flags on run-eval.**
   - Add `--org-uuid` for the vault store, plus `--corpus rag_chunks --org-id` if that store is ever chosen.
   - Thread them through `buildQueryParams` (run-eval.ts:96-108), and refuse the run up front when no tenant is given.
   - Add a test that fails when the tenant is dropped, mirroring `__tests__/run-eval-attribution.test.ts`.
3. **Strategy `basic`, reranking off, for the PQ.**
   - `buildQueryParams` sends `useReranking: true` and `useMmr: true` (run-eval.ts:105-106) and no `strategy`, so `regulatory_qa` defaults to `advanced` (ragRouter.ts:140-147).
   - A PQ run must send `strategy: 'basic'` and `useReranking: false`, and record both. Pin this with a test.
4. **The key-to-id resolver in run-eval.**
   - Read `expectedSourceKeys` and `guidance-corpus-manifest.json`, and resolve `document_code@version` through the vault upsert key `(program_id, document_code, version)` of the evaluation organisation's programme.
   - Require `vault.documents.content_hash` to equal the manifest sha256.
   - Refuse entries that are `verified:false`, `UNPINNED` or not `answer-source`, and treat items with `openChecks` as unscored.
   - An unresolved item is unscored, and zero scored items is INCOMPLETE/NOT_EXECUTED, never `mean([])` = 0 read as FAIL (run-eval.ts:167-174; rag-metrics.ts `mean`).
   - Withhold "usable as PQ evidence" (run-eval.ts:229) when the generator never ran.
   - Promote `check-gold-manifest.mjs` from this folder to a committed test under `server/eval/rag/__tests__/`.
5. **Served-model attribution.**
   - Return `response.model` from `queryWithGeneration` (advancedRAGPipeline.ts:1644-1649) through `RagRouterResult` (ragRouter.ts:112-118).
   - Verify it per item with `servedModelMatches`, and verify the judge the same way.
   - The LiteLLM path sends the selected model, not the pinned one (aiProviderRouter.ts:644, :691). Only a served-model check catches that.
6. **The rag phase in run-pq.ts.**
   - Run the tenant-scoped, strategy-`basic` eval per item and record `PqRagResult`: served model, verified flag, hit, faithfulness, error. The record shapes are the ones another lane's uncommitted `pq-verdict.ts` defines (`PqRagResult`, `PqRagRecord`).
   - The phase replaces that lane's `ragNotRun()` record.
   - Record the gold file's and the manifest's sha256 in the PQ record, as `goldBankSha256` is recorded for generation.
7. **ga-readiness-report.mjs.**
   - The comment at :767-769 says rag's remaining blocker is "a corpus that was never ingested". That is false (misdescribed README, E1-E6).
   - The gate text at :843 names `scheduleCorpusIngestionSweep` and `buildIngestionPlan`, which do not exist. The real functions are `startCorpusIngestionSchedule` (corpusIngestionSweep.ts:152) and `buildCorpusIngestionPlan` (:53).
   - The unblock text at :845 offers CT.gov ingestion and the default `verify-rag-corpus.mjs` report as the unblock. It should name the manifest's verify procedure, and Vault ingest into the evaluation organisation, checked by `verify-rag-corpus.mjs --org-uuid` once that other lane's change has landed.
   - :771-787 quotes `notExecutableReason`, so it picks up item 1 automatically.
8. **Stale text.** server/eval/rag/README.md:18 ("Currently a 12-item seed") and :74 ("chunk/atom ids"), and rag-metrics.ts:17 ("Document/chunk ids"). All three should say document ids and `document_code@version` keys.

### To the owner of `docs/work-orders/README.md`

Row 74 is a founder-directed row that moves no D-row. It does not describe this work. Add a D4 row, or a clause to an existing D4 row, citing this folder and `…/2026-09-28-pq-rag-unblock-misdescribed/`.

### To an operator with issuer egress

The unblock for this track:

1. **Allow the hosts:** database.ich.org, www.ich.org, www.govinfo.gov, www.fda.gov, eur-lex.europa.eu, www.ema.europa.eu and ema.europa.eu. Alternatively, re-authenticate the Lawstronaut MCP; that yields text only, and the hashes still need the issuer's files.
2. **Run the manifest's `verifyProcedure`** on each entry:
   - Record the dated `sourceUrl`, sha256 and date, and the terms quoted from the publisher's page.
   - Re-pin the CFR edition (2026-04-01 if published), the US Code edition, and the EU consolidations to the latest versions, and rewrite the gold keys in the same commit.
   - Resolve the five `openChecks` from the verified text.
   - Pin the EMA procedural advice to the revision printed on it.
   - When every keyed entry has `versionVerified:true`, set `keysProvisional:false`.
3. **Write 10-30 new positive items.** Each needs `evidence: {document_code, section, quote}` from a verified entry, and each `expectedAnswerContains` must be a substring of its quote. Then run `check-gold-manifest.mjs --ready` and file its output. The track is done only when that run is green.
4. **Ingest through Vault** into the evaluation organisation, with the document catalog and `ana.vault_chunking` enabled for that organisation only. Add the acknowledgement the ICH notice requires to each ICH record.
