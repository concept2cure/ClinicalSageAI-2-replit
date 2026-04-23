# AnA Responsiveness & Context-Awareness Audit

**Date:** 2026-04-22
**Scope:** End-to-end message pipeline — `AnaPersistentPanel` → `/api/ana-ri/*` → memory/intelligence assembly → AI gateway → response
**User complaint:** "not context aware at all... has never worked" — slow, unresponsive, oblivious to what user is looking at.

---

## TL;DR

Three root causes explain every symptom:

1. **Standard chat mode doesn't stream.** The server has a working SSE endpoint (`/api/ana-ri/stream`) and Deep Research mode uses it, but the default "standard" path in `AnaPersistentPanel.tsx:1560` calls the non-streaming `/api/ana-ri/chat` and waits for the full JSON. Users stare at a spinner for the entire LLM latency.
2. **Authoring context only arrives if the parent component wires a callback.** If the parent doesn't call `onAuthoringContextChange`, AnA gets zero awareness of the current section/artifact/project — every message is a cold start.
3. **Post-processing (guidance + command executors) blocks the response.** AI finishes in 2s, but the handler runs artifact creation and command execution before `sendSuccess()`, adding 2–5s before the client sees anything.

Every fix is **S/M effort**, no architecture change.

---

## A. Hot path (user message → response)

1. `AnaPersistentPanel.tsx:1560` — `fetch('/api/ana-ri/chat', POST)`, waits for full JSON.
2. `server/routes/ana-ri.ts:194` — `router.post('/chat')` handler.
3. `ana-ri.ts:403` — `Promise.all([intelligence, memory, enrichment])` context assembly (parallel, good).
4. `ana-ri.ts:374` — `orchestrate()` detects intent/role/submission type.
5. `ana-ri.ts:388-400` — authoring context injected into system prompt (only if client passed it).
6. `ana-ri.ts:436-461` — thread history (server last 20, else client last 10).
7. `ana-ri.ts:502` — `gw.route()` to Claude/GPT/Kimi — **full response, not streaming**.
8. `ana-ri.ts:515-649` — guidance executor, command executor (awaited, blocks response).
9. `ana-ri.ts:660, 673` — RIM intercept + evidence validation (unawaited fire-and-forget, but no `.catch`).
10. `ana-ri.ts:677-683` — persist assistant message.
11. `ana-ri.ts:686-760` — `sendSuccess()` with envelope.

## B. Streaming status

- Server streaming: **implemented** (`ana-ri.ts:769, 980-1003, 1032-1040`) — SSE headers, `stream: true`, `onStream` callback.
- Frontend streaming: **standard mode does not use it.** Deep Research mode does (`AnaPersistentPanel.tsx:1309` `new EventSource`).
- Net effect: perceived latency = total LLM latency + post-processing. Token streaming would make 10–30s responses feel "instant."

## C. Context assembly — what's loaded, what's lost

### Loaded per message (reaches the LLM)
| Source | File | Size | Notes |
|---|---|---|---|
| Authoring context (XML) | `req.body.authoring_context` | ~500B | Only if client wired it |
| Section guidance | `lumen-context-builder.ts` | ~2KB | Only with `sectionCode` |
| Intelligence prefix | `buildClient/ProjectIntelligenceContext` | ~3–5KB | Errors swallowed (line 404-406) |
| Wisdom context | `lumen-context-builder.ts:1956-1968` | ~1KB | Risks, lessons, patterns |
| Memory context | `memory-context-assembler.ts:207` | ≤3.5KB | 4 per layer, deduped, **10s silent timeout per layer** |
| Thread history | `getThreadMessages` | last 20 | Fallback to client's last 10 |

### NOT loaded (context loss)
- **Current route/screen** — `context.screenName` is used only for role inference, never injected into the prompt.
- **Current artifact state** — present in XML if passed, but no status-specific guidance.
- **User preferences** — never loaded; no per-role personalization.
- **Recent project changes / failed review notes / competitive/predicate context** — none of it.

### Silent failure modes
1. Memory semantic search — 10s timeout per layer → empty fallback, no warning (`memory-context-assembler.ts:232-262`).
2. Intelligence prefix errors swallowed (`ana-ri.ts:404-406`).
3. Thread persistence failure flags `persistenceFailed = true` internally but client never learns (`ana-ri.ts:530-542, 677-683`).
4. Cortex fallback (`AnaPersistentPanel.tsx:1584-1632`) sends a much smaller payload — no memory, no intelligence, no authoring context — and user can't tell.

## D. Top 8 problems (ranked by user-perceived impact)

| # | Problem | File:Line | Effort |
|---|---|---|---|
| 1 | No token streaming in standard mode | `AnaPersistentPanel.tsx:1560` | **S** (2–4h) |
| 2 | Authoring context requires explicit parent wiring | `AnaPersistentPanel.tsx:19-22, 1505-1550` | **M** (4–8h) |
| 3 | Memory search 10s silent timeout | `memory-context-assembler.ts:232-262` | **M** (3–6h) |
| 4 | Guidance/command executors block response | `ana-ri.ts:603-648` | **S** (2–4h) |
| 5 | First token waits for full `Promise.all` context assembly | `ana-ri.ts:403` | **M** (6–10h) |
| 6 | RIM + evidence validation unawaited but uncaught, DB pressure | `ana-ri.ts:660, 673` | **S** (1–2h) |
| 7 | Thread persistence fails silently | `ana-ri.ts:530-542, 677-683` | **S** (1–2h) |
| 8 | Cortex fallback loses orchestration silently | `AnaPersistentPanel.tsx:1584-1632` | **S** (1–2h) |

## E. Top 3 quick wins (<1 day each)

### 1. Switch standard mode to `/api/ana-ri/stream`
- **Change:** In `AnaPersistentPanel.tsx:1560`, replace `fetch('/api/ana-ri/chat')` with an SSE consumer, render tokens as they arrive.
- **Why:** Biggest perceived-latency win. Server is already battle-tested by Deep Research mode.
- **Risk:** Low.

### 2. Auto-derive authoring context from route
- **Change:** Extract `projectId`, `sectionCode`, `artifactId` from the current URL/route inside `AnaPersistentPanel` instead of relying on `onAuthoringContextChange` prop.
- **Why:** AnA becomes context-aware by default. Addresses user's core complaint directly.
- **Risk:** Low — empty fallback when route has no artifact.

### 3. Move post-processing to fire-and-forget
- **Change:** Wrap guidance + command executors (`ana-ri.ts:603-648`) in `.catch()` and don't `await` them before `sendSuccess()`. Notify user of results via the existing thread or a WebSocket event.
- **Why:** Drops 2–5s from response. No data loss — these are already side-effects.
- **Risk:** Low — need to surface async results (toast/badge) so user knows artifacts/commands completed.

---

## Not proposed

- No rewrite. No new architecture. No new services. All fixes are inside existing files.
- Not touching the persona routing or RIM pipeline beyond wrapping unawaited calls in `.catch()`.
