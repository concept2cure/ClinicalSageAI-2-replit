# AnA relevant-passage grounding and bounded workflow implementation specification

Read-only design study, 14 October 2026. Inspected `/workspace/Concept2Cure` at `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. No application edits, credentials, provider invocations, dependencies, branches or worktrees. This specification is proposed, not implemented or tested.

The repository's [AGENTS.md](../../../AGENTS.md) requires the canonical `concept2cure-v2` branch, scope ownership rather than branches, interface contracts before implementation, preserved lifecycle/provenance, fail-closed governance and benchmarks before default enablement. The control tower should assign sequential contract owners; this document creates no branch or implementation session.

## Outcome and scope

Allow an AnA section draft to use relevant, complete-context passages anywhere in selected current project documents, including late CSR tables, while preserving exact source coordinates through prompt construction, save-time checks and later export re-verification. Keep the existing Vault index, `ragRouter`, gateway, authoring transactions and run/job mechanisms. Do not create another RAG store or introduce Temporal.

A passage delivery receipt proves which bounded source text was admitted to a model request. It does not prove the model understood it, a scientific claim is supported, a document was reviewed in full, or a draft is approved. Source identity/current availability, model delivery, scientific comparison and approval remain separate recorded facts.

## Observed implementation and precise gap

| Existing surface | Observed behavior | Required extension |
| --- | --- | --- |
| [draft-project-sources.ts](../../../server/services/ana/draft-project-sources.ts:40) | Selected 1–8 UUIDs; open-project/org/current checks; 12,000-char prefix per source and 48,000 total; `completeText` is prefix length equality | Relevant passage selection with exact disjoint ranges, approved context budget and coverage disclosure |
| [draft-source-references.ts](../../../server/services/authoring/draft-source-references.ts:16) | Save parser requires `span.start === 0`, `end <= 12000`; verifier reloads `slice(0,end)` and checks source hash plus total length | Versioned range parser, exact extracted-text binding and per-range rehydration |
| [document-chunking.service.ts](../../../server/services/vault/document-chunking.service.ts:77) | Canonical chunks reproduce exact `text.slice(charStart,charEnd)`; writes char_start/end and page; refuses >500 chunks rather than indexing a prefix | Carry extraction identity and structural anchors on these existing records; preserve safe cap refusal |
| [advancedRAGPipeline.ts](../../../server/services/advancedRAGPipeline.ts:345) | Vault row mapping drops char_start/end and source content hash; keyless lexical and optional dense/hybrid already exist | Propagate identity/ranges through mapping, ranking, revalidation and expansion |
| [document-passage-search.ts](../../../server/services/vault/document-passage-search.ts:293) | Passage hits return `d.content`; expansion sets `expandedContent`, so the adapter does not return the added context | Explicit verified segments; do not relabel concatenated neighbor text as one contiguous source span |
| [read-receipts.ts](../../../server/services/ana/read-receipts.ts:135) | Whole-or-nothing tool results; writes receipts only for unchanged strings admitted by the host budget | Multiple exact ranges per unchanged payload; preserve replacement/cancellation refusal |
| [draft-figure-check.ts](../../../server/services/authoring/draft-figure-check.ts:28) and [section-claims-check.ts](../../../server/services/authoring/section-claims-check.ts:31) | Both explicitly assume excerpt starts at zero; source offsets are local to that excerpt | Map confirmed local positions to absolute source coordinates; never invent offsets across synthesized joins |
| [authoring-from-draft.ts](../../../server/services/authoring/authoring-from-draft.ts:336) | Fresh authoring project access and transactional source checks; figures/claims inspect actual stored sanitized text | Reuse gates with V2 ranges; keep references marked unassessed and current_at_save |
| [run-control.ts](../../../server/services/ana/run-control.ts:131), [run-events.ts](../../../server/services/ana/run-events.ts:122) | Durable run control/status; abort handle + cross-instance notification; timeline batches can be dropped | Critical stage/result checkpoints need authoritative persistence, not timeline events as workflow state |
| [AnaDocumentDraftingService.ts](../../../server/services/ana/AnaDocumentDraftingService.ts:1126) | In-process bounded Promise.allSettled batches; no section checkpoint or signal in this drafting request | Pass cancellation; persist successful bounded stages before continuing; distinguish restartability from today's control durability |

`catalogScope` resolves the open program and organizational ownership, not a fresh actor/private-project roster. `requireDocumentAccess` only requires organizationId. Existing [authorizeAuthoringProgram](../../../server/services/authoring/authoring-program-access.ts:41) with `forWrite:false` checks active membership, a unique program/project anchor and project sharing. Reuse/extract that shared read-side policy before source text/retrieval/egress, without giving source reads governed-write permissions. Preserve outside-project refusal and source-organization consistency. This is a scoped observation of the inspected functions, not a claim that every upstream entrypoint lacks authorization.

## Minimal V2 source receipt contract

Use one shared server-owned contract, imported by loader, receipt service, draft result, save verifier, export verifier and tests. Keep V1 legacy prefix parsing for saved historic records; new relevant-passage drafts issue V2. Reject unknown versions. Do not rewrite immutable historical audit rows.

```ts
type SourceRangeV2 = {
  rangeId: string;             // stable within one receipt, server assigned
  start: number; end: number;  // [start,end), JS UTF-16 code units
  textSha256: string;          // SHA-256 of exact UTF-8 encoding of text.slice(start,end)
  role: 'body' | 'section_heading' | 'table_title' | 'column_header'
      | 'row_header' | 'footnote' | 'surrounding_context';
  page?: number;               // only extractor-confirmed
  tableId?: string;            // extraction-local, version bound
};
type DraftSourceReferenceV2 = {
  schemaVersion: 2;
  documentId: string;
  contentHash: string;         // original file SHA-256
  extractedTextSha256: string; // exact entire extraction, not just character count
  totalChars: number;
  ranges: SourceRangeV2[];
};
type DeliveredSourceReceiptV2 = {
  schemaVersion: 2;
  id: string; organizationId: number; programId: string;
  turnId: string; runId?: string; requestIndex?: number;
  requestId?: string;          // actual gateway/ledger identity, never supplied model name
  promptSha256: string; sourcePayloadSha256: string;
  references: DraftSourceReferenceV2[];
  contextState: 'prepared' | 'submitted' | 'served' | 'not_delivered' | 'uncertain';
  // server-derived coverage/budget snapshot; see below
};
```

The raw text belongs only to server-loaded segments, not public save inputs. Source-reference inputs remain declarations verified against current source records. A delivery/generation claim requires lookup of the server receipt by ID and its matching organization, program, turn, output/context hashes; copying a reference into an HTTP request cannot create delivery proof. A V1 reference remains an honest legacy declaration; do not promote it into evidence of generation.

Validation: safe integers, `0 <= start < end <= totalChars`; lowercase UUID/SHA normalization; nonempty ranges; 1–8 documents; maximum 32 ranges per document initially; duplicate document references merged/rejected consistently. Compute budgets on union length, not `sum(end)` or sum of overlapping windows. Preserve structural-role associations when deduplicating overlap. Record explicit policy version and reject unknown or contradictory shapes.

The exact full-extraction hash closes a current gap: same original hash and equal text length do not establish that the extracted characters or offsets stayed unchanged. Compute it server-side from authoritative stored extracted text; bind chunk generation, structural anchors and receipt to the same hash. Add fields to existing extraction/catalog/chunk projections where needed, under the ingestion contract. A source without a verified range mapping must say `anchor_unverified`; never infer a position by `indexOf` when repeated rows make it ambiguous.

## Retrieval and table context

Change the canonical Vault path, not its storage boundary:

1. Authorize actor/project and resolve selected current source UUIDs; load metadata before text and refuse cross-project, deleted, superseded or remove_data sources. Pass selected-document filter into both lexical/dense candidate SQL so irrelevant project files cannot displace selected ones. Resolve organization UUID/int pair before query embedding.
2. Build bounded section queries from section type/blueprint and user instructions. Search existing `searchDocumentPassages` → `ragRouter` → `vault.document_chunks`; expose matched chunk ID, original content hash, exact char range and extraction hash. Revalidate these identities after retrieval and before dispatch. Keep lexical keyless baseline; optional hybrid/reranking requires qualified gateway and measured benefit.
3. Propagate ranges through `VaultChunkRow`, `RetrievedDocument`, `vaultChunkToDoc`, lexical/dense SQL and `revalidateCandidates`. Extend `expandContext` to return ordered exact segments for neighbors with matching tenant, program, selected source, current status and extraction identity. Do not join overlapping chunk strings into false duplicated rows; normalize to authoritative disjoint ranges and reload exact slices.
4. Treat a scientific table as a context unit: body row/cells + title + all applicable header levels + row labels + referenced footnotes + nearby definition of population/timepoint/analysis. Each part retains its own anchor and role. If the structural extractor cannot prove the association, report `table_context_unverified`; retrieve a larger contiguous verified span, read the original or require reviewer verification. Do not fabricate table structure from model guesses.
5. Keep the matched unit and structural support together when budgeting. If necessary context cannot fit, deliver a smaller complete table unit, ask for a targeted read, split the task or return `SOURCE_CONTEXT_TOO_LARGE`; never silently discard the denominator or footnote to retain a number. For unknown page geometry retain extracted-text coordinates and disclose original-page confirmation unavailable.

Table title/header/footnote anchors are an ingestion interface dependency; the inspected chunk store currently records flat text/page spans. Retrieval implementation cannot declare table-context completeness before ingestion supplies verified anchors. A cell-local result without its qualifying title/header/footnote must be “not compared/context incomplete,” not factual agreement.

## Budget and coverage truth

Retain initial raw evidence limits of 12,000 unique chars/document and 48,000/section as separately versioned policy, not as a prefix constraint. Account for full serialized source JSON, fixed instructions/existing content and model context reserve before dispatch. “12k evidence chars” is not “12k serialized chars” or tokens. Record raw union chars, serialized JS string length, measured/estimated model tokens (label estimate), limits and reason for any omitted unit. Respect whichever limit is binding.

Tool reads retain existing `RESULT_BUDGET=5000`, per-result host ceiling 8,000 and round ceiling 24,000 (see [agentic-loop.ts](../../../server/services/ana/agentic-loop.ts:556)). These are separate from direct drafting context budgets. Multi-range table reads are whole-or-nothing payloads. A model-host replacement must keep coverage metadata and an actionable re-read hint without writing any new span receipt.

Record three distinct coverage scopes:

- **Index coverage:** current eligible authorized selected/project documents indexed/pending/failed/unknown, reason and unfiled chat uploads outside the index. Bind indexed status to current extraction hash; do not equate stored chunk_count with fresh indexing. Unknown ledger means unknown, not zero or all.
- **Retrieved context:** selected ranges and omitted units; `completeText` only when the union is `[0,totalChars)`. Even complete extracted-text coverage is not proof of original pages or scientific approval.
- **Model-request context:** exact segments surviving final serialization/budgeting; receipt state with actual request/outcome. “No match” in a partly indexed corpus is not absence of evidence; a capped search is not exhaustive review.

The current `getReadCoverage` query unions receipts by documentId/contentHash across readers/threads. Retain historic receipt facts, but do not use this global union to say the current draft model received a full document. V2 model-context coverage is request/turn-bound; catalog comprehension coverage needs its separately defined authorized study-history scope. Passing a full-read catalog gate must not silently promote unrelated historical reads into current-request context.

Existing `settleReadReceipts` settles immediately after host budgeting, before `callModel` routes the request. Preserve its exact-string safety, but name what it proves accurately. Stage `prepared`, associate final request-input hash at gateway submission, finalize `served` on a successful model call with that context. Cancellation before dispatch or replaced result is not_delivered; ambiguous provider/network failure is uncertain. Coverage used for a scientific catalog-completion claim should require the accepted final state; do not mint a stronger provider-delivery fact from pre-dispatch budgeting alone. At minimum, separate host-admitted and provider-served fields without rewriting old receipts.

## Loader, save, re-verification and export changes

| Owner/change point | Exact required behavior |
| --- | --- |
| `draft-project-sources.ts` | Accept server retrieval intent/section requirements and cancellation; produce V2 segments from selected documents; compute extraction hash and exact coverage; prompt/audit carry receipt version/IDs and scoped coverage. Preserve no-source unassessed path. |
| `AnaToolExecutor.ts` batch handler | Pass section requestIndex/requirements into loader, carry new `sources[]` refs and server receipt ID in successful result; actionable per-section source/budget failures; retain successful IDs and retryIndices. |
| `AnaDocumentDraftingService.ts` | Preserve exact source segment JSON through final request; record input/output hashes against real gateway receipt; signal propagation and output truncation; direct context budget check before egress; source audit metadata does not imply scientific verification. |
| `draft-source-references.ts` | Dispatch V1/V2 parsers; V2 verify full extraction hash, totalChars, each bounds/hash/role anchor, current eligibility and project identity; reload each `slice(start,end)`, never a prefix; compute union completeness. Keep save groups unassessed/current_at_save. |
| `authoring-from-draft.ts` | Reauthorize actor/project inside save transaction; disposition program lock and existing source version reservation; verification + sanitized stored-text checks + provenance/audit/sections commit together. Resolve server delivery receipt only when claiming served context. |
| `draft-figure-check.ts` | Each excerpt/segment has absolute start + rangeId. Confirm local position against exact slice, then add absolute start; null if unconfirmed. No offset across constructed joins. |
| `section-claims-check.ts` | Range-aware claim text with verified table/context grouping and a reversible position map. Separate distant fragments must not inherit each other's heading/population. Return source range IDs/absolute offsets; context-incomplete and unknown frame stay not_compared. |
| `verifySavedDraftSourceReferences`/reservation | Decode versioned saved references and apply the same verifier; include actor read authorization where original consumption occurs; preserve source/disposition locks across renderer + receipt commit. Historical unavailable/changed references refuse new rendition through current default path. |
| `authoring-export.ts`, `authoring-file-to-vault.ts`, `authoring.router.ts`, `coauthor-snapshot.ts` | Reuse common verifier for V2; no export-specific permissive normalization. Export receipt includes source receipt/version hashes and availability caveats. Existing immutable audit history remains inspectable; refreshing a source does not silently rewrite old receipts. |
| `document-catalog-tools.ts`/tool defs + `read-receipts.ts` | Keep offset reads; add optional server-verified multi-range/table-context read. Receipt contains exact admitted range list, extracted-text hash and thread/turn association; write ranges atomically with group ID and idempotency. Generalize wholeOrNothing hints for re-read range IDs. Catalog full-read gate counts union of accepted spans only. |
| Client provenance presentation + disposition impact | Render ranges/page/table context, actual coverage and source availability; retain existing documentId/contentHash shape so `projectSourceReferences[*].sources[*]` impact lookup remains valid. Never imply source qualification from a new range field. |

`keep_data` intentionally permits retained extracted text while original-file availability is false. Preserve this governed distinction: disclose original unavailable, retain exact extracted-data provenance, and leave original-page/OCR numeric confirmation unresolved. Do not reopen a binary through a new tool. `remove_data` and `supersede` remain ineligible across loader, retrieval, queued/resumed work, save and export. Current-only version-family filtering must be applied to passage candidates too; disposition checks alone are not the entire definition of current.

## Bounded workflow using existing runs and jobs

General AnA: extend existing authoritative `ana_runs`/turn-record persistence with a versioned bounded stage checkpoint and references to source manifests and output hashes; do not use best-effort `ana_run_events` as authoritative state. A minimal additive checkpoint must distinguish section requestIndex, attempt ID, stage, owner/fence, input digest, output reference/hash, failure code and saved authoringDocId. Store source content/results under existing governed stores/turn records; timeline only presents status. Add migration/contract checks before claiming restart recovery.

CSR-specific builds: use existing [csr_build_jobs/csrSectionOutputs](../../../server/services/csr/csr-job-runner.ts:188) section persistence/resume pattern, which already reauthorizes requestedBy/project when work starts. Extend its snapshot/lineage with V2 references and per-stage guards. Do not route generic medical-device/IVD jobs into a table whose semantics are CSR. Shared helpers can serve both owners.

Stages: `authorize → retrieve → assemble_context → dispatch_generation → validate_output → persist_candidate → await_review → save → export`. Every stage starts from persisted input identity and fresh access/eligibility as appropriate. Bounded concurrency reuses existing batching; successful sections are checkpointed before another wave. An atomic compare-and-set ownership/fence prevents two processes from claiming the same stage. Cancellation terminality comes from existing run-control state machine; do not resurrect a cancelled run.

| Stage/failure | Retry and cancellation behavior |
| --- | --- |
| Authorization or source version/disposition failure | No provider call; no automatic retry. Preserve prior outputs; refresh/reauthorize as explicit new attempt. |
| Retrieval/structure/index unavailable | Return named stage/code and partial/unknown coverage; read fallback in same source scope. Retry transient DB faults with bounded policy; an empty index is not a provider outage. |
| Budget or incomplete table context | No dispatch; change task/context selection, not identical retries. |
| Provider transient failure | Bounded existing gateway retry only under same tenant/placement/qualification. Record actual attempts/request IDs. If dispatch outcome uncertain, mark uncertain; do not claim exactly-once model invocation or avoid all duplicate billing. |
| Cancellation before/during dispatch | Pass AbortSignal through request/loader/batch; stop scheduling sections; discard late response from cancelled attempt from acceptance/save. Remote completion may continue; describe that limit accurately. |
| Generated result persisted | Retry validation/save from stored exact content and same manifest after re-verification; do not regenerate successful output because timeline delivery failed. |
| Candidate/provenance checkpoint fails | No “durable draft” claim. Retry persistence idempotently against content/input/attempt hashes; preserve uncertainty if outcome cannot be confirmed. |
| Save/export transaction rollback | No saved ID/file claim. On commit uncertainty, query idempotency/result receipt first; never blindly recreate a draft already saved. Cancellation racing commit is reported as the actual committed outcome and retained ID. |
| Process restart | Existing ana_runs marks orphan failure rather than execution replay. Resume from persisted completed stage via a new authorized attempt linked to old run; do not claim automated continuation until checkpoint and fencing are deployed/tested. |

## Ten meaningful red/green fixtures

These are proposed acceptance fixtures; neither side was run in this read-only task. Red means the existing behavior or a deliberately faulty implementation fails the specified invariant; green is the required observable behavior.

| # | Fixture and independent oracle | Red | Green |
| --- | --- | --- | --- |
| 1 | Late CSR table after character 80,000; placebo/treated nausea rates differ; exact source/table anchors fixed in fixture | Prefix misses table or stores local offset as document coordinate | Relevant nonzero ranges delivered; correct framed conflict found; save/export offsets reproduce exact original slice |
| 2 | Table row on one page, multi-level arm/denominator header above, exclusion footnote next page; duplicate numeric row elsewhere | Number alone credited, wrong arm/population inherited or footnote removed | All required context delivered with distinct anchors or explicit context-incomplete/not_compared; no scientific agreement from isolated row |
| 3 | Original hash changes between retrieval and save/export; companion case re-extraction changes same-length text under same file hash | Total length/hash-only check admits stale coordinate | V2 extraction/source digests fail; no new save/rendition; original immutable receipt unchanged |
| 4 | Active member removed from private project after queueing, before source dispatch/save/export | Org ownership or old access token admits source/egress | Fresh read/write gate fails before new content/provider use; no new receipt or export; prior audit retained without exposing unauthorized text |
| 5 | Escaped JSON/control chars plus complete table unit exceeds serialized prompt/tool budget despite raw text fitting; overlaps hit union limit | Silent head/tail cut, sum(end) rejection or omitted footnote treated delivered | Union-based limits; whole unit fits or named refusal; no unserved-range receipt; omitted units and coverage explicit |
| 6 | `keep_data` with original withdrawn; separate remove_data/supersede/current-successor case | New tool reopens binary or labels retained OCR number page-verified; obsolete passage reused | Retained text disclosed with original unavailable and unresolved page confirmation; removed/superseded sources never enter context/save/export |
| 7 | Multi-range read result replaced/amended by host budgeting or cancelled before next model call | Original ranges counted as read despite replacement | No accepted span receipts/coverage increment; result names not_delivered/re-read ranges; successful unchanged payload counts exact union only |
| 8 | Forged V2 range text hash/role, receiptId from another tenant/turn, out-of-bounds UTF-16 range containing surrogate-pair edge | Browser ref generates served/qualified fact or normalized bogus coordinate | Input bounds/hash/source/receipt scope rejection; no source disclosure/write; authentic same-tenant receipt round-trips through save and export |
| 9 | Two workers retry same section; one cancelled late; crash after successful generation then persistence/commit acknowledgement loss | Duplicate model/output/document creation, cancelled result replaces accepted candidate | Fence rejects late worker; successful stored output reused; saved ID returned by receipt lookup; retries do not revive cancelled attempt; ambiguous generation cost reported |
| 10 | Search corpus with indexed/current, failed, unindexed and unfiled uploads; no provider key; query with no lexical hit | “Evidence absent/all searched,” fake semantic ranking or key required | Real keyless lexical runs; partial/unknown coverage and outside-index scope disclosed; no absence conclusion; optional hybrid result separately identified |

Add focused regression cases to existing loader/reference/figure/claims/read-receipt tests; use PGlite for transaction rollback/current-source fixtures and real Postgres runtime-role tests for RLS, locks, cross-instance cancel/fencing and revoke races. Tests must use fixed known anchors/expected scientific frames, not values generated by the same implementation under test.

## Dependency order and release evidence

1. Control tower approves shared V2 contract, ownership and compatibility matrix. Ingestion owns source-text hash/structure anchors; retrieval owns propagating verified spans; authoring owns save/export decoding; workflow owns durable checkpoints. Publish interface fixtures before parallel implementation.
2. Ship parser/validator + V1 saved-record compatibility + raw union budget + absolute offset mapping behind feature flag. Red/green pure fixtures and malformed-input cases must pass.
3. Bind canonical extraction/chunk metadata; backfill through existing governed chunking job with recorded failures and no forced embeddings. Prove repeated-text anchors and same-length extraction-change refusal.
4. Extend canonical retrieval, selected-document/current filters, structural expansion and loader. Run keyless deterministic late-table/table-fragment fixtures; authorize before retrieval/egress; no separate store.
5. Carry context delivery receipts through gateway, tool host, generation result and canonical authoring save/export. Prove actual sanitized stored-text checks, transactional rollback, changed-source and revoked-project refusal.
6. Add bounded section checkpoints, signal propagation, attempt fencing and resume behavior to existing run/CSR owners. Real DB fault/restart/cancel tests establish what is durable. Timeline failure must not discard successful authoritative output.
7. Provider-neutral held-out benchmark and shadow comparison before default flag. Record source/fixture hashes, code SHA, receipt/rule versions, provider/model actually served, prompt/input/output hashes, qualification verdict, cost/time and review findings. Re-run affected slices for retrieval/extractor/model/prompt changes; no key in reports.

Deterministic release blockers: no unauthorized content or source mixing, exact anchor/hash round-trip, no false whole-document coverage, no receipt for replaced/cancelled context, no duplicate accepted save, all V1 exports retain their original refusal behavior, and no generated prose credited as source data. Scientific benchmark slices: late table recall, contextual frame/footnote accuracy, correct conflict/not_compared outcomes, unsupported claim rate, reviewer corrections and review time. Set numeric performance targets from a real permitted baseline; do not promise savings or zero model errors without evidence.

Reuse existing `eval:grounding`, doc-quality and PQ tooling through a provider-neutral case manifest; keyless deterministic contract tests run in CI, optional qualified-provider runs are separate approved release evidence. No provider API call, provisioning or production change is authorized by this read-only specification.
