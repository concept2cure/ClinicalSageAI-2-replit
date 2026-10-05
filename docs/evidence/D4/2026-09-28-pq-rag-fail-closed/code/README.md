# PQ `rag` component: the verdict fails closed, and the corpus preflight says what it checks

**Filed by** session `…019ZvHmh` (row 74) on 2026-09-28 as D4 evidence. It is the code half of the finding in `docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/` (E6, E8). The data half (gold set and corpus manifest) is `../data/`, filed by another lane, and is not described here.

Repo: /home/user/ClinicalSageAI-2-replit, branch concept2cure-v2, HEAD eb62b566c. **Nothing is committed.**

The work follows the founder decisions of 2026-09-28, made by the product owner under the delegation recorded in ADR-0015:
- The PQ rag corpus is the official guidance texts the gold questions ask about. It is ingested through the existing Vault ingest path into a dedicated evaluation organization, and every document has a manifest entry.
- The gold set grows to 30-50 items, keyed by `document_code` + `version` and resolved to ids at run time.
- The PQ runs retrieval strategy `basic` with reranking off.

## Verdict

**E6 is closed.** Setting `components.rag.executable: true` can no longer produce a PASS unless a rag run actually measured the pinned model. It also cannot PASS on the smaller shapes of the same defect that review found in the first pass of this change:
- one scored item out of a 30-50 item gold set;
- the same item counted three times;
- an unkeyed gold item read as a negative control;
- a NaN or out-of-range score;
- a missing, string or misspelt criterion;
- the string `"false"` read as a run or as verification.

Each of these now returns INCOMPLETE and names the cause.

While rag is not required, or not executable, the verdict is exactly HEAD's. A differential over 268,800 combinations checks this (below). The protocol as shipped (draft, rag `executable: false`) is unaffected.

`verify-rag-corpus.mjs --org-uuid` counts the store a PQ rag run will read. It exits 1 on an empty, unknown or unreadable corpus. It says plainly that exit 0 means **non-empty, not complete**. The default report is byte-identical to HEAD's.

## What changed

**server/eval/pq/pq-verdict.ts**
- New types:
  - `PqRagResult`: `itemId`, **`negativeControl`**, `servedModel`, `servedModelVerified`, `hit`, `faithfulness`, `error`.
  - `PqRagRecord`: `ran`, `notRunReason`, `itemsScored`, `items`.
  - An optional `PqRecord.rag`, and an optional fourth argument to `computeVerdict`.
- `ragFindings` applies only when rag is required **and** executable. It returns INCOMPLETE when:
  - the record is absent, or `ran` is anything but the boolean `true`;
  - the record is malformed: `items` is not a list, an item has no id, a type is wrong, a score is not a finite number in [0,1], or `error` is empty;
  - the record is inconsistent: an `itemId` repeats, a declared control carries a hit, or `itemsScored` disagrees with the items;
  - nothing was scored, or an item errored;
  - a positive item (not a declared control) has no hit, which means an unkeyed or unresolved gold item;
  - a positive item was not judged for faithfulness and carries no error;
  - an item was answered by an unverified model;
  - a criterion was measured on 0 items, or on fewer than **`criteria.minScoredItems`**;
  - the protocol's rag criteria cannot be applied as written: `minHitRate` or `minFaithfulness` is missing or not a number in [0,1], `minScoredItems` is missing or not a positive whole number, or a key is one the verdict does not measure.
- How the criteria are measured:
  - Only over items the pinned model verifiably answered.
  - Hit rate is measured over positive items. Faithfulness is measured over every judged item, controls included, as run-eval scores it (server/eval/rag/run-eval.ts faithfulness loop).
  - The floor applies to each criterion separately.
- `unmeasuredComponents`: a required, executable component with no verdict step is INCOMPLETE. This is the E6 defect in general form, and it changes nothing for today's protocol.

**server/eval/pq/run-pq.ts**
- It has no rag phase. It records `rag: { ran: false, notRunReason: 'run-pq has no rag phase: …', itemsScored: 0, items: [] }` in the result and in the record, so an executable rag is INCOMPLETE and never PASS.
- It takes **no protocol path**. The first pass added `RunPqOptions.protocolPath`, and review showed that was a new route to a genuine-looking PASS record against an approved copy of a caller's own making. It is removed. Tests redirect the one `readFileSync` of `pq-protocol.json` through `vi.mock('node:fs')` instead.

**scripts/verify-rag-corpus.mjs**
- `--org-uuid <uuid>` counts documents, chunks and embedded chunks for that organization, using the vault arm's own predicates. It runs in a READ ONLY transaction with `app.current_org_id` set, the same GUC the pipeline sets, and rolls back.
- The headline reads: *the store a PQ rag run will read (vault arm, this organization) once run-eval is tenant-scoped*. No PQ path reads it today.
- Exit 0 prints `RESULT: NON-EMPTY — …` followed by *completeness against the guidance-corpus manifest is NOT checked*.
- Exit codes:
  - 1: an empty corpus, an unknown org, a missing store, or a read error. A read error is reported as unreadable, never as empty.
  - 2: a malformed uuid, reported before any database is touched.
- `csr_reports` and `csr_details` are counted, and each line says they are *NOT read by the RAG pipeline*. They never decide the exit code.
- The exit code is applied after the pool closes.
- The claim that the count equals what vault RLS admits on a non-owner role is **withdrawn**. The policies go through `core.can_access_program(program_id)`, which the script does not model and no test checks. The comment now says so, and says to run the script as the application's role.
- The UUID regex is a documented copy of advancedRAGPipeline.ts:337. That module is TypeScript and does not export it.

**Tests**
- server/eval/pq/__tests__/pq-verdict-rag.test.ts: 63 cases, all against an approved copy of the real protocol. The parity block pins today's verdicts and reasons **literally**, not by calling the module under test.
- server/eval/pq/__tests__/run-pq.test.ts: a `run-pq rag component` block with 4 cases:
  - the record says rag was not run;
  - the redirect works (control → PASS);
  - E6 → not PASS;
  - an injected `protocolPath` is ignored, and the record hashes the real file.
- tests/ops/verify-rag-corpus.test.mjs: 29 cases.
  - The drift pin now slices both vault-arm SQL templates out of `searchVaultSimilar` and requires each arm's FROM/JOIN and WHERE conjuncts to **equal** `EVAL_CORPUS_PREDICATES`. The lexical arm's text match and the caller-filter placeholder are excepted.
  - Two cases show the pin failing:
    - a `d.deleted_at IS NULL` added to the vault arm;
    - `c.embedding IS NOT NULL` removed from the lexical vault arm. The same text survives in the rag_chunks arms, and the whole-file check this replaces still finds it there.
- tests/ops/helpers/pglite-as-pg.mjs + pglite-as-pg-register.mjs: a `pg` stand-in on PGlite for CLI end-to-end runs. The header says why `server/services/ana-ri/__tests__/pglite-pool.fixture.ts` cannot be reused: it is TypeScript with an extensionless import, while the script runs under plain `node`.

## Proof

| What | Result | File |
|---|---|---|
| New pq tests against **HEAD** source | 47 failed / 34 passed. 40 × `expected 'PASS' to be 'INCOMPLETE'`, 3 × `'PASS'` to be `'FAIL'`. The runner's E6 case fails on **`expected 'PASS' not to be 'PASS'`**: HEAD's runner PASSes an approved protocol with rag executable and never run. | red/pq-tests-vs-HEAD.txt |
| Same, against the **first-pass** build state | 32 failed. 25 × PASS where INCOMPLETE was expected (1 scored item; duplicates; undeclared null items; NaN, 5, -1, Infinity; `ran: "false"`; missing, string or misspelt criteria; no floor). The `protocolPath` case fails with `expected 'PASS' not to be 'PASS'`. | red/pq-tests-vs-build-state.txt |
| verify tests against HEAD's script | The link fails: the script exported nothing, and importing it ran the CLI. | red/verify-tests-vs-HEAD.txt |
| verify tests against the first pass | 3 failed: the NON-EMPTY/manifest line, the headline, and the e2e RESULT. | red/verify-tests-vs-build-state.txt |
| CLI e2e, HEAD vs now | HEAD ignores `--org-uuid`, prints another tenant's chunk as `vault.document_chunks rows=1 embedded=1`, never mentions `csr_*`, and **exits 0** on an empty evaluation org. Now: EMPTY exits 1, NON-EMPTY exits 0, and csr_* is labelled NOT read. | red/verify-cli-e2e-HEAD-vs-now.txt |
| Green | `vitest server/eval/pq/ server/eval/rag/`: 6 files, **141/141**. `node --test tests/ops/verify-rag-corpus.test.mjs`: **29/29**. | green/ |
| Default report | Byte-identical to HEAD's on both seeds (stdout, stderr, exit 0). | green/default-report-identical-to-HEAD.txt |
| Neighbours | `ci:pq-evaluation-callers` passes. high-risk-model-approval.test.ts: 25/25. | green/neighbours.txt |
| Mutations | **31/31 killed**, and every file was restored byte-for-byte (sha256 compared). 19 are on the verdict, 3 on the runner, 7 on the script and 2 on the drift checker itself. They include overcorrections: rag always INCOMPLETE, rag judged when not executable, a fabricated rag run, always exit 1, and a checker that fails everything. | mutations/ |
| Parity with HEAD | HEAD's `computeVerdict` vs the new one over **268,800** combinations. There are 0 differences in the 151,200 where rag is not required and executable, and **0** cases where the new verdict PASSes and HEAD did not. The differential is not a pass-only check: with mutant M19 (rag judged when not executable) it reports 42,120 parity differences and exits 1. | differential/ |
| tsc | Scoped to the 5 PQ .ts files: 0 errors. A canary with a deliberate type error is caught (exit 2). Full-project tsc is OOM-killed in this shared container. | green/tsc.txt |
| eslint | The 7 files in lint scope are clean at `--max-warnings=0`. scripts/** is outside lint scope (eslint.config.js). With `--no-ignore`, the script has 15 `no-console` warnings before and after the change, all in the unchanged default report. The new output line uses `console.info`. | green/eslint.txt |

## Review objections, resolved

| # | Resolution |
|---|---|
| 1, 10 | `protocolPath` removed. Tests redirect through `vi.mock('node:fs')`. A new test passes a `protocolPath` to an approved rag-not-required copy and requires the verdict not to be PASS and the record to hash the real file. It is red against the first pass. Mutation R1 kills it. |
| 2 | The runner's E6 test uses the fs redirect. Against HEAD it goes red on `expected 'PASS' not to be 'PASS'`. It was re-recorded. |
| 3, 11 | `criteria.minScoredItems` is enforced per criterion over distinct verified items. It is INCOMPLETE when absent or not a positive whole number. Repeated `itemId` → inconsistent. |
| 4, 11 | `negativeControl` is required on every item. An undeclared no-hit item, or an unjudged positive item with no error, is named INCOMPLETE. A control carrying a hit → inconsistent. |
| 5 | Scores must be finite numbers in [0,1], or the record is refused before anything is counted. `ran`, `servedModelVerified` and `negativeControl` must be booleans. |
| 6, 12 | Missing, non-numeric or out-of-range minimums → INCOMPLETE. So is any criterion key the verdict does not measure (a misspelt `minScoredItem`). The floor the first pass only recommended is now implemented. |
| 7 | Parity is pinned literally in the repo test. The HEAD-vs-new differential is filed here. |
| 8 | Renamed. It now asserts `/inconsistent.*itemsScored 0.*3 item/`. |
| 9, 15 | The RESULT line says NON-EMPTY and that manifest completeness is NOT checked. A manifest-coverage mode is handed on to the corpus track (below). |
| 13 | `console.info`. The report states the lint scope and gives the `--no-ignore` delta (15 → 15). |
| 14 | The drift pin slices the vault arm. It fails on an added restriction and on a predicate moved out of the vault arm; both are shown in-file. The checker is two-sided (T1 and T2). |
| 16 | The headline and header now say *will read … once run-eval is tenant-scoped*. |
| 17 | The RLS claim is withdrawn. The test title says *same GUC … (no RLS claim: not tested here)*. |
| 18 | The helper header states why the TS fixture cannot be loaded. The UUID regex is documented as a copy. |
| 19 | See "Lane hygiene" below. |

## Handed on to session `…01VB8JEG` (its files, inside its 24h window from 7cfba3ab6)

1. **pq-protocol.json `components.rag`**
   - Replace `notExecutableReason` with the corrected paragraph in `../../2026-09-28-pq-rag-unblock-misdescribed/README.md`. **Amend its point (4)**, which is now half out of date, to read: *"(4) server/eval/pq/run-pq.ts has no rag phase. It records rag as not run, and computeVerdict returns INCOMPLETE for an executable rag without results (docs/evidence/D4/2026-09-28-pq-rag-fail-closed/code/). A rag phase must land first."*
   - Add **`criteria.minScoredItems`**. While rag is executable, the verdict is INCOMPLETE without it. It is a positive whole number, and it applies to **each** criterion over distinct items the pinned model verifiably answered. Negative controls do not count toward hit rate, so the number of keyed positive items must reach it. Source it from the 30-50 gold-set decision.
   - Any other key under `criteria` is refused.
   - Keep `executable: false` until the rag phase below lands.
2. **server/eval/rag/run-eval.ts: scope flags**
   - Add `--org-uuid`, and fail up front without it.
   - Thread it through `buildQueryParams` (:96-108). Add a test that fails when the tenant is dropped, mirroring `run-eval-attribution.test.ts`.
3. **The key→id resolver.**
   - Gold items carry `document_code` + `version` and are resolved at run time to vault document ids in the evaluation org. The Vault upsert key is `(program_id, document_code, version)` (server/services/vault/vault-ingest.service.ts:491), so a key can match zero documents or several across programs.
   - The resolver must record either case on the item as an `error` naming the key. It must never silently null or drop the item.
   - Each gold item must **declare** `negativeControl`. The verdict no longer infers a control from empty expected sources.
4. **Served-model attribution.**
   - Return `response.model` from `queryWithGeneration` (advancedRAGPipeline.ts:1644-1649) through `RagRouterResult` (ragRouter.ts:112-118).
   - Set `servedModelVerified` per item with `servedModelMatches`.
   - `PqRagResult` has no judge fields yet. Add `judgeModel` and `judgeVerified` when the phase lands, and treat an unverified judge like an unverified generator.
5. **`basic` strategy for the PQ.** `regulatory_qa` defaults to `strategy: 'advanced'`, `useReranking: true`, `useMmr: true` (ragRouter.ts:146-148), and run-eval passes `useReranking: true` (:105). The PQ run must force `basic` with reranking off (founder decision), or pin HyDE, multi-query and the reranker.
6. **Per-item output in the `PqRagResult` shape**, and fail closed on nothing scored.
   - `hit` is null **only** on a declared control.
   - A positive item that is a grounded refusal, or whose judge failed, must carry an `error` saying so. The verdict treats a positive item with no faithfulness and no error as INCOMPLETE, so a run cannot drop its hardest items by not judging them.
   - Report NOT_EXECUTED on 0 scored items instead of `mean([]) = 0`.
   - Withhold "usable as PQ evidence" when the generator never ran (run-eval.ts:226-230).
7. **The rag phase in run-pq.ts**, after 2-6.
   - It calls the tenant-scoped eval with the evaluation org and writes a `PqRagRecord` with `ran: true`.
   - Then flip `executable`, and update run-pq.test.ts `'on the current draft protocol …'`, which expects rag among the reasons a perfect model is INCOMPLETE.
   - The verdict side is ready. The PASS control in pq-verdict-rag.test.ts shows the shape of a qualifying record.
8. **scripts/ops/ga-readiness-report.mjs** (working-tree line numbers; the file is modified by the gateway lane):
   - :843 gate names: `scheduleCorpusIngestionSweep` → `startCorpusIngestionSchedule`, and `buildIngestionPlan` → `buildCorpusIngestionPlan`.
   - :845: stop offering CT.gov ingestion as the rag unblock. Name `node scripts/verify-rag-corpus.mjs --org-uuid <evaluation org uuid>` as a **non-empty preflight**, not as verification of the corpus.
   - :767-769: fix the comment ("rag's remaining blocker is a corpus that was never ingested").
   - :700-719 repeats verifyPqClaim's rules. Keep it in step if item 10 lands.
   - Likewise server/eval/rag/README.md:77 (their lane) and docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md:151.

## Handed on elsewhere

9. **Corpus track: manifest coverage.**
   - Add `--manifest <guidance-corpus-manifest.json>` to `--org-uuid` mode. It should resolve each manifest document (`document_code` + `version`, or sha256) to a vault document with at least one embedded chunk in that org, and exit 1 naming any that are missing. Until then, exit 0 means non-empty only.
   - Operational: the evaluation org needs the document catalog and `ana.vault_chunking` toggles on (server/services/vault/vault-ingest.service.ts:379-385).
   - Run the preflight as the application's database role. Whether RLS admits the same rows is not tested here.
10. **Governance: record identity. This gap already existed at HEAD; this change does not widen it.**
    - `verifyPqClaim` (pq-verdict.ts) and its copy in ga-readiness-report.mjs do not compare a record's `protocolId`, `protocolVersion` or `protocolSha256` with the repo's approved pq-protocol.json. A hand-written record file can therefore still claim PASS.
    - Recommendation: `verifyPqClaim` takes the approved protocol's identity and refuses a record that does not match it.
11. **Same defect class in generation and extraction, left unchanged to keep parity exact.**
    - `criteriaMissed` and `extractionFindings` skip a missing or non-numeric criterion (`typeof … === 'number'`) and read no unknown keys.
    - Today's protocol has every key, so nothing fails open now. A follow-up should give those components the same criteria check rag now has.

## Lane hygiene

- **Track files: last change before this work, and whose window.**
  - pq-verdict.ts and run-pq.ts: 575cd8323, 2026-09-23.
  - verify-rag-corpus.mjs: 462a6ca7a, 2026-09-05.
  - run-pq.test.ts: **bf8554bde, 2026-09-26**. This is later than the task's "2026-09-23 or earlier" precondition, but it is not in 7cfba3ab6 and is outside any 24h window, so there is no conflict. It is disclosed here.
- **Other sessions' files.** pq-protocol.json, run-eval.ts, rag/README.md, advancedRAGPipeline.ts, ragRouter.ts, aiProviderRouter.ts, ai-gateway/, ana-ri/, client/, docs/adr/ and docs/work-orders/README.md were read only.
  - `scripts/ops/ga-readiness-report.mjs` is modified in the tree by the gateway lane. That change is not part of this work.
  - `../data/` belongs to the gold/manifest lane.
- **Whoever commits** stages exactly:
  - server/eval/pq/pq-verdict.ts
  - server/eval/pq/run-pq.ts
  - server/eval/pq/__tests__/run-pq.test.ts
  - server/eval/pq/__tests__/pq-verdict-rag.test.ts
  - scripts/verify-rag-corpus.mjs
  - tests/ops/verify-rag-corpus.test.mjs
  - tests/ops/helpers/pglite-as-pg.mjs
  - tests/ops/helpers/pglite-as-pg-register.mjs
  - this `code/` folder
- **A transient file from another session.** One mutation run listed `server/eval/pq/__tests__/__eslint_ratchet_prev__.run-pq.test.ts`. That is a temporary copy another session's `ci:eslint-ratchet` writes and removes. It does not affect the kill: the real rag tests failed in that run. The final 31/31 pass ran clean.
