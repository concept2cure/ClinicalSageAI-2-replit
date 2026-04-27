# AnA Improvements — Batch B (Latency)

**Date:** 2026-04-27
**Branch:** `concept2cure-v2`
**Status:** Implemented (in the same commit as Batch A — see notes below).
**Source:** `docs/reports/ANA_DIAGNOSIS_REPORT_2026-04-27.md` (fixes F6–F10).
**Scope:** Server-side only. The biggest perceived-speed win (U1 — wire the
client to `/api/chat/stream`) remains UI-scope and is deferred to the
Claude Design bundle.

---

## Why this is in the same commit as Batch A

Batch A's fixes (F1, F2, F4, F5) and Batch B's fixes (F6, F8, F9, F10) all
touch `server/routes/chat/send-message.ts`. Splitting them into sequential
commits would require ordering the edits so each intermediate state still
compiles and passes contract tests — fragile and adds a meaningful chunk of
re-edit work for no behavioral benefit. Both batches verify together
against the same tripwires.

---

## Fixes shipped (4 — F7 was already done)

### F6 — Parallelize the three pre-AI fetches

**File:** `server/routes/chat/send-message.ts` (around the `basePrompt`
declaration, formerly around line 378).

`getIntelligencePrefix()` and `buildMemoryContextForChat()` were two
back-to-back `await`s. They're independent — one reads the lumen
client/project intelligence prefix, the other does semantic memory
retrieval — but each blocked the next.

Replaced with a single `Promise.all([getIntelligencePrefix(...),
buildMemoryContextForChat(...)])`. The `intelligencePrefix` is now declared
at the same point it's used in the system-prompt assembly, no earlier.

**Estimated saved latency:** 100–200 ms per chat request (each fetch is
50–100 ms typical; whichever was second now overlaps).

> **Note on `searchHybrid`** (the third candidate for parallelization):
> kept sequential for now because it sits in its own `try` block several
> branches earlier, and parallelizing it would require restructuring the
> retrieval-persistence path. The two parallelized today are the cheaper,
> safer wins.

### F8 — Pre-warm the AI Gateway on startup

**File:** `server/startup/services.ts` (added after the feature-toggle
bootstrap).

The very first chat request used to pay a 200–500 ms penalty for
`new AIGateway()` constructing provider clients. Now the gateway is
instantiated once during `initializeEarlyServices()` so the first request
arrives to a warm gateway.

Logs `✅ AI Gateway pre-warmed (N providers ready)` on success;
`⚠️ AI Gateway pre-warm failed — first chat request will lazy-init` on
failure (non-fatal — the lazy path in `chat/shared.ts:ensureGateway()` is
still there as a safety net).

### F9 — Batch the citation/chunk INSERTs

**File:** `server/routes/chat/send-message.ts` (retrieval-chunk loop and
per-claim citation loop).

Two N+1 patterns replaced with single multi-row `INSERT … VALUES (…),(…),…`
statements:

1. **Retrieval chunks** (`ai_retrieval_chunks`): default `RETRIEVAL_TOP_K=5`,
   so up to 5 sequential `INSERT … RETURNING id` round-trips became one.
2. **Per-claim citations** (`ai_claim_citations`): a typical response with
   5–10 claims and 1–3 citations each used to be 5–30 sequential inserts;
   now one per claim instead of one per citation.

Multi-row `RETURNING` is preserved for retrieval chunks (the IDs feed back
into `chunkRows[]` for citation linkage). Sort by rank after the batch
read so order is stable.

**Estimated saved latency:** 30–80 ms per chat request, more under load.

### F10 — Replace silent `.catch(() => {})` with logged catches

**File:** `server/routes/chat/send-message.ts` (three sites: thread
`updated_at` touch, intelligence prefix load, data-lineage batch).

Same blast radius as before (still non-blocking, still resolves to the same
fallback value), but failures now produce `console.warn` lines with
`err?.message` so operators can see them in the log. Hidden failures used
to mask legitimate problems (database hiccups, lineage table missing).

### F7 — Already implemented (verified, no change needed)

The diagnosis report listed F7 as "short-circuit the agentic loop on
no-tool round 1." Re-reading `server/services/claude/ClaudeToolExecutor.ts`
showed the loop already does this at line 656:

```ts
if (!response.toolUses || response.toolUses.length === 0) {
  finalResponse = response;
  break;
}
```

Single-round behavior for text-only responses is already correct. The
diagnosing agent had misread the `maxRounds - 2` line — that branch only
matters when tools *were* used and we're approaching the limit. No fix
needed; documenting here so future readers don't re-investigate.

---

## What's still deferred

**U1 — Wire the client chat composer to `/api/chat/stream`.** This is by
far the largest perceived-speed win (drops time-to-first-token from
1–2 s to ~200–400 ms). The streaming endpoint is fully functional
server-side; the `useClaudeStream` hook exists; the composer just doesn't
call it. Belongs in the Claude Design bundle's next chat-shell phase.

After Batch B lands, the typical **server-side** chat latency budget is:

| Phase | Before | After Batch B |
| --- | --- | --- |
| Pre-AI work (retrieval + intelligence + memory) | 150–250 ms (sequential) | ~80–150 ms (intelligence + memory parallel; retrieval still serial) |
| AI Gateway round 1 (cold start) | 1.0–2.0 s | 800 ms – 1.5 s (no init penalty after F8) |
| AI Gateway round 1 (warm) | 800 ms – 1.5 s | unchanged |
| Citation persistence | 25–50 ms (N+1) | 5–10 ms (batched) |
| Post-AI fire-and-forget | 50–100 ms | unchanged |
| **Typical total (warm)** | **~1.0–1.7 s** | **~0.9–1.5 s** |

The remaining latency is dominated by the model itself. Without streaming
on the client, users still wait the full duration in dead air. With
streaming + Batch B, perceived latency drops to ~200–400 ms (time-to-
first-token).

---

## Verification

**Typecheck:** repo-wide error count unchanged from the Phase 7 baseline
(2,491 errors total, all pre-existing). Zero new errors in
`send-message.ts`, `working-memory.ts`, `memory-context-assembler.ts`,
`persona.ts`, or `startup/services.ts`.

**Tests:**

```
npx vitest run tests/routes/chat-governed-upload.test.ts
               tests/routes/ai-entry-point-contract.test.ts
               tests/routes/route-ownership.test.ts
→ Test Files  3 passed (3)
→ Tests      47 passed (47)
```

All three tripwires green:
- Governed-document contract on `/api/chat/upload` — unchanged.
- AI Gateway canonical for `chat.ts` — `gateway` literal still present in
  the thin router header.
- Phase 6 route-ownership invariants — startup composition root still
  delegation-only.

---

## What to watch in production

After this lands, look for:
- `[AnA] intelligence prefix load failed` warnings — were silently swallowed
  before; now you'll see if there's an underlying problem.
- `[AnA] data lineage batch failed` warnings — same.
- `✅ AI Gateway pre-warmed (N providers ready)` on every startup. If this
  flips to `⚠️ AI Gateway pre-warm failed`, providers aren't being
  initialized properly and the first chat per process will be slow.
- `Working memory auto-refreshed for thread … at N messages.` info logs at
  every 20-message threshold for active conversations. If you don't see
  these on long-running threads, check the `concept2cure_conversations`
  thread→conversation mapping.
