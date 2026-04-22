# Phase 4 — Decompose `server/routes/chat.ts`

**Branch:** `concept2cure-v2`
**Date:** 2026-04-22
**Status:** Complete.

## Objective

Break the 1,535-line monolith `server/routes/chat.ts` into focused handler
modules so individual pieces (provenance math, the 9-step RAG pipeline, upload
governance, SSE streaming, thread CRUD, health) can be read, tested, and
changed without loading the whole file into context.

Non-negotiables carried forward from phases 1–3:

- No rewrite — byte-for-byte preservation of handler bodies.
- Governed document contract tripwires must stay green
  (`chat-governed-upload.test.ts`, `ai-entry-point-contract.test.ts`).
- Public `/api/chat/*` URL surface unchanged; AI Gateway still canonical.

## What landed

`server/routes/chat.ts` collapses from **1,535 lines** to **44 lines** — a
thin express `Router` that wires paths to named handlers. The handler bodies
live under `server/routes/chat/`:

| Module | Lines | Exports |
| --- | --- | --- |
| `chat/provenance.ts` | 29 | `sha256`, `stableStringify` |
| `chat/verifier.ts` | 98 | `VerifierFlag`, `verifyClaim`, `VERIFIER_LOW_SCORE_THRESHOLD`, `VERIFIER_LONG_CLAIM_CHARS` |
| `chat/shared.ts` | 32 | `ensureGateway`, `normalizeBody` |
| `chat/send-message.ts` | 853 | `sendMessageHandler` (9-step RAG pipeline) |
| `chat/upload.ts` | 182 | `uploadHandler` (governed file upload) |
| `chat/threads.ts` | 227 | `listThreads`, `listThreadMessages`, `getThread`, `patchThread`, `deleteThread` |
| `chat/stream.ts` | 136 | `streamHandler` (SSE) |
| `chat/health.ts` | 28 | `healthHandler` |
| `chat.ts` (thin router) | 44 | default export: `express.Router` |

Total across the new files: ~1,629 lines — the overhead vs. the original is
doc-comment headers and explicit export declarations; logic lines are
unchanged.

## Route surface (preserved verbatim)

```
POST   /api/chat/send-message   → sendMessageHandler
POST   /api/chat/               → sendMessageHandler   (useChat hook alias)
POST   /api/chat/upload         → uploadHandler
GET    /api/chat/threads        → listThreads
GET    /api/chat/threads/:threadId/messages → listThreadMessages
GET    /api/chat/thread/:threadId  → getThread
PATCH  /api/chat/thread/:threadId  → patchThread
DELETE /api/chat/thread/:threadId  → deleteThread
POST   /api/chat/stream         → streamHandler
GET    /api/chat/health         → healthHandler
```

Mounting stays in `server/bootstrap/register-ai-routes.ts`
(`app.use('/api/chat', chatRoutes)`).

## Surgical changes to bodies

Handler bodies were copied verbatim. Two classes of edits were required only to
make the new file depth work:

1. **Static import paths** shifted from `'../db.js'` /
   `'../services/...'` to `'../../db.js'` / `'../../services/...'` because the
   handler files now live at `server/routes/chat/*.ts` (one level deeper).
2. **Dynamic imports inside `send-message.ts`** shifted similarly:
   - `'../services/decision-lifecycle-service.js'` → `'../../services/...'`
   - `'../services/ind/ind-section-registry.js'` → `'../../services/...'`
   - `'../services/device/device-section-registry.js'` → `'../../services/...'`
   - `'../services/data-lineage-service'` → `'../../services/...'`

No logic, no SQL, no log line, no error code, and no response shape was
changed. Verified by diffing the extracted bodies against lines 191–995 /
1009–1170 / 1177–1377 / 1384–1507 / 1513–1533 of the pre-refactor chat.ts.

## Pre-existing issues surfaced by the extraction

Running `npx tsc --noEmit` on the pre-refactor `chat.ts` (via `git stash`)
reproduced the exact same 10 errors that now appear in the extracted files —
confirming they are pre-existing, not regressions introduced by Phase 4:

- `server/routes/chat.ts(482,7)` → now `send-message.ts(339,7)`:
  `MemoryAssemblyDiagnostics` not assignable to `Record<string, unknown>`.
- `server/routes/chat.ts(976–982)` → now `send-message.ts(833–839)`:
  `orchestratorResult` referenced outside the `try` block where it's declared
  (7 identical errors).
- `server/routes/chat.ts(1239,46)` / `(1275,46)` → now `threads.ts(89,46)` /
  `(125,46)`: `req.query.project_id` is `string | string[]` but passed to
  `pool.query()` params expecting `string`.

Per Karpathy A.3 (surgical changes), these are left untouched in Phase 4 and
should be addressed separately — likely during Phase 7 (tests + truth tables).
Filing them here so they're not lost.

## Contract verification

```
npx vitest run tests/routes/chat-governed-upload.test.ts tests/routes/ai-entry-point-contract.test.ts
→ Test Files  2 passed (2)
→ Tests      34 passed (34)
```

Both tripwires green:

- `chat-governed-upload.test.ts` → `GOVERNED_CONTRACT_INVALID` returns correctly
  when governed context validation fails (router walks `chatRouter.stack` and
  finds the `/upload` POST layer wired to `uploadHandler`).
- `ai-entry-point-contract.test.ts > chat.ts uses the AI gateway` → thin
  `chat.ts` header contains the literal "AI Gateway".

## Callers / importers — unchanged

```
server/bootstrap/register-ai-routes.ts        import chatRoutes from '../routes/chat';
tests/routes/chat-governed-upload.test.ts     import chatRouter from '../../server/routes/chat';
server/__tests__/routes/smoke.test.ts         const chatModule = await import('../../routes/chat');
```

All three still resolve to `server/routes/chat.ts` (the thin router), which
re-exports the same default `Router` instance. No call-site changes needed.

## Governance / invariants

- **Governed document contract unchanged.** `resolveGovernedContext` is still
  invoked from `uploadHandler` (now `chat/upload.ts`) with the identical
  13-field payload. The `GOVERNED_CONTRACT_INVALID` 400 still fires on
  validation failure, with the same `details.errors` / `details.warnings` /
  `details.resolved` shape.
- **AI gateway canonical.** `chat/send-message.ts` and `chat/stream.ts` both
  route through `ensureGateway()` from `chat/shared.ts`, which wraps
  `server/services/ai-gateway/index.js`'s `getGateway()`. No direct Anthropic
  or OpenAI SDK calls added.
- **Provenance chain preserved.** `ai_threads`, `ai_messages`,
  `ai_retrieval_runs`, `ai_retrieval_chunks`, `ai_generation_runs`,
  `ai_claims`, and `ai_claim_citations` are written with identical column
  lists. Hash inputs (`sha256`, `stableStringify`) moved but kept bit-exact.
- **Interceptors still non-blocking.** `interceptChatResponse`,
  `processResponseActions`, `recordLineageBatch`, and
  `recordKernelPolicyOutcome` stay fire-and-forget (`void` / `.catch(() => {})`)
  in exactly the same positions.

## Files preserved unchanged

Per the consolidation master's "Files preserved" list:

- `server/services/concept2cure/governedDocumentContractService.ts` — not touched
- `server/services/ai-gateway/gateway.ts` — not touched
- `server/src/control-plane/kernel.ts` — not touched
- `tests/routes/ai-entry-point-contract.test.ts` — not touched
- `tests/routes/chat-governed-upload.test.ts` — not touched

## Next

Phase 5: decompose `client/src/concept2cure/components/workflow/ProjectWorkspaceShell.tsx`.
