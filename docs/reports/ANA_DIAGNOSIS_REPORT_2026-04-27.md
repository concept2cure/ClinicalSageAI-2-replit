# AnA Diagnosis & Improvement Plan

**Date:** 2026-04-27
**Branch:** `concept2cure-v2`
**Status:** Investigation only — no code changed.
**Trigger:** "She is not context aware at all… has never worked." — speed +
context-awareness complaint, server-side scope (UI deferred to Claude Design bundle).

> Three parallel investigations were run against the chat hot path, the
> orchestrator/persona/intelligence-prefix assembly, and the memory pipeline.
> The findings converge on a small number of concrete root causes — not a
> rewrite.

---

## TL;DR — what's actually wrong

| Symptom | Real cause | Severity |
| --- | --- | --- |
| "Slow / unresponsive" | The client never calls the streaming endpoint; users wait silently for the full response (1–2 s of dead air). The non-streaming pipeline also runs retrieval and memory assembly sequentially, then a 2+ round agentic loop even when no tools are needed. | **High** |
| "Not context aware" | The orchestrator has a `projectContext` parameter, but `send-message.ts` never populates it. AnA learns project name / submission type only by detecting them from the user's literal words. | **High** |
| "Has never worked" | The intelligence prefix returns empty silently when `organizationId` is missing. Working memory has a write path but is only triggered manually — so for most threads it's empty. The persona does not forbid hallucination of project context. | **High** |

These three are the biggest levers. Everything else in this doc is supporting evidence and smaller fixes.

---

## Hot-path latency budget (typical "no tools needed" message)

| Phase | Estimated cost | Blocking | Notes |
| --- | --- | --- | --- |
| Pre-AI (org resolve, thread, retrieval, memory, evidence block) | 150–250 ms | Yes | Retrieval + memory are sequential awaits. |
| AI Gateway round 1 (Claude/OpenAI) | 800–1500 ms | Yes | Model latency. |
| AI Gateway "confirmation" round (agentic loop continues even with no tool use) | +400–800 ms | Yes | Loop in `ClaudeToolExecutor.ts` only strips tools at `maxRounds-2`. |
| Post-AI (claim parse, citations, RIM intercept, lineage) | 50–100 ms | Mostly fire-and-forget | A few `void` and `.catch(() => {})` calls. |
| Streaming feedback to user | **0 — never happens** | — | Client doesn't call `/api/chat/stream`. |
| **Typical perceived total** | **1.0–1.75 s** | — | All as a blocking wait, no first-token signal. |

Cold-start for the very first message also pays a ~200–500 ms gateway-init penalty (`ensureGateway()` is lazy in `chat/shared.ts`).

---

## Context-assembly map — what actually reaches the model

The system prompt is concatenated as:

```
intelligencePrefix + basePrompt + indContextBlock + deviceContextBlock + memoryBlock + evidenceBlock
```

Walking each piece:

| Piece | Source | Becomes empty when… | Silent? |
| --- | --- | --- | --- |
| `intelligencePrefix` | `getIntelligencePrefix(orgId, projectId)` in `lumen-context-builder.ts` | `organizationId` is null/undefined → returns `''` at line 1946 | **Yes — no warn log** |
| `basePrompt` | `orchestratorResult.systemPrompt` from `ana-ri/orchestrator.ts` `orchestrate({ message, conversationHistory, authoringContext })` | Always populated — but **no `projectContext` and no `documentContext` are ever passed in**. Orchestrator can only "detect" project metadata from the user's literal message text. | n/a |
| `indContextBlock` | Fires only if orchestrator detects IND/NDA/BLA from the message OR `req.body.context.productType` matches | If the client never sends `context.productType` and the user doesn't say "IND" in their message, the entire CTD-19-section guidance never appears | Yes — no fallback |
| `deviceContextBlock` | Same pattern, for 510K/PMA/DE_NOVO/CER/IVDR | Same failure mode | Yes — no fallback |
| `memoryBlock` | `buildMemoryContextForChat()` — 3 layers (working, project, client) | Working memory layer is empty for any thread that hasn't been manually summarized. Embedding timeouts (10 s) are silently swallowed and return `[]`. | **Yes — diagnostic exists in `MemoryAssemblyDiagnostics` but is never returned to the model** |
| `evidenceBlock` | Hybrid retrieval over `lumen_data_atoms` | Returns empty if `orgUuid` header missing/malformed (warn-and-skip path) | Partial — warn log only |

### Context gap matrix

| Context type | Always available? | Only sometimes? | Never wired? |
| --- | --- | --- | --- |
| Project name / indication / submission type | — | When `req.body.context.productType` is sent (IND/device blocks read it; **orchestrator does not**) | Structural injection into orchestrator |
| Active artifact title / version / section | — | Only when `authoringContext.sectionCode` is set, which requires the editor surface to send it | Document-context plumbing for chat |
| Prior conversation | Yes (full untruncated history sent) | — | — |
| User role | Defaults to `'general'` | If client sends `body.context.userRole` | — |
| Working memory (continuity summary) | — | Only if a summary was manually triggered for this thread | Auto-summarization |
| Semantic project memory | — | Only when embedding service is healthy and similarity ≥ 0.6 | Diagnostic surfacing on failure |
| RIM signals + recommendations | — | Only when `_rimContext` is pre-fetched (artifact edit flows) | Chat-flow injection |

---

## Persona — clear in principle, unenforced in practice

`server/services/ana-ri/persona.ts` already contains strong rules:

- "Evidence Discipline (NON-NEGOTIABLE)" — `[KNOWN]` / `[INFERRED]` / `[MISSING]` labels.
- "Response Grounding Mode (NON-NEGOTIABLE)" — `<ana-grounding>` block with mode + context_used + confidence.
- "Next-Move Contract (NON-NEGOTIABLE)" — every response must end with a concrete next action.

Two problems:

1. **No enforcement.** The grounding and next-move tags are specified to the
   model but never parsed by any route handler. If Claude omits them, nothing
   notices. The user sees an unstructured response that may or may not be
   grounded.
2. **No prohibition on hallucinating context.** The persona says "when
   uncertain, say so plainly" but does not say "if the user references a
   project / submission / module you don't have data on, **ask** before
   assuming." A regulatory-trained model will confabulate plausible CTD
   sections, dosing rationales, etc. unless explicitly forbidden.

---

## Recommended fixes — ranked by (impact ÷ effort)

> Each fix references the file + line area to touch. None of these is more than
> a few hours of work. UI changes are flagged separately and are out of scope
> for me; they belong in the Claude Design bundle.

### Tier 1 — biggest bang per line of code

**F1. Pass `projectContext` and `documentContext` to `orchestrate()`** _(server)_
- File: `server/routes/chat/send-message.ts`, around lines 313–322.
- Today: only `message`, `conversationHistory`, and a stub `authoringContext` go in.
- Change: also pass
  ```ts
  projectContext: project_id ? {
    productName: req.body.context?.activeProject,
    submissionType: req.body.context?.productType,
    projectId: String(project_id),
  } : undefined,
  documentContext: req.body.context?.artifactId ? {
    title: req.body.context.artifactTitle,
    section: req.body.context.sectionCode,
  } : undefined,
  ```
- Effect: `groundingContext.hasProjectContext` flips to `true`; orchestrator's role-aware injections start firing; AnA stops needing the user to repeat the project name in every message.

**F2. Always prepend a "CONTEXT SNAPSHOT" preamble** _(server)_
- File: `server/services/ana-ri/orchestrator.ts` or a small wrapper invoked before persona.
- Add a tiny block (always, never conditional):
  ```
  ## CONTEXT SNAPSHOT
  - Project: [name] ([submission type], [status])  — or "NOT LOADED"
  - Active artifact: [title] ([status])  — or "NONE"
  - Memory available: working=[yes/no], semantic atoms=[N]
  - User role: [role]
  ```
- Effect: makes context boundaries explicit. The model sees "Project: NOT LOADED" and stops bluffing.

**F3. Add a "CONTEXT CLARITY PROTOCOL" section to the persona** _(server)_
- File: `server/services/ana-ri/persona.ts` after the existing "when uncertain, say so plainly" line.
- Insert ~6 lines forbidding inference of project metadata when the snapshot says NOT LOADED, mandating an explicit "I don't see X — can you confirm?" instead.
- Effect: stops hallucinated CTD details. Pairs with F2.

**F4. Auto-generate working memory every N messages** _(server)_
- File: `server/routes/chat/send-message.ts` post-response section, plus `server/services/working-memory.ts`'s existing `WORKING_MEMORY_THRESHOLD = 20`.
- Today: `storeWorkingMemory` is only triggered by an explicit `POST /api/concept2cure/conversations/:id/summarize` call, which nobody calls.
- Change: after a response is sent, fire-and-forget `if (needsWorkingMemoryRefresh(threadId)) await buildAndStoreWorkingMemory(...)`. Non-blocking.
- Effect: working-memory layer of `buildMemoryContextForChat` actually starts returning content for return visits to a thread.

**F5. Surface memory diagnostics back into the prompt** _(server)_
- File: `server/services/memory-context-assembler.ts`, around the diagnostics return path.
- Today: when an embedding lookup times out, the layer silently returns `[]`. The model assumes there was no relevant memory — indistinguishable from "memory failed."
- Change: when `diagnostics.layerTimedOut` (a new field) is true, append a short note to the memory block: `[MEMORY NOTE: semantic search timed out — answer from general expertise.]`
- Effect: the model knows when it's flying blind; user sees AnA admit it instead of confidently making things up.

### Tier 2 — speed (still server-only)

**F6. Parallelize pre-AI work** _(server)_
- File: `server/routes/chat/send-message.ts`, around the retrieval / intelligence-prefix / memory section.
- Wrap `searchHybrid()`, `getIntelligencePrefix()`, and `buildMemoryContextForChat()` in `Promise.all`. They are independent.
- Saves: 100–300 ms per request.

**F7. Short-circuit the agentic loop when no tool use occurred** _(server)_
- File: `server/services/claude/ClaudeToolExecutor.ts`, around line 656.
- Today: even when round 1 returns plain text and `toolUses.length === 0`, the loop keeps going until `maxRounds-2`, often producing a wasteful "confirmation" round.
- Change: if `response.toolUses.length === 0` after the first iteration, set `finalResponse = response` and break.
- Saves: 400–800 ms per chat message that needed no tools (probably the majority).

**F8. Pre-warm the AI Gateway on server startup** _(server)_
- File: `server/startup/services.ts` (or wherever services boot).
- Call `ensureGateway()` once at boot.
- Eliminates the 200–500 ms cold-start penalty on the first chat after deploy.

**F9. Batch citation INSERTs into multi-row VALUES** _(server)_
- File: `server/routes/chat/send-message.ts`, retrieval-chunk loop and per-claim citation loop.
- Today: 5 retrieved sources × 1 INSERT each + 5–10 claims × 1–N citations each = ~25–50 sequential round-trips.
- Change: build one `VALUES (…), (…), …` per loop and `RETURNING id` to keep the IDs.
- Saves: 30–80 ms.

**F10. Replace silent `.catch(() => {})` with `.catch(err => console.warn(...))`** _(server)_
- Files: send-message.ts, several places.
- Today: lineage / RIM-intercept / kernel-decision-log failures vanish.
- Effect: same blast radius (still non-blocking) but failures are observable in logs.

### Tier 3 — UI scope (deferred to Claude Design bundle)

**U1. Wire the client chat composer to `/api/chat/stream` (SSE) instead of `/api/chat/send-message`.**
- The streaming endpoint exists and is fully functional. The hook (`useClaudeStream`) exists. **The chat panel just doesn't call it.**
- Effect on perceived latency: drops time-to-first-token from 1–2 s to ~200–400 ms. Largest single win for "feels slow."
- Owner: Claude Design bundle / chat-shell phase. I'm flagging it here so it makes the next bundle cycle.

**U2. Send richer `body.context` from the chat composer** — at minimum `projectId`, `productType`, `activeProject`, `userRole`, and (when in editor) `artifactId`, `artifactTitle`, `sectionCode`.
- Without this, F1 can only fall back to whatever the orchestrator can detect from the message.
- Owner: same as U1.

---

## Suggested execution plan (if you want me to act)

If you approve, here's a concrete two-batch plan I can execute on
`concept2cure-v2` without touching UI:

**Batch A (Tier 1 — context-awareness)**
- F1 + F2 + F3: project/document context plumbing + snapshot preamble + persona update.
- F4: auto-summarize working memory after N messages.
- F5: surface memory diagnostics into the model.
- One commit, one proof report (`docs/reports/ANA_CONTEXT_AWARENESS_FIXES_2026-04-27.md`).
- Test: extend `chat-governed-upload.test.ts` with a "context snapshot is always present" assertion.

**Batch B (Tier 2 — speed)**
- F6: parallelize pre-AI work.
- F7: short-circuit agentic loop on no-tool round 1.
- F8: pre-warm gateway.
- F9: batch citation INSERTs.
- F10: log instead of swallow.
- One commit, one proof report (`docs/reports/ANA_LATENCY_FIXES_2026-04-27.md`).
- Test: add a perf-budget unit test for the agentic-loop short-circuit.

**Tier 3 (U1 + U2)** I'd hand to whoever owns the next chat-shell bundle in
`docs/design/concept2cure-design-system/`. Without those, AnA's response time
will still feel slow even after Batch B because nothing streams.

---

## Confidence in this diagnosis

| Finding | Source | Confidence |
| --- | --- | --- |
| Streaming endpoint unused by client | grep across `client/` | **Very High** |
| Orchestrator never receives `projectContext` | direct read of `send-message.ts` line 313 | **Very High** |
| `intelligencePrefix` returns `''` silently when no orgId | direct read of `lumen-context-builder.ts` line 1946 | **Very High** |
| Working memory auto-write missing | grep — only manual endpoint writes | **Very High** |
| Persona allows context confabulation | direct read of `persona.ts` | **High** |
| Agentic loop runs ≥ 2 rounds on no-tool messages | reading `ClaudeToolExecutor.ts` ~line 718 | **High** |
| Cold-start gateway adds 200–500 ms | `shared.ts` lazy init pattern | Medium (estimated) |

The diagnosis is grounded in code reads, not behavior testing — but the
first four findings are direct structural facts, not opinions.
