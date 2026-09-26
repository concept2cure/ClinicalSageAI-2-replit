# P1-34 — the directly registered AnA write tools join the propose-only partition (DP-36)

**Row moved:** D6 (D5 for the Part 11 half: 11.10(d)).
**Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-36 (High; re-opens DP-08 in part; DP-31, DP-32);
`docs/evidence/reviews/2026-09-26/security.md` §3.
**Plan item:** `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` P1-34.
**Commit:** the control tower commits this lane's files; HEAD when the red runs were taken: `7fbe51c5` (2026-09-26 12:43 UTC).
**Scope of this folder:** the half that lands on cold files now — the registry, its anti-drift test, the separate
direct-tool classifier in the gate module, and the refusal on the MCP door. The enforcement in the four hot files
(the registration wrapper, the `/governed-action` tool branch, the stream's hold-and-ask, and the relocation of the
fourteen inline refusals) is written up in §5 so the follow-up is mechanical.

## 1. What was wrong (verified at HEAD `7fbe51c5`)

- `server/services/ana/governed-tool-gate.ts:80-89` (old numbering): the only classifier in front of a tool call
  answered `UNGOVERNED` for every tool but `execute_platform_command`, and its docstring said the exclusion of the
  direct handlers was "the existing judgment rather than an omission". `governed-tool-gate.test.ts:161-174` pinned
  `save_document_to_vault → UNGOVERNED`.
- `PROPOSE_ONLY_COMMANDS` (`server/services/ana-ri/command-rbac.ts:439-443`) is derived from `COMMAND_AUTHORIZATION`,
  whose ~110 keys are the commands reachable through the one bridge tool. The names registered with
  `registerToolHandler` are disjoint from them (`describe_capabilities`, `AnaToolExecutor.ts:3548-3549`, partitions
  the surface the same way). So the P0-12 closure — "every write is a proposal" — was true of the bridge and of nothing
  else.
- The consequence, by direct read: `save_document_to_vault` (`AnaToolExecutor.ts:19631`), `update_vault_document`
  (`:19757`), `draft_authoring_document` (`:19749`), `create_qms_document` (`:13544`), `revise_qms_document`
  (`:13614`), `retire_qms_document` (`:13668`, DP-32), `qms_change_transition` (`:13795`, DP-31), `ack_training`
  (`:13714`), `approve_import` (`:14381`) and the research-compliance `*Tx + recordGovernedAction` family
  (`:10104-13256`) ran from model output with no person confirming, no `humanConfirmed` read anywhere in the file,
  and a model-written reason where a reason was demanded at all.
- Every door reached those handlers the same way: the agentic loop (`:15297`), the stream (`routes/ana-ri/stream.ts:1767`),
  nested handler-to-handler calls (`:1168`, `se-discussion/se-discussion-author.ts:92`) and the MCP runtime
  (`server/mcp/tools/runtime.ts:88-97`), which had no classifier in front of `getToolHandler(name)` at all.

### The count correction

The register says "~40 directly registered AnA write tools". The scan (below) finds:

| Population | Count | How |
|---|---|---|
| Tool names registered by literal `registerToolHandler('…')` / `register('…')` across `AnaToolExecutor.ts` and the six `RegisterFn` modules | **736** | source split (the test's own derivation); plus the Global-RI family and `update_plan`, registered by variable and all reads |
| Handler bodies carrying a hard write marker (`INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, drizzle insert/update/delete, `recordGovernedAction`, `recordArtifactProvenance`, `recordAuditRow`, `*Tx(` other than the RLS helper `setTenantContextTx`, `fs.writeFile`, `createNotification`, `method: 'POST'`) | **135** | `propose-only-tools.test.ts` `WRITE_MARKER`; bodies cut at the handler's own `});` so helpers and comments between handlers do not count |
| Writers that persist only through a called service and so carry no marker in their own body (`commit_document_revision`, `file_chat_upload_to_vault`, `catalog_project_document`, `place_project_document`, `mergeProgramMetadata` callers, the RBM actuator family, `generateProjectSchedule`, `ingestProjectDocument`, `recordLiteratureEntries`, `saveDerivedUpload`, `createCalendarEvent`, `createComplaint`, `createCapaRecord`, `createQSubmission`, `upsertLeaf`, `createDefinition`, `commitInterviewSession`, the fact-change orchestrator, the document builders) | 48 | read one by one (scout list + this lane's second scan) |
| **Classified, total** | **195** | one map each |
| — proposals (`PROPOSE_ONLY_TOOLS`) | **161** | 16 at the `reason` tier, 145 at `confirm`, none at `esignature` |
| — refusals (`REFUSE_IN_CHAT_TOOLS`) | **22** | 14 already refusing inline (9 via `refuseSignatureInChat`, 5 with hand-written copy) + 8 new; 1 conditional on `input.to` |
| — read-only exclusions (`READ_ONLY_TOOL_EXCLUSIONS`) | **12** | each with its reason |

So the true figure is about **170 state-changing direct tools** (161 proposals + the 8 newly refused + the
conditional one), not ~40; a further 14 already refused. Gating them all changes AnA's felt behaviour across the
research-compliance, RBM, QMS, labeling, IVD and vault surfaces at once when the wrapper lands — the same shape as
P0-12's 53 commands, at a larger scale. The founder should see this number before §5 step 1 is taken.

## 2. What changed

**New — `server/services/ana/propose-only-tools.ts`** (pure; no I/O). The tool-name-keyed sibling of
`PROPOSE_ONLY_COMMANDS`, beside `governed-write-tools.ts` and in its style:

- `PROPOSE_ONLY_TOOLS: Readonly<Record<name, {tier, why}>>` — the rule, stated once in the header: the effect outlives
  the turn as something the organisation keeps or ships. `reason` where the handler already demands a
  reason-for-change (so it is the person's, not the model's: `save_document_to_vault`, `update_vault_document`,
  `revise_qms_document`, `seed_tmf`, `update_tmf_artifact_status`, `apply_fact_change`) and for GCP study records,
  FCOI disclosures, governed facts and the canonical document revision; `confirm` otherwise.
- `REFUSE_IN_CHAT_TOOLS: Readonly<Record<name, {act, where, why, when?}>>` — approvals, attestations, determinations,
  votes, submissions, retirement, finalisation, execution, agency transmission. The 14 inline refusals are registered
  with their `act`/`where` copied verbatim so relocating them is a copy-free change. `when` makes
  `qms_change_transition` a refusal for `to ∈ {approved, rejected, closed}` and a `reason`-tier proposal for the other
  lifecycle moves; an unreadable target is refused, never proposed.
- `READ_ONLY_TOOL_EXCLUSIONS: Readonly<Record<name, why>>` — compute scratch (`run_python_script`, `run_in_container`),
  mechanical file transforms (`convert_docx_to_pdf`, `insert_clause_template`), the packaging step before the wire
  (`package_ectd_for_region`; the code already says everything up to the wire is the agent's), analysis-session rows
  (`start_deep_investigation`, `convene_drafting_council`, `run_shadow_review`, `start_war_game`), interview session
  state (`start_intelligence_flow`, `answer_intelligence_question`; the register write is `commit_intelligence_flow`),
  and `assemble_crl_premortem_artifact` (its only write is the nested `author_docx_native` handler, itself a proposal).
- Helpers: `isProposeOnlyTool(name)`, `toolTierOf(name)` (null, never a silent `confirm`, for a non-proposal),
  `refusedInChatTool(name, input)`, `buildToolProposalResult(name, input)` — the `buildHumanConfirmationRequiredResult`
  envelope (`part11-governance.ts:272-311`, not edited) with `retry: {tool, input}` and a `TypeError` for a name that
  is not a proposal — and `buildToolRefusalResult(refusal)` — `refuseSignatureInChat`'s keys plus
  `error: 'REFUSED_IN_CHAT'` so every door that reads `error` as a refusal treats it as one. `execute_platform_command`
  is in no map (the command partition governs it; pinned).

**New — `server/services/ana/__tests__/propose-only-tools.test.ts`** (25 cases). Derives the candidates from the
handler sources (registering modules discovered by their `register: RegisterFn` parameter, not listed), then: every
flagged name in exactly one map; no name in two; no stale name (every registry name is registered); every `why` a
sentence; `GOVERNED_CONTENT_WRITE_TOOLS ⊆ proposals ∪ refusals` (the model-approval gate and the human gate compose);
every `refuseSignatureInChat(` caller and the four hand-written refusers registered; the bridge in no map; DP-36's
exemplars classified as the plan row states; the envelopes.

**Changed — `server/services/ana/governed-tool-gate.ts`** (cold, this lane). A SEPARATE export
`classifyDirectToolCall(call): DirectToolVerdict` with the same UNDECIDABLE discipline (parse error or non-object
input → refused, never cleared; a conditional refusal with no readable target → UNDECIDABLE), `NEEDS_APPROVAL
{tool, input, tier}` for proposals, `REFUSE_IN_CHAT {tool, act, where, why}` for refusals, `UNGOVERNED` for reads and
for the command tool. `classifyToolCall`'s return union is unchanged (`routes/ana-ri/stream.ts:1596` narrows on it and
is hot). The module header and the `classifyToolCall` docstring no longer assert the direct-handler exclusion is a
settled judgment; they say what it is and when it flips.

**Changed — `server/services/ana/__tests__/governed-tool-gate.test.ts`.** Seven `classifyDirectToolCall` cases,
including every propose-only name at its tier and every unconditional refusal. The old `:161-174` pin is kept, with a
comment naming the stream.ts window (2026-09-27 04:52 UTC) in which it flips to `NEEDS_APPROVAL`.

**Changed — `server/mcp/tools/runtime.ts`** (cold, 09-23). `callAnaHandler` classifies before it dispatches: a refused
act → `buildToolRefusalResult`; a propose-only tool without `ctx.ana.humanConfirmed === true` →
`buildToolProposalResult`; both audited as `outcome: 'denied'` through the same `writeAudit` as a scope denial; the
confirmation is read from the context, never from the input. `ToolRunContext.ana.humanConfirmed?: boolean` is declared
(read only; nothing on the connector surface sets it, so a proposal is a refusal in practice) and the single-writer
grep still returns only `routes/ana-ri/utility.ts` (`green/neighbouring-pins.txt`).

**New — `server/mcp/__tests__/mcp-runtime-propose-only.test.ts`** (9 cases): a registered write tool with a mock
handler that must not be called; the refusal, the proposal, the conditional transition, the audit rows, a read that
reaches its handler, the confirmed-context contract, and a source pin that `runtime.ts` reaches handlers only through
`getToolHandler` and classifies through the registry helpers, with no second list.

## 3. Evidence

| File | Shows | Against |
|---|---|---|
| `red/registry-empty-before-classification.txt` | 18 of 25 fail with the three maps empty; the completeness assertion lists every flagged writer | `propose-only-tools.ts` with empty maps, HEAD `7fbe51c5` |
| `red/one-entry-removed.txt` | with only `save_document_to_vault` removed from `PROPOSE_ONLY_TOOLS`, the completeness assertion names exactly `['save_document_to_vault']` (5 fail) | the filled registry minus one entry |
| `green/registry-classified.txt` | 25 of 25 pass | the filled registry |
| `red/gate-direct-classifier-before-fix.txt` | 7 new cases fail (`classifyDirectToolCall` absent); the 15 existing cases, including the `:161-174` pin, pass | unchanged `governed-tool-gate.ts` at HEAD |
| `green/gate-direct-classifier-after-fix.txt` | 22 of 22 pass; the pin on `classifyToolCall` still holds | changed gate module |
| `red/mcp-door-before-fix.txt` | 6 of 9 fail: the mock handler IS called for `save_document_to_vault`, `retire_qms_document`, `qms_change_transition`; no audit row | unchanged `runtime.ts` at HEAD |
| `green/mcp-door-after-fix.txt` | 9 of 9 pass; the handler is not called; two `denied` audit rows | changed runtime |
| `green/neighbouring-pins.txt` | `propose-only-partition.test.ts` (single writer still `['routes/ana-ri/utility.ts']`) and `mcp-auth-contract.test.ts`: 16 of 16 pass | after the change |
| `green/eslint-touched-files.txt` | the three existing files: 0 problems at HEAD, 0 now; the three new files clean | — |

Every red run failed on the case it exists to catch; none was a false red.

## 4. Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run server/services/ana/__tests__/propose-only-tools.test.ts
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run server/services/ana/__tests__/governed-tool-gate.test.ts
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run server/mcp/__tests__/mcp-runtime-propose-only.test.ts
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run server/services/ana-ri/__tests__/propose-only-partition.test.ts server/mcp/__tests__/mcp-auth-contract.test.ts
for f in server/services/ana/governed-tool-gate.ts server/services/ana/__tests__/governed-tool-gate.test.ts server/mcp/tools/runtime.ts \
         server/services/ana/propose-only-tools.ts server/services/ana/__tests__/propose-only-tools.test.ts server/mcp/__tests__/mcp-runtime-propose-only.test.ts; do npx eslint "$f"; done
```

To see the anti-drift test fail again: delete any entry (say `save_document_to_vault`) from `PROPOSE_ONLY_TOOLS` and
run the first command; the completeness case names it.

## 5. What waits, for which window, and the mechanical steps

Windows are the 24-hour rule from the last commit by another session (now 2026-09-26 ~13:20 UTC).

1. **`server/services/ana/AnaToolExecutor.ts` — until 2026-09-27 03:15 UTC (lane `session_01AiwZKG…`).** The wrapper
   gate, the one change that closes every door fail-closed (agentic loop `:15297`, stream `:1767/:1805`, MCP
   `runtime.ts:94`, nested `:1168` and `se-discussion-author.ts:92`, the nested loop `:15382`):
   - In `registerToolHandler` (`:296-327`), immediately after the governed-write gate at `:304-307`:
     ```ts
     const refusal = refusedInChatTool(name, input);
     if (refusal) { recordToolOutcome(name, 'failure', 0, 'REFUSED_IN_CHAT', orgId); return JSON.stringify(buildToolRefusalResult(refusal)); }
     if (isProposeOnlyTool(name) && ctx?.humanConfirmed !== true) {
       recordToolOutcome(name, 'failure', 0, 'HUMAN_CONFIRMATION_REQUIRED', orgId);
       return JSON.stringify(buildToolProposalResult(name, input));
     }
     ```
     Order: the model-approval refusal first (an unapproved model's draft is refused before anyone is asked to confirm
     it), then the refusal class, then the proposal. Test the order.
   - Add `humanConfirmed?: boolean` to `ToolContext` (`:200-268`) with a docstring naming `routes/ana-ri/utility.ts` as
     the only writer; `options.toolContext` in `executeAgenticLoop` is model-side, so a `humanConfirmed` passed there
     must NOT reach the handler (mirror `governed-write-gate.test.ts:161-165`, "the caller cannot vouch").
   - Delete the fourteen inline refusals (`refuseSignatureInChat` at `:10790-10797` and its nine callers;
     `finalize_protocol_document :11533-11570`, `approve_qms_document :13606`, `approve_rbm_assessment/plan
     :3367-3405`, `transmit_submission :8621-8676`): the registry entry is the one implementation. Keep
     `finalize_protocol_document`'s completeness read if the product wants the readiness report in the refusal.
   - Tests, in `governed-write-gate.test.ts`'s pattern: for every `PROPOSE_ONLY_TOOLS` name, the registered handler
     with `{organizationId:1, servingModel: OPUS}` → `HUMAN_CONFIRMATION_REQUIRED`, inner not called; with
     `humanConfirmed:true` → inner called once; for every refusal name → `REFUSED_IN_CHAT` even with
     `humanConfirmed:true`; the agentic-loop door with a mocked gateway round for `save_document_to_vault` → inner not
     called; `expect(executorSrc).not.toMatch(/input[^\n]*humanConfirmed/)`.
2. **`server/routes/ana-ri/utility.ts` — until 2026-09-27 03:16 UTC (lane `session_01471vSK…`).** `POST
   /governed-action` (`:474-630`) accepts `{tool, input}` beside `{command, params}`; `:504` becomes
   `isProposeOnlyCommand(command) || isProposeOnlyTool(tool)`; a refusal-class tool posted here is rejected (a
   ceremony is not a chat confirmation); the tier comes from `toolTierOf`; at the reason tier the person's
   `reasonForChange` replaces `input.reason` before the handler runs (the handlers that demand a reason record what
   they are given); after the audit row (`:557-562`) execute
   `getToolHandler(tool)!(input, { organizationId, userId, projectId, humanConfirmed: true, servingModel: <persisted on the proposal row> })`
   in the same block as `:592` so the single-writer grep stays `['routes/ana-ri/utility.ts']`; `releaseWaitingRun` as
   today. The confirmed run must carry the `servingModel` recorded at proposal time or the governed-write gate at
   `AnaToolExecutor.ts:304` refuses the person's own confirmed save (`servingModel` undefined → refused). The
   run-approval store behind `requestApproval`/`readApprovalDecision` (`stream.ts:1620/1662`) must carry
   `tool + input + servingModel`; locate it and check its window first.
3. **`server/routes/ana-ri/stream.ts` — until 2026-09-27 04:52 UTC (lane `session_01T2wooC…`).** `settleApprovals`
   (`:1544`) calls `classifyDirectToolCall` as well: `REFUSE_IN_CHAT` → the refusal result, no dispatch;
   `NEEDS_APPROVAL` → hold the turn and emit `approval_required` with `retry: {tool, input}` (widen `awaitDecision`'s
   `Extract` type and the `requestApproval` payload); `UNDECIDABLE` → the existing `GOVERNED_CALL_UNREADABLE` branch.
   Verify `GovernedActionSignoff` / `useGovernedAction` accept `tool` in `retry` (`liveApproval.test.ts:68-80`). Then
   flip the `classifyToolCall` pin in `governed-tool-gate.test.ts` ("classifyToolCall still speaks only for the
   command tool") — or, cleaner, leave `classifyToolCall` alone and pin that `settleApprovals` calls both.
4. **`server/services/ana-ri/part11-governance.ts` — until 2026-09-27 03:15 UTC.** No change needed: the tool tier
   and envelope live in `propose-only-tools.ts` on purpose (`governedTierOf` answers `'confirm'` for any unknown name,
   which would under-tier a tool silently). Only if the team prefers one tier function.
5. **`server/services/ana-ri/command-executor.ts` — until 2026-09-27 05:39 UTC.** No change needed; it is the
   reference implementation of the refusal.
6. **`server/services/ana/document-catalog-tools.ts` — until 2026-09-27 12:31 UTC (lane `session_01DiJJAk…`).** Read
   only in this lane (its three writers are classified); nothing to change there.

Until step 1 lands, the classification is enforced on the MCP door only; the agentic loop, the stream and nested calls
still run these handlers unaided. That is why the register status is "registry landed; wrapper gate pending window",
not closed.

## 6. Judgments made here, and residuals

- **`qms_change_transition` refusal targets are `approved`, `rejected`, `closed`.** The plan row says
  "approved/effective/closed"; `effective` is not a change-lifecycle state (`CHANGE_STATES`,
  `changeControl.service.ts:29-32`) — it is a document state, behind `approve_qms_document` and the signed route.
  `rejected` is added because the approve/reject decision is one determination by the same approver. The draft-side
  moves (`under_assessment`, `in_implementation`, `verification`, `cancelled`) are proposals at the reason tier.
- **`update_tmf_artifact_status` is a reason-tier proposal, not a conditional refusal.** Its vocabulary (`expected`,
  `received`, `in_review`, `final`, `missing`, `not_applicable`; `etmf-service.ts:113`) has no approval; `final` is a QC
  filing state.
- **Deliverable writers.** The document builders that produce a downloadable document from model-supplied content or
  selections (`author_docx_native`, `generate_document`, `insert_document_content`, `pdf_overlay`,
  `build_from_template`, `fetch_template_and_fill`, `assemble_ectd_module_from_artifacts`, `surgical_docx_xml_edit`) are
  `confirm` proposals; mechanical transforms and compute outputs are exclusions. If the product decides no scratch
  file is a confirmable action, move the four not in `GOVERNED_CONTENT_WRITE_TOOLS` to exclusions in one change (the
  four that are stay proposals: the two gates compose).
- **`fire_notification` is a `confirm` proposal**: a model-written title and body reach other people in the tenant
  under the platform's voice. It stays in `FREE_TEXT_NON_GOVERNED_TOOLS` for the model gate (not a governed record);
  the two lists answer different questions.
- **`ind_generate_section`** writes through a loopback `POST http://localhost:PORT/api/ind-generation/generate-section`
  (`AnaToolExecutor.ts:6512`) that carries none of the tool's context — classified as a proposal here; the tenant-binding
  smell deserves its own register row.
- **`build_from_template` / `fetch_template_and_fill`** take model-supplied `replacements` that the free-text scan in
  `governed-write-tools.ts` does not match (`FREE_TEXT_FIELD` has `replacement`, singular) — a possible gap in the
  model-approval gate, out of scope here; noted for that gate's owner.
- **The 27 `*Tools.ts` modules** (`rimTools.ts`, `capaMdrTools.ts`, …) that `grep registerToolHandler` returns only
  mention it in comments; they define schemas, not handlers. The registration surface is the executor plus the six
  `RegisterFn` modules, two of which (`document-placement-tools.ts`, `document-passage-tools.ts`) the scout's map
  missed; the test discovers registrars by their parameter type so a seventh is scanned automatically.
- **Not read handler by handler** (classified from the scan and the scout's list; the derivation test is what makes
  the read-only assumption enforceable): the ~540 handlers with no write marker and no write-shaped service call.
- **Tests not written yet** because their subjects are hot: the wrapper-gate suite, the `/governed-action` tool
  siblings of `governedActionConfirmTier.test.ts`, the stream source pin — all listed in §5.
