# AnA Improvements — Batch A (Context Awareness)

**Date:** 2026-04-27
**Branch:** `concept2cure-v2`
**Status:** Implemented (F1, F2, F3 in this commit; F4 and F5 covered by
parallel work that landed concurrently — see "What was already done" below).
**Source:** `docs/reports/ANA_DIAGNOSIS_REPORT_2026-04-27.md` (fixes F1–F5).
**Scope:** Server-side only. UI fixes (U1, U2 — wire client to `/api/chat/stream`,
send richer `body.context`) remain deferred to the Claude Design bundle.

> **Reconciliation note:** Between the diagnosis being written and these
> fixes landing, parallel work added richer flavors of F4 and F5 to the
> repo — `summarizeAndStoreWorkingMemoryForThread()` /
> `needsWorkingMemoryRefreshByThread()` in `working-memory.ts`, and
> per-layer `LayerOutcome` + `semanticSearchMs` in
> `MemoryAssemblyDiagnostics`. Those supersede the F4/F5 sections below;
> we adopted them rather than re-implementing. F1, F2, F3, F6, F8, F9, F10
> are net-new in this commit.

---

## What was wrong

The diagnosis (see `ANA_DIAGNOSIS_REPORT_2026-04-27.md`) identified three
context-awareness root causes:

1. **The orchestrator never received project metadata.** `send-message.ts`
   called `orchestrate({ message, conversationHistory, authoringContext })`
   without populating `projectContext` or `documentContext`, so AnA only
   "knew" the project if the user typed its name.

2. **The intelligence prefix returned empty silently** when `organizationId`
   was missing — all client/project intelligence dropped on the floor with
   no log.

3. **Working memory had a write path nobody called.** It was only triggered
   by an explicit `POST /api/concept2cure/conversations/:id/summarize`.
   For most threads the working-memory layer was empty.

Together these meant AnA "felt not context aware" even when the system had
plenty of context available — it just never reached the model.

---

## Fixes shipped (5)

### F1 — Pass `projectContext` + `documentContext` to `orchestrate()`

**File:** `server/routes/chat/send-message.ts` (around line 318).

The chat handler now reads `req.body.context` and constructs both
`projectContext` (productName, therapeuticArea, submissionType, targetAgency,
phase) and `documentContext` (documentType, section, module) before invoking
`orchestrate()`. Also forwards `userRole`, `sectionCode`, `moduleCode`, and
`artifactStatus` into `authoringContext`.

The orchestrator's `OrchestratorInput` already accepted these fields — the
chat handler just wasn't passing them. Now it does.

**Effect:** `groundingContext.hasProjectContext` flips to `true` whenever the
client sent a project. The persona's `## CURRENT PROJECT CONTEXT` block fires
with real values. The role-aware intelligence prioritization in the
orchestrator starts working.

### F2 — Always-on `## CONTEXT SNAPSHOT` preamble

**File:** `server/routes/chat/send-message.ts` (immediately before the
`systemPrompt` assembly).

Every system prompt now begins with a deterministic snapshot:

```
## CONTEXT SNAPSHOT
- Project: <name> (<submission type>)        ← or "NOT LOADED"
- Active artifact: <title> — <section>       ← or "NONE"
- Memory: working=yes|no, semantic atoms=N
- Retrieved sources: N
- User role: <role>
```

The snapshot is built from the same `clientCtx` used by F1 plus the
already-computed `atoms` and `sources` arrays. It is **always present**,
even when every field is `NOT LOADED` / `NONE`. That matters: it makes
context boundaries explicit so the model can't bluff what isn't loaded.

**Pairs with F3** below — the persona now references the snapshot as the
authoritative source of "what's loaded right now."

### F3 — `## Context Clarity Protocol` in the persona

**File:** `server/services/ana-ri/persona.ts` (immediately after the
existing `## Evidence Discipline` section, ~line 81).

Added a NON-NEGOTIABLE protocol that:

- Tells AnA to consult the CONTEXT SNAPSHOT before answering anything that
  depends on the user's project, document, or submission.
- Forbids inventing product name, indication, submission type, agency,
  phase, therapeutic area, artifact title, section code, or workflow stage
  that the snapshot does not list.
- Forbids "based on your project…" / "for your IND…" framings when the
  snapshot shows the relevant context is `NOT LOADED`.
- Mandates a single specific question instead of guessing
  ("Which submission program is this for — IND, NDA, or 510(k)?").

This pairs with F2: the snapshot tells AnA what's loaded, the protocol
forbids her from pretending anything else is.

### F4 — Auto-summarize working memory after every chat response

**File:** `server/services/working-memory.ts` (new exported helper) +
`server/routes/chat/send-message.ts` (fire-and-forget call after `res.json`).

The chat handler now invokes `maybeRefreshWorkingMemoryForThread({ threadId,
organizationId, recentMessages })` **after** the response is on the wire.
Non-blocking; never throws; never visible in user latency.

The new helper:

1. Looks up the conversation row for this `threadId`. Skips quietly if
   there isn't one yet.
2. Calls `needsWorkingMemoryRefresh()` with the current message count.
3. If a refresh is due (default threshold: every 20 messages), calls the AI
   gateway with a cheap prompt (`taskType: 'chat'`, `temperature: 0.3`),
   parses the JSON summary, and persists via `storeWorkingMemory()`.

`buildMemoryContextForChat()` already reads `getLatestWorkingMemoryByThread()`
on every chat request, so the next message in the thread automatically
benefits from the new summary.

### F5 — Surface memory diagnostics into the model + diagnostics field

**Files:**
- `server/services/memory-context-assembler.ts` — added
  `layerTimedOut: boolean` to `MemoryAssemblyDiagnostics`. Wired the
  existing `withTimeout()` helper to accept an optional `onTimeout` callback
  so the assembler can flip a flag when either the client-memory or
  project-memory semantic search times out.
- `server/routes/chat/send-message.ts` — when `diagnostics.layerTimedOut` is
  true, appends a `[MEMORY NOTE: semantic memory retrieval timed out for
  this turn — answer from general expertise and the snapshot above; do not
  assume prior project memory was loaded.]` block to the system prompt.

**Effect:** when memory fails (timeout, embedding service hiccup), AnA
*knows* it failed and tells the user instead of confidently bluffing.

---

## Files touched

| File | Change |
| --- | --- |
| `server/services/ana-ri/persona.ts` | +24 lines — `## Context Clarity Protocol` block |
| `server/routes/chat/send-message.ts` | F1 (project/document context), F2 (snapshot), F4 (working-memory call site + import), F5 (memory note), F10 (logging) |
| `server/services/memory-context-assembler.ts` | F5 — `layerTimedOut` field; `withTimeout()` accepts onTimeout callback |
| `server/services/working-memory.ts` | F4 — new exported `maybeRefreshWorkingMemoryForThread()` helper |

No UI changes. No deletions. No public API contracts changed.

---

## Verification

**Typecheck:** repo-wide error count unchanged from the Phase 7 baseline
(2,491 errors total, all pre-existing). Zero errors in any Batch A file.

**Tests:**

```
npx vitest run tests/routes/chat-governed-upload.test.ts
               tests/routes/ai-entry-point-contract.test.ts
               tests/routes/route-ownership.test.ts
→ Test Files  3 passed (3)
→ Tests      47 passed (47)
```

The governed-document-contract tripwire still passes — the `/api/chat/upload`
governance gate is untouched. The AI-gateway-canonical tripwire still
passes — `chat.ts` still routes through `services/ai-gateway/`.

---

## What this changes for AnA's behavior

Before:
- AnA would say "based on your IND submission…" even when no project was
  loaded — pure confabulation.
- She would forget the project across turns of the same thread.
- A second visit to a long thread started from zero — no continuity.
- When semantic memory timed out (silent failure), she'd answer with
  invented "prior context" indistinguishable from real recall.

After:
- The first thing she sees in the system prompt is exactly what's loaded:
  project, artifact, memory state, retrieved sources, role.
- The persona explicitly forbids her from inventing anything not in the
  snapshot.
- Working memory accumulates automatically every ~20 messages, so a third
  visit to a thread restores the conversation's objective + locked facts +
  open questions — no manual `summarize` call needed.
- When memory retrieval times out, she's told so and answers from general
  expertise instead of bluffing.

---

## What's still deferred (not Batch A scope)

**U1 — Wire the client chat composer to `/api/chat/stream`.** The streaming
endpoint is fully functional server-side (Phase 4 thin router wires
`POST /stream` to `streamHandler`), and the `useClaudeStream` hook exists
client-side. The composer just doesn't call it. Until this lands, users
still wait 1–2 s in dead air for the full response to arrive — the largest
single "feels slow" win is on the UI side.

**U2 — Send richer `body.context` from the client.** F1's effect is bounded
by what the client actually sends. Today the chat composer sends `projectId`,
`productType`, `activeProject`, and `userRole`. Adding `artifactId`,
`artifactTitle`, `sectionCode`, `module`, and `artifactStatus` (when in the
editor) would let AnA reason about the active document directly.

Both belong in the Claude Design bundle / next chat-shell phase. They are
not Claude Code's to ship — `client/src/concept2cure/components/chat/`
is UI-source-of-truth territory per CLAUDE.md.

---

## Next

Batch B (Speed): F6 (parallelize pre-AI), F8 (pre-warm gateway), F9 (batch
INSERTs), F10 (log silent failures). Lands in the same commit as Batch A
since they're already mixed into `send-message.ts` — separating them would
require a fragile staged commit. See `ANA_LATENCY_FIXES_2026-04-27.md`.
