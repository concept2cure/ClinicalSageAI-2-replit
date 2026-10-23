# MR-13 — AI governance to GxP grade: governed model, PQ, grounding, data placement

| | |
|---|---|
| Phase | Phase 0 (stage 1) · Phase 1 (stages 2–6) · Phase 3 (stages 7–9) · Backlog (stage 10) |
| Highest open severity at head | P0 (AI-01) |
| Human testing | Blocks: Authoring AI drafting (editor generate/expand/rewrite, section, IB and CSR generation, AnA "draft and save to Vault/editor") on every `NODE_ENV=production` deployment — AI-01. Degrades: `/readyz` reports ready while drafting is refused (AI-02); "Draft from sources" accepts figures the engine marked not found (AI-05); guidance answers come from model recall (AI-06); DOCX tools fail on a bare `npm run dev` (ARCH-07); the connector docs link has no page (AI-16) |
| Owner | mixed |
| Effort | 2L + 6M + 2S — stages: S + L + L + M + M + M + M + M + M + S |
| Depends on | MR-02, MR-03, MR-05, MR-09, MR-14, MR-16; F-5, F-14, F-15, F-16, F-20, F-25, F-26 |
| Findings | 18 total — open 7 · partially fixed 8 · fixed 3 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **AI-01**: partially fixed (5e8a3cc5f, 8ee5a12dd); for testers it now still stops the journey. Evidence at head: [findings register](MR-findings-2026-10-13.json), `AI-01.recheck`.

## Goal

A pilot customer's regulatory writer drafts a governed section in production on one pinned model that has passed a founder-approved performance qualification against the prompts users actually run, grounded in verified regulatory text and the customer's own Vault. A figure the deterministic check cannot find in the cited source cannot be accepted unedited. Clinical content goes only to a zero-retention placement the tenant elected. Every call is metered, capped and retained per policy. An auditor can trace each of these claims to a test that was shown failing first.

## Why it matters

- **The core Authoring journey is dead in production.** The gateway correctly refuses `document_drafting` without a PQ pass, and no model has one: all 16 `APPROVED_MODELS` entries are `pq.status: 'pending'` and `server/eval/pq/pq-protocol.json` is still a draft with no approver. Every deployed environment runs `NODE_ENV=production`, so the pilot cannot draft.
- **Operators cannot see it.** `/readyz` and the deploy smoke report ready while every draft is refused, which repeats the incident `server/startup/ana-readiness-state.ts:84-95` documents.
- **PQ cannot pass yet even with approval.** The protocol's required RAG component needs a verified, ingested regulatory corpus, and all 24 manifest entries are unverified. The gold bank is 20 provisional retrieval items and 42 lexically scored drafting tasks, and no eval runs in CI.
- **A fabricated figure can enter a governed section.** "Draft from sources" flags a not-found figure and then lets the author accept it with no block and no recorded acknowledgement. GxP buyers test exactly this data-integrity control.
- **Clinical narratives are classified as non-sensitive.** An SAE narrative naming a subject, age, sex and date of death classifies `public`, and PDF or image uploads are dispatched unscreened. The production vendor default and per-org zero-retention election limit exposure, but the screen itself does not work.
- **The DPA and the code disagree.** Moonshot is still a development lane, and the cross-encoder reranker can send tenant text to Cohere or Voyage outside the tenant's election. A DPA reviewer will find both.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| AI-01 | PARTIALLY_FIXED | P0 | blocks | `model-governance.ts:78-86` refuses prod drafting `pq-not-passed`; 0 of 16 entries passed (`approved-models.ts:89…274`); `pq-protocol.json:6-8` draft |
| AI-02 | PARTIALLY_FIXED | P1 | degrades | `ana-readiness-state.ts:243-251` uses `isApprovedForHighRisk` only; deploy smoke `deploy-aws.yml:1059-1061` checks `.ready` |
| AI-03 | FIXED | none | no | `AnaToolExecutor.ts:7711-7771` runs code only via `containerExec.runInContainer` |
| AI-05 | PARTIALLY_FIXED | P1 | degrades | accept handler `authoring.router.ts:4142` never reads the check; ungrounded drafting proceeds at `:3874`, `:3883` |
| AI-06 | STILL_OPEN | P1 | degrades | `data/ich_guidelines/` holds only README; `guidance-corpus-manifest.json` 24 entries all `verified:false` |
| AI-07 | STILL_OPEN | P1 | no | `gold-dataset.json` 20 items, keys provisional; no eval in `.github/workflows`; `c2c-agent.yml:263` cosmetic job |
| AI-08 | PARTIALLY_FIXED | P2 | no | `org-placement.ts:69-117` election closed; Moonshot rows at `gateway.ts:391-419`; `rag-reranker.ts:193-215` bypasses election |
| AI-09 | STILL_OPEN | P1 | no | `heuristic-classifier.ts:33-48` seven regexes; `pii-screen.ts:97-114` skips non-text blocks |
| AI-10 | PARTIALLY_FIXED | P2 | no | `policy.ts:259` per-process Map; no token/cost cap; `enforceWeeklyLimit.ts:113-122` fails open |
| AI-11 | FIXED | none | no | `platform-integration-owner.ts:29-47` gates mailbox and calendar to one org |
| AI-12 | STILL_OPEN | P2 | no | `check-gateway-bypass.mjs:82` requires a non-alphanumeric before `/v1/` |
| AI-14 | STILL_OPEN | P2 | no | `approved-models.ts:153,177,189,201` pins `gpt-4o`, `kimi-k2-0711-preview`, `moonshot-v1-*` |
| AI-15 | STILL_OPEN | P2 | no | no retention job for `chat_messages`, `ai_generation_runs`, `ai.gateway_audit_log`; that table has no RLS |
| AI-16 | PARTIALLY_FIXED | P3 | degrades | `server/mcp/config.ts:140` `docsUrl /concept2cure/connector` has no client route; no privacy or support URL |
| AI-17 | PARTIALLY_FIXED | P3 | no | `gateway.ts:2254-2258` `Promise.race` timeout does not abort the request |
| ARCH-07 | PARTIALLY_FIXED | P3 | degrades | no runtime probe in `/readyz`; `run_python_script` offered where it cannot run; `.env.example:616` defaults exec on |
| SEC-20 | FIXED | none | no | same fix as AI-03 |
| SEC-22 | STILL_OPEN | P2 | no | `scripts/ci/gateway-bypass-baseline.json` still has 8 entries |

## Already done at head — do not redo

- **PQ enforcement in the gateway (AI-01, safety half).** `e2258d07a`: `server/services/ai-gateway/model-governance.ts:78-86,157-189` `selectionRefusal`, `approved-models.ts:382-386` `isQualifiedForHighRiskDrafting`, wired at `gateway.ts:3292-3316`; AnA governed writes gated at `AnaToolExecutor.ts:507`. There is no bypass and none may be added.
- **Anthropic drafting key in the deploy (AI-02, pilot half).** `c3e9e4930`: `terraform/stack/main.tf:125-128,190-194,326`, `variables.tf:351-358`, `deploy-aws.yml:517,541`. `25294ca56`: `no_high_risk_model` readiness state at `ana-readiness-state.ts:227-300`.
- **Model-written code off the API host (AI-03, SEC-20, ARCH-07 core).** `930fe7b4c` deleted `workers/artifact-compute/python-script-runtime.py`; `run_python_script` runs only in `containerExec.ts:75-86` (`--network none`, `--cap-drop ALL`, `--read-only`) and refuses when not enabled. `2eda0ed0f` ships and build-probes the DOCX runtime in `Dockerfile.optimized:76-95,172`.
- **Shared Gmail and Calendar gated to one org (AI-11).** `70eeae35d`: `platform-integration-owner.ts:29-54`, `correspondence-search.ts:103-111`, `calendar-event.ts:88-90`, stability calendar push returns `CALENDAR_NOT_YOURS`. Per-tenant connector credentials are decision P-8, not a defect.
- **Production provider election (AI-08, main half).** `d29275b1b`: `org-placement.ts:69-117` defaults to anthropic, bedrock and local; Moonshot never in production; enforced at `gateway.ts:1303,3324,1690,3629,4638`. 27/27 election tests pass.
- **Tenant-attributed metering (AI-10, main half).** `e2258d07a`: `gateway.ts:4180-4186` meters the bound tenant; `policy.ts:108-132` keys the bucket on it; `refuseUnboundInProduction` rejects unbound production calls.
- **Grounding building blocks (AI-05).** `a3775bcef`, `ef70b10f4`: figure-aware `checkAnswer` in `answer-grounding.ts`; `b0038b034`: `draft.check` returned from `authoring.router.ts:4000-4008`; `425d44dd3`: retrieval failure reported, not swallowed.
- **Connector reachability (AI-16, part).** `terraform/stack/main.tf:275` sets `MCP_ENABLED=true`; `server/mcp/index.ts:117` closes dynamic registration when `MCP_CLIENT_REDIRECT_ALLOWLIST` is empty.
- **SDK retries (AI-17, part).** Clients built with `maxRetries: 0` (`gateway.ts:4343,4354,4368`).

## Work, in order

Stages 2, 5 and 6 have no dependency on each other and can start on day one in parallel. Stage 4 is the gate that turns production drafting on, and it needs stages 2 and 3.

### Stage 1 — Decisions, a working tester path and interim data controls (Phase 0 · S · mixed) — closes none; starts AI-01, AI-06, AI-07, AI-09

1. Re-confirm AI-01, AI-06, AI-07, AI-09 at the current head (statuses here are from 94b4f9238).
2. Founder records F-15: system owner for PQ-DRAFT-001, the contract regulatory writer who authors the gold bank, and the launch document types the doc-quality bank covers (for example IND Module 2 summaries, small-molecule Module 3 sections within the boundary in `shared/constants/launch-scope.ts`, QMS SOPs).
3. Founder records F-16 (publisher reuse terms in `server/eval/rag/guidance-corpus-manifest.json` `publishers.<publisher>.terms`, `termsUrl`, `termsVerified`; at least ICH and EMA) and F-5 (primary provider, zero-data-retention terms, keep or delete Moonshot). Provide a machine whose egress reaches `database.ich.org`, `www.fda.gov`, `www.govinfo.gov`, `eur-lex.europa.eu` and `www.ema.europa.eu`.
4. Interim placement for the pilot org (AI-09 step 8): set its `ai_placement_policies` row to `zero_data_retention=true`, and set `AI_PROVIDER_PLACEMENT_APPROVALS` so only a contracted ZDR Anthropic or Bedrock lane carries `zeroRetentionApproved`. `gateway.ts:4693-4705` `requestPlacementDenial` then enforces ZDR on every call regardless of class.
5. Publish the tester path in the pilot test plan: exercise AI drafting on an `npm run dev` instance (`NODE_ENV=development`) with `ANTHROPIC_API_KEY` set, where a PQ-pending approved model serves and the ledger records `pq_status 'pending'`; never upload real patient-identifying data on local or staging; do not set `KIMI_API_KEY`, `MOONSHOT_API_KEY` or `RAG_RERANKER_*` on any instance holding pilot documents; for DOCX tools on bare dev, `python3 -m venv .docx && .docx/bin/pip install python-docx==1.2.0 lxml==6.1.1` and set `ANA_DOCX_PYTHON=$PWD/.docx/bin/python`.
6. Correct the stale comments at `server/services/ai-gateway/effort.ts:156` and `:207` (they say the PQ clause is "enforced nowhere yet") to point at `model-governance.ts` `selectionRefusal`.

**Acceptance**
- F-5, F-15 and F-16 are recorded with names and dates in the decisions register.
- Failing first: before step 4, a request from the pilot org to a placement without `zeroRetentionApproved` is served; after it, the same request is refused by `requestPlacementDenial` and nothing is dispatched (gateway test using `governedGateway()`/`stubDispatch` from `governance-review.test.ts`).
- A tester following the published path completes "Draft from sources" on a dev instance.
- No environment variable or request field skips `pq-not-passed` in production (`model-governance.ts:20-23`).

### Stage 2 — A verified regulatory corpus (Phase 1 · L · mixed) — closes AI-06

1. Re-confirm AI-06 at the current head (statuses here are from 94b4f9238).
2. Failing first: run `node scripts/verify-rag-corpus.mjs --org-uuid <eval-org-uuid>` against an empty evaluation org and capture the non-zero exit; capture a `run-eval` item with a tampered sha256 reported INCOMPLETE.
3. On the egress machine from stage 1, follow the manifest's `verifyProcedure` steps 1–6 for all 24 entries: record `sourceUrl`, sha256 of the downloaded bytes, `retrievedAt`, byte size and date; set `versionVerified` and `verified` to true. Re-pin US-CFR to the latest govinfo annual edition and change any re-pinned key in `server/eval/rag/gold-dataset.json` in the same commit. Store files outside git where terms forbid redistribution, and record the path.
4. Evaluation corpus: create one dedicated evaluation organisation and programme. Ingest each verified file through the manifest's admission path (`server/routes/vault-ingest.ts` → `ingestVaultDocument` → `vault.document_chunks`). `verify-rag-corpus.mjs` must exit 0 and report 24 documents, and every `vault.documents.content_hash` must equal the manifest sha256.
5. Pilot-tenant corpus: write `scripts/corpus/seed-regulatory-corpus.mjs` taking `--org-uuid` and `--program-id`. It reads the manifest, refuses any entry with `verified:false` or a sha256 mismatch, and ingests through the same `ingestVaultDocument` path, idempotent on (programme, document_code, version). Data stays organisation-scoped under existing RLS; add no shared cross-tenant table. If a later design needs a table, it goes in `public` with `organization_id INTEGER NOT NULL`, listed in `C2C_MIGRATION_FILES` before the final RLS sweep pair, with `npm run ci:migration-set-order` and `ci:migration-drop-safety` run (Rule 1).
6. Currency: add `server/jobs/regulatoryCorpusStalenessSweep.ts`, registered next to `server/jobs/corpusIngestionSweep.ts`. It re-fetches each verified entry's `sourceUrl` HEAD and listing page on a schedule, compares date and sha256, and marks the entry stale when either changed or the check could not run (fail closed). AnA's guidance tools say "stale" or "unverified" for that document. Unit test red first with a mocked changed hash.
7. Search: change `fetchFdaGuidanceList` in `server/services/regulatory-currency/guidance-ingestion-service.ts` to search the org's ingested corpus and return `document_code`, version and effective date. Keep `{status:'unavailable', reason:'no_guidance_index'}` when the org has no corpus. Test both branches.

**Acceptance**
- Every answer-source entry in `guidance-corpus-manifest.json` has `verified:true`, a sha256, `sourceUrl` and date; `gold-dataset.json` `keysProvisional` is false.
- `verify-rag-corpus.mjs --org-uuid <eval-org>` exits 0 with at least 24 documents, and the captured pre-ingestion run exited non-zero.
- `run-eval` resolves keys for every positive gold item (hit-rate scores more than 0 items); a tampered `content_hash` makes the run INCOMPLETE.
- For a seeded pilot org, AnA's FDA guidance tool returns a document with version and effective date; for an unseeded org it returns `unavailable`.
- The staleness sweep test flips an entry to stale on a changed hash, and was red before the job existed.

### Stage 3 — Gold bank, fidelity scoring and a prompt-change gate (Phase 1 · L · mixed) — closes AI-07

1. Re-confirm AI-07 at the current head (statuses here are from 94b4f9238).
2. SMEs named under F-15 extend `server/eval/rag/gold-dataset.json` to at least 100 items: at least 50 positive items on FDA, eCFR and ICH questions in pilot scope, each with evidence `{document_code, section, quote}` from the stage 2 verified text, `expectedSourceKeys`, and `expectedAnswerContains` drawn from the quote, plus negative controls.
3. Extend `server/eval/doc-quality/gold-tasks.json` to the F-15 launch document types with at least 10 generation tasks per type, meeting `components.generation.criteria.minTasksPerDocType` in `pq-protocol.json`. In `server/eval/doc-quality/doc-quality-metrics.ts`, add a figure-fidelity score reusing `figuresIn` and `figureHeld` from `server/services/ana/answer-check-figures.ts` against each task's input; fail any generated figure absent from the input. Keep substring coverage as a secondary metric. Unit test red first with a fabricated figure.
4. Offline CI scoring: in `.github/workflows/ci.yml`, add a guardrail step that runs the doc-quality and RAG scorers on committed captured candidates (no provider key). Commit at least one captured candidate per task type.
5. Nightly live eval: add `.github/workflows/ai-eval-nightly.yml` (schedule plus `workflow_dispatch`, ref `concept2cure-v2`). It provisions the eval DB, seeds the evaluation-org corpus (stage 2 step 4), and runs `npm run ai:eval-doc-quality -- --min-coverage 0.85 --min-f1 0.8` and `tsx server/eval/rag/run-eval.ts --org-id … --org-uuid … --program-id …` with a provider-key secret. It fails on any threshold miss or an INCOMPLETE verdict.
6. Prompt-change gate: write `scripts/ci/check-prompt-eval-freshness.mjs` with `scripts/ci/prompt-eval-freshness-baseline.json`, mapping every prompt file under `server/services/ai-gateway/prompts/**` and every inline drafting prompt builder on a launch path (`authoring.router.ts` POST `/sections/:sectionId/ai/draft`; AnA's `draft_authoring_document` prompt) to a sha256 and the eval record (commit and run id) that last passed with that hash. It fails when a hash changes without an updated record. Add `--self-test` (copy a prompt to a temp dir, mutate it, exit non-zero). Add npm scripts `ci:prompt-eval-freshness` and `ci:prompt-eval-freshness:selftest`, and wire both into `.husky/pre-push` and the `ci.yml` guardrails.
7. In `.github/workflows/c2c-agent.yml`, replace the `ai_prompt_eval` job (line 263 onward: `tsc || true` and grep heuristics) with a call to the nightly workflow, or delete it, so no green check implies an eval ran.

**Acceptance**
- `gold-dataset.json` has at least 100 items; every positive item has an evidence quote and resolvable keys.
- Doc-quality has at least 10 generation tasks per agreed type; the figure-fidelity metric fails a candidate with a figure absent from its input, and the test was red before the metric existed.
- The `ci.yml` offline step fails on a corrupted captured candidate (shown once).
- The nightly workflow failed once on a seeded bad candidate before passing.
- `npm run ci:prompt-eval-freshness:selftest` exits non-zero on a mutated prompt, and editing `server/services/ai-gateway/prompts/section-generation/*` without updating the baseline fails pre-push.

### Stage 4 — Pass PQ on the production prompts and make readiness say so (Phase 1 · M · mixed) — closes AI-01; closes the pilot half of AI-02 (steps 1–4 there)

Land the readiness change (steps 7–9) in the same push as the PQ record (step 4). Pushed earlier, it turns every `NODE_ENV=production` environment not-ready and the staging deploy smoke red; if the founder wants that earlier as the true state, tell them before pushing.

1. Re-confirm AI-01 and AI-02 at the current head (statuses here are from 94b4f9238).
2. Bind PQ to the production prompts: extend `server/eval/pq/run-pq.ts` (whose header at `:26-29` says it measures only the harness prompt) so the generation phase also runs the prompt-registry versions used by `server/routes/c2c/ai-editing.ts` and `server/services/authoring/section-generation-service.ts`, and the inline `ai/draft` prompt in `authoring.router.ts`. Write each prompt id and version (or the stage 3 baseline hash) into the `PqRecord`. In `server/eval/pq/pq-verdict.ts` `verifyPqClaim`, refuse a `'passed'` claim whose recorded prompt versions differ from the current ones. Prove it by bumping one prompt version in a scratch change and watching `server/services/ai-gateway/__tests__/high-risk-model-approval.test.ts` fail.
3. Founder (system owner, F-15): after confirming stages 2 and 3 meet the protocol's criteria, set `"status":"approved"`, `"approvedBy"` and `"approvedOn"` in `server/eval/pq/pq-protocol.json` in a reviewed commit on `concept2cure-v2`.
4. Engineering, on a controlled machine with `ANTHROPIC_API_KEY` under the F-5 terms: run `npm run pq:run -- --model claude-opus-4` (pinned `claude-opus-5-5`). Only on a PASS verdict, rerun with `--record`; the record lands at `docs/evidence/PQ/<date>/claude-opus-4.json` (or the F-22 artifact store, with its hash in the repo).
5. Failing first on the claim: in `server/services/ai-governance/approved-models.ts:89`, temporarily set the `claude-opus-4` entry to `pq {status:'passed', reference:'docs/evidence/PQ/does-not-exist.json'}` and confirm `high-risk-model-approval.test.ts` fails in `verifyPqClaim`. Set `reference` to the real record and confirm it passes. Commit only the real reference.
6. Close the task-label gap: inventory governed-text authors that call the gateway with a `taskType` other than `'document_drafting'`, starting from the known-gaps list at `model-governance.ts:25-30` and `grep -rn "callerModule" server/services/cmc server/services/authoring`. Relabel each to `'document_drafting'` or route its persistence through the `AnaToolExecutor.ts:507` gate. The CMC / Module 3 composition path is in the launch catalog: govern it, do not fence it.
7. Readiness on one rule: in `server/startup/ana-readiness-state.ts` `recordHighRiskCoverage` (`:227-300`), replace the local `serves` predicate (`:250-251`) for each task in `HIGH_RISK_TASK_TYPES` with `m.capabilities.includes(task) && selectionRefusal(m, { taskType: task }, selectionGovernance()) === null`, imported from `model-governance.ts`. Apply the same predicate to the startup invariant at `server/lib/startup-invariants.ts:116-127`.
8. Add readiness state `'no_pq_qualified_model'`: its detail embeds `NO_PQ_QUALIFIED_MODEL` and lists each approved model with its pq status; `isAnaReadinessServing` treats it as not serving, as it treats `'no_high_risk_model'`. `inline-endpoints.ts:82-83` then reports `deps.ana 'down'`. Write the test first, next to the existing `ana-readiness-state` tests: `NODE_ENV=production`, a gateway stub exposing `claude-opus-4` enabled, and a registry stub whose entries are all `'pending'` (stub the registry, since the real one will carry a pass after step 5). It returns `'ready'` at HEAD.
9. Deploy preflight: in `.github/workflows/deploy-aws.yml`, next to the `ANTHROPIC_API_KEY` preflight (`:517-541`), add a step: `npx tsx -e "import {APPROVED_MODELS,isQualifiedForHighRiskDrafting} from './server/services/ai-governance/approved-models.ts'; if(!APPROVED_MODELS.some(m=>m.provider==='anthropic'&&isQualifiedForHighRiskDrafting(m,true))){console.error('no PQ-passed Anthropic drafting model');process.exit(1)}"`. Dry-run it on HEAD's registry and capture exit 1.

**Acceptance**
- Failing first: on HEAD, `selectionRefusal({id:'claude-opus-4',provider:'anthropic',model:'claude-opus-5-5'}, {taskType:'document_drafting'}, selectionGovernance(APPROVED_MODELS,{NODE_ENV:'production'}))` returns `'pq-not-passed'`; after step 5 it returns null, and every other entry still returns `'pq-not-passed'`.
- `high-risk-model-approval.test.ts` fails for a `'passed'` entry with a missing or mismatched record, or with a changed production prompt version, and passes with the real record.
- `pq-protocol.json` has `status 'approved'`, a named approver and a date.
- With `NODE_ENV=production` and a key, an Authoring AI action through `server/routes/c2c/ai-editing.ts` returns a draft whose ledger row (`audit.ts`) records `claude-opus-5-5` and `pq_status 'passed'`; against a registry where the entry is `'pending'` it returns `NO_PQ_QUALIFIED_MODEL`.
- The readiness test returns `'no_pq_qualified_model'` and `/readyz` `ready:false` with `deps.ana 'down'` for production plus PQ-pending models (red at HEAD); development, or a PQ-passed entry, returns `'ready'`.
- The deploy preflight exits 1 on HEAD's registry and 0 with the passed entry.

### Stage 5 — Grounding that blocks, not advises (Phase 1 · M · engineering) — closes AI-05

Buildable now; observable in production only after stage 4. Coordinate with MR-09 (Vault-grounded drafting) so there is one grounding check, `checkAnswer` in `server/services/ana/answer-grounding.ts`.

1. Re-confirm AI-05 at the current head (statuses here are from 94b4f9238).
2. Failing-first tests, recorded red:
   - In `server/routes/__tests__/authoringAiDraftAccept.test.ts` (or a sibling), park a draft candidate whose content says "response rate was 45% (n=120)" while its parked source chunk says "31% (n=120)"; assert POST `/sections/:id/ai/draft/accept` returns 409 `UNSUPPORTED_FIGURES` and `authoring_sections.content` is unchanged.
   - Mock retrieval to return zero hits, then to throw, and assert POST `/sections/:sectionId/ai/draft` does not call `gw.route`.
   - A unit test where a figure exists only in SRC-2 but is attributed to SRC-1, asserting `notFound`.
3. Block at accept: in `server/routes/authoring.router.ts`, accept handler at line 4142, after `consumeDraftCandidate` inside the transaction, build `EvidenceEntry[]` from the candidate's parked sources (`{source:'context', content}`) and run `checkAnswer(generatedDraft, entries)`. For each figure in `check.notFound` (and each in `check.unchecked` when the draft had no sources), find its sentence in the generated draft (reuse `splitSentences` or the splitter in `answer-check-sources.ts`). If that sentence still appears verbatim in `acceptedContent`, ROLLBACK and return 409 `{code:'UNSUPPORTED_FIGURES', figures:[...]}`. Sentences the author edited are the author's own words and pass. Record the figure list and `ANSWER_CHECK_VERSION` on the existing accept audit entry whatever the outcome.
4. Client: in `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx`, render the 409 as a calm, factual refusal naming the figures and keep the draft in the buffer for editing. Update the `DraftCheck` copy (lines 283-297) to say accept is refused while a not-found figure stays unedited. Add a client test. Follow the regulatory-compliance-ux and microcopy-tone patterns.
5. Refuse ungrounded drafting: in POST `/sections/:sectionId/ai/draft` (`authoring.router.ts:3785`), return 422 `{code:'NO_EVIDENCE'}` when `retrievalStatus` is `'empty'` (`:3874`) and 503 `{code:'RETRIEVAL_FAILED'}` when `'failed'` (`:3883`), before `gw.route`. File the turn with `fileFailedDraftTurn` in both cases.
6. Per-citation check: extend `checkAnswer`, or wrap it in `server/services/ana/turn-record-draft.ts`, so a figure in a sentence the model attributed (the `modelAttributions` quote and src from `parseDraftEnvelope`) must be found in that src's chunk, not any shown chunk.
7. Legacy routes `/api/concept2cure/ai/edit-section` (`server/routes/c2c/ai-editing.ts:122`) and `/ai/templates/:templateId/generate` (`:1048`): run `git log --all --diff-filter=D -- 'client/**/*Editor*' 'client/**/*Canvas*'` and grep `client/` for `concept2cure/ai`. If nothing calls them, delete both handlers and their tests; the commit message names the replacement, POST `/api/authoring/sections/:sectionId/ai/draft` (`client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx`, reached from `editor/DocumentWorkbench.tsx:84`), and the reachability test `client/src/concept2cure/v2/__tests__/authoringAiDraft.test.tsx`. If a caller exists instead: move `evidenceBlock` out of `systemPrompt` (`:350-369`) into a delimited user message ahead of `data.text`; replace `:452-454` so a sentence is SUPPORTED only when it cites a valid SRC and every figure in it is found in that chunk, WEAK when it cites but a figure is not found, UNSUPPORTED otherwise; return 422 when `retrievalStatus !== 'ok'` for the expand and add-references actions. Stage 4 step 2 must then still cover whichever path survives.
8. Accept-time proxy: in `server/services/ai-governance/groundedness.ts`, make `resolveGroundedness` prefer a supplied answer-check result so `review-policy.ts` `evaluateAcceptGate` blocks when `notFound > 0`. Keep citation coverage only as a recorded signal.
9. Run the touched test files individually. Show step 2's accept test green, revert the guard locally to show it red again, and record both outputs in the commit message.

**Acceptance**
- An unedited sentence with "45%" against a "31%" source returns 409 `UNSUPPORTED_FIGURES` and leaves the section unchanged; the same draft with that sentence edited accepts. Red at HEAD.
- Zero retrieval hits returns 422 `NO_EVIDENCE`; a throwing retrieval returns 503 `RETRIEVAL_FAILED`; `gw.route` is not called in either case.
- A figure attributed to SRC-1 that exists only in SRC-2 is reported `notFound`.
- Either `/api/concept2cure/ai/edit-section` returns 404 with a commit message naming the replacement and test, or a persisted `ai_claims` row for a cited sentence with a mismatched figure is not `'SUPPORTED'`.
- The client test shows the refusal copy and the draft retained in the buffer.

### Stage 6 — A PHI screen that sees clinical content and media (Phase 1 · M · mixed) — closes AI-09

1. Re-confirm AI-09 at the current head (statuses here are from 94b4f9238).
2. Failing-first tests, confirmed red at HEAD:
   - `server/services/ai-governance/classification/__tests__/clinical-narrative.test.ts`: `HeuristicContentClassifier.classify()` returns `phi:true` for "Subject 1001-023 … 54-year-old female … serious adverse event … hospitalized … died on 12 March 2026", "Patient 0042 (initials J.D.)" and "randomization number R-10234"; negative controls ("Study 1001 enrolled 240 subjects", plain ICH prose) stay `phi:false`.
   - A gateway test next to `server/services/ai-gateway/__tests__/governance-review.test.ts`, using `governedGateway()`/`stubDispatch`, with `NODE_ENV=production` and `AI_SENSITIVE_DATA_POLICY_MODE=enforce`: an image-only or base64 `application/pdf` request to a provider whose `AI_PROVIDER_PLACEMENT_APPROVALS` entry lacks `zeroRetentionApproved` rejects with `GatewayPolicyError` and dispatches nothing.
3. In `server/services/ai-governance/classification/heuristic-classifier.ts` `DETECTORS` (lines 33-48), add phi-class detectors, each anchored to a label: subject, patient, participant and randomisation identifiers (for example `/\b(?:subject|patient|participant|pt|screening|randomi[sz]ation)\s*(?:id|no\.?|number|#)?\s*[:#]?\s*[A-Z]{0,3}\d{3,}(?:[-/]\d+)*\b/i`), demographic narrative (`\d{1,3}-year-old (?:male|female|man|woman|boy|girl)`), and labelled dates of death, admission or hospitalisation. Update the module header to say what is covered.
4. In `server/services/ai-gateway/pii-screen.ts` `extractRequestText` (lines 102-114), decode base64 document blocks with `media_type text/plain` and include their text. Export `requestCarriesUnscreenedMedia(request)`, true for image blocks, PDF/base64 document blocks, Files-API file blocks and `request.imageContent`. Move the media test out of `gateway.ts` `ledgerDataClass` (`:4836-4843`) into it and have `ledgerDataClass` call it — one implementation.
5. In `gateway.ts` `route()` classification (`:1398-1413`) and the embedding path (`:1668-1682`): when the text result is `'none'` and `requestCarriesUnscreenedMedia(request)` is true, set `sensitiveDataClass` to `'phi'` and record basis `'unscreened_media'` on the request and the ledger row, so `decideSensitivePlacement` (`sensitive-placement-policy.ts:47-`) requires a zero-retention-approved placement. Do not map it to `'unknown'`; that is `DENY_DETECTOR_FAILURE` and misreports the reason.
6. Clinical-document floor: when `payloadProvenance` is `'tenant_governed'` and the `callerModule`/`taskType` is a clinical drafting or analysis task (`document_analysis`, section generation, AnA attachment intake in `server/routes/ana-ri/stream.ts:1628-1675`, `AnaDocumentDraftingService.ts:900-935` `analyzeImage`), raise `'none'` to `'phi'`. Keep the list as an explicit const in `pii-screen.ts` with a comment naming each entry.
7. In `server/startup/ai-governance-posture.ts`, refuse production boot when `AI_CLASSIFIER_MODE=slm`, because `slm-classifier.ts:52-55` silently uses the heuristic even with a URL set. Keep `slm` documented as not implemented.
8. Re-run the step 2 tests green, plus `tenant-capacity.test.ts` and the existing classification tests.
9. When this lands, the stage 1 interim pilot-org ZDR setting stays; record in the DPA (MR-16) what the screen does and does not detect.

**Acceptance**
- The classifier test is red at HEAD and green after; the SAE narrative, subject ID and randomisation examples are `phi:true`, regulatory prose stays `public`.
- In production plus enforce, an image-only or PDF-only request to a provider without zero-retention approval rejects with `GatewayPolicyError` and nothing is dispatched; the same request to a ZDR-approved provider is served and its ledger row shows class `phi` with basis `unscreened_media`. Red at HEAD.
- A `text/plain` attachment containing "MRN: 12345678" classifies `phi`.
- Production boot refuses `AI_CLASSIFIER_MODE=slm`.

### Stage 7 — One egress door: Moonshot, reranker, bypass gate, pins (Phase 3 · M · mixed) — closes AI-08, AI-12, AI-14, SEC-22; closes the remainder of AI-02 (Bedrock/Vertex, residency)

1. Re-confirm AI-08, AI-12, AI-14, SEC-22 and AI-02 at the current head (statuses here are from 94b4f9238).
2. Moonshot (F-5; deletion recommended so code matches the DPA): remove the `kimi-k2-0711`, `moonshot-v1-128k` and `moonshot-v1-32k` rows from `server/services/ai-gateway/gateway.ts` (`:391-430`) and `server/services/ai-governance/approved-models.ts` (`:176-209`); remove `'moonshot'` from `TASK_PROVIDER_PREFERENCES` (`gateway.ts:437-446`), `executeMoonshot` (`:2936`), the `moonshotClient` init (`:1293`), `PLACEMENT_PROVIDERS` and `NEVER_IN_PRODUCTION_PROVIDERS` (`org-placement.ts`), `VALID_PROVIDERS` (`org-placement-db.ts`) and the `effort.ts` labels (`:232-234`). This is not a user-facing capability; say so in the commit. Update both election tests to assert `moonshot` is absent from `getModels()` in every environment. If the founder keeps it instead, record that in ADR-0014 and list Moonshot as never-production in the DPA.
3. Pins (AI-14): replace the floating `pinnedVersion` aliases at `approved-models.ts:153` (`gpt-4o`, and `gpt-4o-mini` wherever it appears) with dated snapshot ids or remove those entries. First extend `approved-models-invariant.test.ts` to reject undated pins and show it failing on `gpt-4o`.
4. Bedrock and Vertex (AI-02 step 5): until `@anthropic-ai/bedrock-sdk` or the Vertex SDK is a dependency and an IAM or inference-profile path exists in `terraform/stack`, set `approvedForHighRisk:false` on `claude-opus-4-bedrock` and `claude-opus-4-vertex` (`approved-models.ts:217-248`) with the reason in `highRiskBasis` and `lastReviewed`. When F-5 adopts one, bump `server/services/ai-gateway/providers/cloud-models.ts:49-87` (pins, prices, `contextWindow`) to the current Opus pin and update the matching approved entries so the drift gate passes. Run `node scripts/ci/check-model-migration-agreement.mjs`, `node scripts/ci/check-unapproved-model-pins.mjs` and the approved-models drift tests.
5. Residency (AI-02 step 6, F-25): confirm in current Anthropic API documentation whether a data-residency or inference-geography request parameter exists. If it does, send it from the Anthropic provider when the tenant placement policy requires US-only processing and record it in the ledger row.
6. Reranker under the election (AI-08 step 3): in `server/services/rag-reranker.ts` `getReranker` (`:268`), when `isProductionEnv(env)` and `RAG_RERANKER_PROVIDER` is cohere or voyage without a self-hosted `RAG_RERANKER_BASE_URL`, do not build `CrossEncoderReranker` unless `RAG_RERANKER_SUBPROCESSOR_ACK` names the provider. Even then, in `CrossEncoderReranker.score` (`:193`), call `providerElectionRefusal` with the bound tenant's election and fall back to `LlmJudgeReranker` (via `gateway.route`) when refused. Test red first: production, `RAG_RERANKER_PROVIDER=cohere`, no acknowledgement, mocked fetch — reranker is the LLM judge and no fetch reaches `api.cohere.com`.
7. Baseline burn-down (SEC-22, AI-08 step 4): for each of the 8 entries in `scripts/ci/gateway-bypass-baseline.json` (`nanoBananaService.ts` image generation, the LiteLLM else-branch, the rerankers, the shared Anthropic and OpenAI client factories, `huggingface-service.ts` `generateEmbeddings`, and the rest), route it through `getGateway()` or delete it. Deleting a reachable user-facing capability needs the replacement named by path (working agreement). An entry that must stay gets a production refusal or a grep-backed reason that no launch-catalog route reaches it, written into its baseline `reason`.
8. Gate blind spots (AI-12): in `scripts/ci/check-gateway-bypass.mjs`, match provider paths regardless of the preceding character (line 82 requires a non-alphanumeric before `/v1/`), extend the host list, flag provider-SDK imports outside `server/services/ai-gateway/`, and count call sites per baselined file so a new call in a baselined file fails. Add each evasion shape to `check-gateway-bypass.selftest.mjs` and show each failing first.
9. Founder and legal (MR-16): publish the sub-processor list as Anthropic and AWS (Bedrock) by default, with OpenAI, Azure and Vertex only on an org's election, matching `PRODUCTION_DEFAULT_PROVIDERS`.

**Acceptance**
- A test asserts no `moonshot` model appears in the gateway registry or `APPROVED_MODELS` in production or development (or ADR-0014 records the keep decision).
- `approved-models-invariant.test.ts` was red on `gpt-4o` and is green with no undated or preview pins.
- The production reranker test shows the LLM judge selected and zero calls to `api.cohere.com`, red before the change.
- The bypass selftest catches every added evasion shape, each shown failing first; the baseline is smaller than 8 entries and every remaining entry has a written reason.
- `production-provider-election.test.ts` and `org-placement-election.test.ts` stay at 27/27 or more; the drift gate passes after the Bedrock/Vertex change.
- The published sub-processor list matches `PRODUCTION_DEFAULT_PROVIDERS`.

### Stage 8 — Spend control and real timeouts (Phase 3 · M · mixed) — closes AI-10, AI-17

1. Re-confirm AI-10 and AI-17 at the current head (statuses here are from 94b4f9238).
2. Failing-first tests, red at HEAD: `server/services/ai-gateway/__tests__/org-cost-cap.test.ts` — with a `weekly_usage_limits` row `{metric:'cost_cents', weeklyLimit:100, overageCapPct:0, enabled:true}` for org 7 and `api_usage_logs` at 100 cents, `gateway.route()` under `inTenant('7')` rejects before dispatch (`stubDispatch` records no call), and in production still rejects when the limits query throws. A second test: two `GatewayPolicyEngine` instances sharing one store share one org bucket.
3. Cap inside the gateway, not in route middleware: in `gateway.ts` `route()`, after `applyOrgPlacementDefaults`/`refuseUnboundInProduction` (around `:1394`) and before `policyEngine.evaluate`, call `checkWeeklyLimit(orgId, 'cost_cents', 0)` and `checkWeeklyLimit(orgId, 'tokens', 0)` (`server/services/weekly-usage-limits.ts:254`) for `auditOrganizationId`. If not allowed, throw a new terminal `QuotaExceededError` (subclass of `GatewayPolicyError`) and write a refusal ledger row via `logRefusalRow`. If the check throws, fail closed in production (`isProductionEnv`), open elsewhere. Add the same check to the embedding path (around `:1666`).
4. Per-plan defaults (founder numbers, see decisions): seed default `cost_cents` and `tokens` rows per plan through a migration in `C2C_MIGRATION_FILES` using `INSERT … ON CONFLICT DO NOTHING` with a row-count assertion (Rule 1), or resolve defaults in code from the org's plan when no row exists. An org with no row still gets a ceiling in production.
5. Shared rate buckets: either provision ElastiCache in `terraform/stack` and back `checkRateLimit` (`policy.ts:541-580`) with `INCR`+`PEXPIRE` on `ai:rl:{rateBucketKey}:{floor(now/60000)}`, or divide `maxRequestsPerMinutePerOrg` (`gateway.ts:4311`) by an `AI_RATE_LIMIT_INSTANCE_COUNT` env set from `var.api_desired_count` in `terraform/stack/main.tf` and document that it is approximate. Keep the in-memory Map (`policy.ts:259`) only outside production. Coordinate the infrastructure with MR-03.
6. In `server/bootstrap/register-ai-routes.ts:24` pass `{ failClosed: process.env.NODE_ENV === 'production' }` to `enforceWeeklyLimit('requests')`. Step 3 covers every other gateway caller (editor AI, MCP, jobs) centrally; add no per-route middleware elsewhere.
7. Timeouts (AI-17): replace the `Promise.race` timers in `gateway.ts` (`:2254-2258` and the other provider paths) with an `AbortController` signal (`AbortSignal.any([request.signal, AbortSignal.timeout(120000)])`) passed to the SDK call, and set an explicit `timeout` on the clients built at `:4343,4354,4368`. Test red first: a stubbed provider that never resolves receives an abort at the timeout.
8. Re-run `tenant-capacity.test.ts`, `governance-review.test.ts` and the new tests.

**Acceptance**
- `org-cost-cap.test.ts` is red at HEAD and green after: an org over its `cost_cents` or `tokens` cap is refused before dispatch, a ledger row records the refusal, and production fails closed when the lookup errors.
- Two policy-engine instances share one org bucket: the 101st call across both is refused.
- An org with no configured row gets the plan default ceiling in production.
- A timed-out provider call is aborted, not left running (test red first).
- `tenant-capacity.test.ts` and `governance-review.test.ts` still pass.

### Stage 9 — Retention and tenant isolation for AI records (Phase 3 · M · mixed) — closes AI-15

1. Re-confirm AI-15 at the current head (statuses here are from 94b4f9238).
2. Founder sets retention periods for prompts, completions, chat and the gateway ledger (see decisions), reconciled with Part 11 audit-trail retention in MR-06: ledger rows that evidence a governed record are kept for that record's life.
3. RLS: `ai.gateway_audit_log` (created by `20260813_ai_gateway_audit_log.sql`) holds user and organisation ids in the non-public `ai` schema with no RLS. Bring it under the tenant sweep by adding it to the hand-maintained non-public RLS list, or by amending the creating migration in place with a dated header note saying what changed and which commit changed it. Do not append a separate ALTER or DROP file (Rule 1). Coordinate with MR-05, which owns the sweeps. Test red first: a session bound to org A cannot read org B's ledger rows.
4. Add scheduled retention jobs for `chat_messages`, `ai_generation_runs` and `ai.gateway_audit_log`, registered beside `retentionCron.ts` (which covers `vault.documents` only). Each job deletes or archives by the founder's periods, writes an audit entry of what it removed, and has a unit test that is red before the job exists.

**Acceptance**
- The cross-tenant read test on `ai.gateway_audit_log` is red at HEAD and green after; `ci:migration-drop-safety` and `ci:migration-set-order` pass.
- Each retention job's test shows rows older than the period removed and newer rows kept, and was red first.
- The retention periods are recorded with the founder's decision date.

### Stage 10 — Runtime residuals and the connector directory package (Backlog · S · mixed) — closes ARCH-07, AI-16

1. Re-confirm ARCH-07 and AI-16 at the current head (statuses here are from 94b4f9238).
2. Tool surface (F-14; MR-14's ARCH-03 production allowlist subsumes this step if it lands first): in `server/services/ana/AnaToolDefinitions.ts` `getAllEnabledTools()` (~`:2888`), filter out `run_python_script` and `run_in_container` when `getContainerExecConfig().enabled` is false (`server/services/compute/containerExec.ts:44`). Keep the handler refusals (`AnaToolExecutor.ts:7730-7739`, ~`:8156-8165`) as the backstop. Change `.env.example:616` to `ANA_ENABLE_CONTAINER_EXEC=false` with a note that ECS Fargate has no Docker daemon. If F-14 keeps code execution in scope, it needs a funded isolated execution service, not the API task. Unit test red first: with the flag unset, neither tool is in `getAllEnabledTools()`; with it set, both are.
3. Runtime probe: add `server/startup/document-runtime-probe.ts`, called from `server/startup/services.ts`. It runs `${ANA_DOCX_PYTHON || 'python3'} workers/artifact-compute/docx-validate-runtime.py` on a fixture `.docx` under `workers/artifact-compute/fixtures/` through `runPythonRuntime` in `server/services/compute/scriptWorker.ts`, and records `'ok' | 'down' | 'unknown'`. Add `deps.documentRuntime` to `/readyz` in `server/startup/inline-endpoints.ts` (`:50-180`), failing closed on `'unknown'` and `'down'` in production. Test red first: with `ANA_DOCX_PYTHON=/bin/false`, `/readyz` returns 503.
4. In `server/services/unifiedDocumentIngestion.js:91-140`, replace the `.venv/bin/python3` plus `ingestion/pdf_extractor.py` fallback with `{ success: false, strategy: 'none', warnings: ['PDF text extraction service is not available in this deployment'] }` and spawn nothing, which also removes the `...process.env` pass-through. It is reachable only via `/api/knowledge-base` (`server/routes/knowledge-base.ts:1671`), which no `client/src` file calls; name the Vault's canonical PDF text-extraction path in the commit message.
5. Fix `server/requirements.txt`: point it at `-r ../requirements.txt`, or delete it after `git grep -n 'server/requirements.txt'` shows no reader.
6. Connector package (AI-16, F-26): add a public client route for `/concept2cure/connector` (connector documentation) plus privacy-policy and support URLs, and reference them from `server/mcp/config.ts` (`docsUrl` at `:140`). Add a test that fails when the `docsUrl` path has no client route; show it failing at HEAD.

**Acceptance**
- `/readyz` is red with `ANA_DOCX_PYTHON=/bin/false` and green with the image virtualenv; the CI Production Image Boot job sees `dependencies.documentRuntime === 'ok'`.
- With `ANA_ENABLE_CONTAINER_EXEC` unset, `getAllEnabledTools()` contains neither code-execution tool (shown failing first).
- `unifiedDocumentIngestion.js` no longer references `.venv/bin/python3` or `ingestion/pdf_extractor.py`.
- `pip install -r server/requirements.txt --dry-run` resolves, or the file is gone.
- The connector docs, privacy and support URLs resolve, and the route test was red at HEAD.

## Definition of done

- In production, a PQ-passed, pinned Anthropic model serves Authoring drafting under an approved PQ-DRAFT-001 whose record covers the current production prompt versions, and a prompt change without a new eval fails pre-push.
- `/readyz`, the startup invariant and the deploy preflight use the same rule as the gateway: they report not-ready exactly when drafting would be refused.
- A verified, hashed regulatory corpus is ingested for the evaluation org and seedable per pilot tenant, with a fail-closed staleness sweep, and the RAG and doc-quality evals run offline in CI and live nightly.
- An unedited sentence with a figure not found in its cited source cannot be accepted, and drafting with empty or failed retrieval is refused.
- Clinical narratives and media are classed PHI-possible and reach only zero-retention-approved placements; every tenant-text egress goes through the gateway election or is refused in production; spend is capped per org.
- Every finding in this order is FIXED in `docs/work-orders/MR-findings-2026-10-13.json`, each with its closing commit and failing-first evidence under `docs/evidence/MR-13/`.

## Founder decisions this order needs

- **F-15** — approve PQ-DRAFT-001, name the system owner and the gold-bank author, and agree the launch document types. Blocks stages 3 and 4.
- **F-16** — corpus licensing per publisher, plus an egress-capable machine. Blocks stage 2.
- **F-5** — primary provider and zero-retention terms, Bedrock or direct, and whether Moonshot is deleted. Blocks stage 1 step 4, stage 4 step 4 and stage 7.
- **F-14** — whether model-authored code execution exists in production. Blocks stage 10 step 2.
- **F-25** — residency beyond `us-east-1` and BAA posture for PHI. Blocks stage 7 step 5 and the DPA wording for stage 6.
- **F-26** — Connectors Directory submission. Blocks stage 10 step 6.
- **F-20, extended (NEW)** — per-plan AI token and cost ceilings, so an org with no configured limit still has one. Blocks stage 8 step 4.
- **NEW** — retention periods for prompts, completions, chat messages and the gateway ledger, and whether any customer requires no prompt storage at all. Blocks stage 9.

## Do not

- Do not add an environment variable, header, request field or tenant flag that skips `pq-not-passed` in production, and do not lower PQ thresholds or mark the protocol approved to get the pilot drafting. Testers use a development instance (stage 1).
- Do not push the readiness change (stage 4 steps 7–9) on its own without telling the founder: it turns staging red until a PQ pass is recorded.
- Do not build a second grounding or figure check alongside `checkAnswer`, or enforce the accept block only in `AuthoringAiDraft.tsx`; the server refuses, the client explains. Coordinate with MR-09 rather than duplicating.
- Do not delete `/api/concept2cure/ai/edit-section`, the knowledge-base PDF fallback or a bypass-baseline entry without the working-agreement history search and the replacement named by path in the commit.
- Do not fence or relabel the CMC / Module 3 composition path or Reporting & analytics as out of scope when inventorying governed-text callers or gold-bank document types; both are in the launch catalog, and the boundary is `shared/constants/launch-scope.ts`.
- Do not add RLS or retention to `ai.gateway_audit_log` by appending a DROP or ALTER file to the migration set, and do not seed plan limits from a `scripts/seed-*.ts`; use the creating migration or a `C2C_MIGRATION_FILES` seed with a row-count assertion (Rule 1).

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-13/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
