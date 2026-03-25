# QA Combined Findings Report — 2026-03-25

**Agents**: Frontend UX, Backend, Document Generation
**Scope**: AnA RI system (routes, services, UI components, document generation pipeline)
**Files audited**: ~15 source files across `server/routes/ana-ri.ts`, `server/services/ana-ri/*`, `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, `server/services/ana-guidance-executor.ts`

---

## CRITICAL Findings (must fix)

### C-1. Runtime import of TypeScript interface — will fail at runtime
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, line 1043
- **Description**: `const { CommandContext } = await import('../services/ana-ri/command-executor.js')` attempts to destructure a TypeScript `interface` at runtime. Interfaces are erased during compilation and do not exist as runtime values. This line either throws or silently assigns `undefined`.
- **Impact**: The `/execute` endpoint may fail or behave unpredictably. The `CommandContext` destructured value is never used (line 1044 re-imports the entire module as `executor` and the `ctx` object on line 1046 is constructed inline), so this is a dead import that could throw.
- **Fix**: Remove line 1043 entirely. The `executor` import on line 1044 already provides everything needed. If the type is needed, use a static `import type { CommandContext }` at the top of the file.

### C-2. `loadConversationHistory` catch block returns `success: true` on failure
- **Agent**: Backend
- **File**: `server/services/ana-ri/command-executor.ts`, line 589
- **Description**: The catch block of `loadConversationHistory()` returns `{ success: true, ... }` instead of `{ success: false, ... }`. This masks database errors as successful responses with empty data.
- **Impact**: The caller (AnA chat) cannot distinguish between "no conversations exist" and "the database query failed." This violates the "no silent failures" rule and makes debugging impossible.
- **Fix**: Change `success: true` to `success: false` in the catch block, or at minimum add a `degraded: true` flag to the response data.

### C-3. Raw `res.json()` bypasses response envelope in `/generate` endpoint
- **Agent**: Frontend UX
- **File**: `server/routes/ana-ri.ts`, lines 866-868
- **Description**: The `conversation_context` validation error returns `res.status(400).json({ error: '...' })` directly, bypassing the `sendError()` envelope helper defined at line 67. This is the only raw response in the `/generate` endpoint — all other error paths in the same handler correctly use `sendError()`.
- **Impact**: Frontend code that expects `{ success: false, error: { message } }` envelope will fail to parse this error. Inconsistent error format across the same endpoint.
- **Fix**: Replace with `return sendError(res, 400, 'conversation_context is required', null, 'INVALID_CONTEXT');`

---

## HIGH Findings (should fix)

### H-1. Duplicated auth header construction in AnaPersistentPanel (raw `fetch`)
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, lines 593-606 and 750-762
- **Description**: Two raw `fetch()` calls (SSE streaming and file upload) manually construct auth headers from `localStorage`. This duplicates the auth logic that `apiRequest()` centralizes. Comments document the justification (AbortController + SSE and multipart form), which are valid reasons.
- **Impact**: If auth token storage changes (key name, format, storage mechanism), these two locations will break while `apiRequest()` continues to work. Security surface area is increased.
- **Fix**: Extract a shared `getAuthHeaders()` utility function (e.g., in `@/lib/auth-headers.ts`) that both these call sites and `apiRequest()` can share. This preserves the raw `fetch()` for SSE/multipart while centralizing the auth logic.

### H-2. `as any` cast hides type safety in stream orchestration
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, line 548
- **Description**: `submissionType: submission_type as any` bypasses the `SubmissionType` type guard. The `/chat` endpoint (line 176) correctly casts as `SubmissionType | undefined`, but the `/stream` endpoint uses `as any`.
- **Impact**: Invalid submission types passed to the stream endpoint will not be caught by the type system, potentially causing silent misbehavior in the orchestrator.
- **Fix**: Change to `submissionType: submission_type as SubmissionType | undefined` to match the `/chat` endpoint pattern.

### H-3. Duplicate validation logic between `/chat` and `/stream` endpoints
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, lines 87-284 vs 475-786
- **Description**: The `/chat` and `/stream` endpoints duplicate ~200 lines of identical validation, orchestration, context building, memory loading, enrichment, and history resolution logic. The `/stream` endpoint is a near-copy of `/chat` with SSE output bolted on.
- **Impact**: Bug fixes applied to one endpoint may not be applied to the other. The `/chat` endpoint includes authoring context fields like `artifactVersionId`, `readiness`, and `contradictions` that `/stream` omits (lines 146-166 vs 530-538). This means streaming responses lack full authoring context.
- **Fix**: Extract shared middleware or a `buildChatContext()` function that both endpoints call. This eliminates the drift risk.

### H-4. Empty catch blocks hide errors throughout AnaPersistentPanel
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, lines 491, 699, 796, 827, 849, 875, 895, 915, 951, 974, 995
- **Description**: Multiple empty `catch {}` blocks silently swallow errors. While some are legitimate graceful degradation (SSE parse errors, suggested action fallbacks), none include comments explaining the intent.
- **Impact**: When debugging production issues, these silent catch blocks make it impossible to determine where errors are being swallowed. Violates the "no silent failures" rule.
- **Fix**: Add explanatory comments to each catch block. For the SSE parse errors (491, 699): `// Ignore malformed SSE chunks — expected during streaming`. For suggested action handlers (827+): add a single comment block: "All suggested action handlers fall back to natural language when API fails."

### H-5. `executedActions` and `executedCommands` typed as `any[]`
- **Agent**: Backend / Frontend UX
- **File**: `server/routes/ana-ri.ts`, line 729 and line 746; `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, line 93
- **Description**: `executedActions: any[]` and `executedCommands: any[]` lose all type safety. The types `AnaActionResult` and `CommandResult` exist and should be used.
- **Impact**: No compile-time checking on the shape of executed actions flowing from backend to frontend.
- **Fix**: Type as `AnaActionResult[]` and `CommandResult[]` respectively.

---

## MEDIUM Findings (nice to fix)

### M-1. `threadId` variable shadowing creates confusing control flow
- **Agent**: Frontend UX
- **File**: `server/routes/ana-ri.ts`, line 318
- **Description**: `let threadId = thread_id` shadows the destructured `thread_id` from `req.body`. The variable is then conditionally reassigned at line 323. This creates two names for the same concept in the same scope.
- **Fix**: Rename to `let resolvedThreadId` for clarity.

### M-2. `catch (err: any)` used throughout command-executor.ts
- **Agent**: Backend
- **File**: `server/services/ana-ri/command-executor.ts`, lines 73, 96, 137, 195, 233, 260, 289, 326, 366, 411, 443, 492, 547, 588, 625, 667, 699, 760, 788, 821
- **Description**: Every function uses `catch (err: any)` instead of `catch (err: unknown)` with type narrowing. TypeScript best practice is `unknown` + `instanceof Error`.
- **Fix**: Use `catch (err: unknown)` and narrow with `err instanceof Error ? err.message : String(err)`.

### M-3. `(req as any).tenantId` / `(req as any).userId` used repeatedly
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, lines 124-125, 508-509, 875-876, 1036-1037
- **Description**: Tenant and user context are extracted via `as any` casts in 4 different places in the same file. This should use a typed middleware augmentation or a shared extraction function.
- **Fix**: Define `interface AuthenticatedRequest extends Request { tenantId: number; userId: number; }` or use the existing request augmentation type.

### M-4. Manual `.json()` call on `apiRequest` result
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, lines 310-334
- **Description**: `apiRequest('GET', ...).then(r => r.json())` — uses `apiRequest` but manually parses JSON, and the catch block on line 332 is silent.
- **Fix**: Use `apiRequest`'s built-in JSON parsing if available, and add `toast({ variant: 'destructive' })` in the catch.

### M-5. `/stream` endpoint uses `res.writeHead()` before validation is complete
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, line 500
- **Description**: SSE headers are set at line 500, but significant async work (orchestration, memory loading, enrichment, history resolution) follows before any data is written. If any of those throw, the catch block at line 777 checks `res.headersSent` and sends an SSE error event — but the HTTP status code is already committed as 200.
- **Impact**: Clients cannot use HTTP status codes to detect failures on the stream endpoint. All errors arrive as 200 + SSE error event.
- **Fix**: Move `res.writeHead()` to after the context building phase (before line 655 where the first `res.write` occurs). This allows pre-stream failures to return proper HTTP error codes.

### M-6. Authoring context block construction is duplicated
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, lines 138-167 (chat) vs 527-538 (stream)
- **Description**: The `/chat` endpoint constructs a richer authoring context block (includes `artifactVersionId`, `readiness` with blockers, `contradictions`) while `/stream` constructs a simpler version (missing those fields). This means the AI receives different context depending on whether the user is using streaming or non-streaming mode.
- **Fix**: Extract a `buildAuthoringContextBlock(authoring_context)` helper and use it in both endpoints.

### M-7. `e: any` catch pattern in gateway initialization
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, line 76
- **Description**: `catch (e: any)` should use `unknown`.
- **Fix**: `catch (e: unknown)` with `e instanceof Error ? e.message : String(e)`.

### M-8. Context enrichment catch blocks swallow errors silently
- **Agent**: Backend
- **File**: `server/services/ana-ri/context-enrichment.ts`, lines 169, 293
- **Description**: Empty `catch {}` blocks in `enrichWithProjectMemory` and `enrichWithClaims` silently return empty strings. While non-blocking enrichment is correct design, there is no observability into enrichment failures.
- **Fix**: Add `console.warn('[enrichment] ...failed:', err?.message)` similar to the pattern used in `enrichWithReadiness` (line 219).

### M-9. `processCommandsInResponse` may execute unintended commands
- **Agent**: Document Generation
- **File**: `server/services/ana-ri/command-executor.ts` (the `processCommandsInResponse` function, called from `server/routes/ana-ri.ts` line 754)
- **Description**: The AI response text is scanned for command patterns and auto-executed. Combined with the guidance executor (line 732), a single streaming response could trigger both guidance actions AND operational commands simultaneously.
- **Impact**: If the AI mentions creating a project in its natural language response and the command detection regex matches, it could auto-create real database records the user didn't request.
- **Fix**: Ensure command detection requires structured blocks (like ````ana-command` fences, similar to how guidance executor uses ````ana-action` blocks) rather than natural language pattern matching. Review the `processCommandsInResponse` implementation for false-positive risk.

### M-10. Document routing regex patterns may produce false positives
- **Agent**: Document Generation
- **File**: `server/services/ana-ri/document-routing.ts`, lines 30-96
- **Description**: Several patterns are overly broad. For example, `/\b(?:csr|clinical study report)\b/i` will match any mention of "CSR" even in casual conversation ("the CSR team reviewed..."). Similarly `/\b(?:toc|1\.2)\b/i` matches the number "1.2" in any context.
- **Impact**: Users discussing documents in conversation may trigger incorrect document type detection, leading to wrong generation templates.
- **Fix**: Consider requiring longer context matches or combining with intent detection before triggering document generation.

### M-11. Artifact generator uses `gateway.chat()` instead of `gateway.route()`
- **Agent**: Document Generation
- **File**: `server/services/ana-ri/artifact-generator.ts`, line 445
- **Description**: The artifact generator calls `gateway.chat()` directly while the `/chat` and `/stream` endpoints use `gateway.route()`. The `route()` method includes kernel routing, strategy selection, and policy enforcement. The `chat()` method may bypass these governance layers.
- **Impact**: Artifact generation may not benefit from kernel routing decisions, adaptive policy, or optimal provider selection.
- **Fix**: Consider whether artifact generation should use `gateway.route()` with `taskType: 'document_drafting'` to benefit from the same routing intelligence.

---

## LOW Findings (optional)

### L-1. `executedActions?: any[]` on AnaMessage interface
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, line 93
- **Fix**: Define `ExecutedAction` type.

### L-2. `catch (err: any)` should be `catch (err: unknown)` throughout
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, line 707
- **Fix**: `catch (err: unknown)` + `instanceof Error` narrowing.

### L-3. Silent catch in `/decisions` API call
- **Agent**: Frontend UX
- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, lines 429-431
- **Description**: Shows inline message but no toast. Acceptable as inline fallback exists.
- **Fix**: Consider adding toast for consistency.

### L-4. `updateProject` dynamic SET clause construction
- **Agent**: Frontend UX
- **File**: `server/services/ana-ri/command-executor.ts`, line 128
- **Description**: Builds SQL SET clause from `setClauses.join(', ')`. Column names come from allowlist, values are parameterized. Safe pattern.
- **Fix**: No action needed — noted for awareness.

### L-5. `searchArtifacts` ILIKE fallback uses string interpolation
- **Agent**: Frontend UX
- **File**: `server/services/ana-ri/command-executor.ts`, line 751
- **Description**: `%${params.query}%` is passed as a parameterized value, not injected into the query string. Safe.
- **Fix**: No action needed — noted for awareness.

### L-6. `persona.ts` and `workflow-orchestration.ts` — clean, no violations
- **Agent**: Frontend UX / Document Generation
- **Files**: `server/services/ana-ri/persona.ts`, `server/services/ana-ri/workflow-orchestration.ts`
- **Description**: Pure data/config files with well-typed exports. No API calls, no SQL, no UI.
- **Fix**: None needed. Pass.

### L-7. Duplicate VALID_LENSES and VALID_ROLES arrays across endpoints
- **Agent**: Backend
- **File**: `server/routes/ana-ri.ts`, lines 106+111 vs 511+515
- **Description**: Same validation arrays duplicated in `/chat` and `/stream`.
- **Fix**: Extract to module-level constants.

### L-8. `listTasks` sorts by 'critical' priority but createTask uses 'urgent' as max priority
- **Agent**: Backend
- **File**: `server/services/ana-ri/command-executor.ts`, line 434 vs line 343
- **Description**: The `listTasks` ORDER BY sorts `'critical'` first, but `createTask` type allows `'urgent'` as the highest priority. These are different values — queries sorting by 'critical' may not correctly prioritize 'urgent' tasks.
- **Fix**: Align the priority enum. Add 'urgent' to the CASE expression in `listTasks`, or change the `createTask` type to use 'critical' instead of 'urgent'.

### L-9. CSS audit — no violations
- **Agent**: Frontend UX
- **File**: `client/src/index.css` (`.ana-response` styles)
- **Description**: Supports chat-first design correctly.
- **Fix**: None needed. Pass.

---

## BIGGER IDEAS (cross-cutting improvements from all 3 agents)

### B-1. Extract shared chat context builder
- **Agents**: Backend + Frontend UX
- **Description**: The `/chat` and `/stream` endpoints share ~200 lines of duplicated orchestration logic (validation, context building, memory loading, enrichment, history resolution, authoring context construction). This is the single largest source of drift risk in the codebase. Extract a `buildAnaChatContext(req)` function that returns the fully assembled system prompt, messages array, routing plan, and orchestration metadata.
- **Impact**: Eliminates duplicate code, prevents feature drift between streaming and non-streaming modes, and makes the endpoints ~50 lines each instead of ~300.

### B-2. Unified response envelope enforcement
- **Agents**: Frontend UX + Backend
- **Description**: While `sendSuccess()` and `sendError()` helpers exist in `ana-ri.ts`, the `/generate` endpoint has one spot (line 866) that bypasses them. Consider adding a linting rule or middleware that rejects raw `res.json()` calls in route files. Alternatively, wrap the router with an envelope middleware that automatically formats responses.
- **Impact**: Guarantees consistent API contracts for the frontend, eliminates an entire category of bugs.

### B-3. Command executor safety layer
- **Agents**: Document Generation + Backend
- **Description**: The auto-execution path (guidance executor + command executor running on every streaming response) should have a unified safety coordinator. Currently, both `processResponseActions()` and `processCommandsInResponse()` run independently on the same response text. A single `processStreamResponse()` function could coordinate, deduplicate, and enforce limits across both systems.
- **Impact**: Prevents double-execution of similar actions, provides a single audit point for all auto-executed operations.

### B-4. Typed request augmentation
- **Agents**: Backend
- **Description**: Replace all `(req as any).tenantId` / `(req as any).userId` patterns with a typed `AuthenticatedRequest` interface. This is used in 4+ places in `ana-ri.ts` alone and likely dozens more across the codebase.
- **Impact**: Compile-time safety for tenant scoping — critical in a multi-tenant regulatory platform.

### B-5. Document routing confidence scoring
- **Agents**: Document Generation
- **Description**: The current document routing (`document-routing.ts`) returns the first regex match. For ambiguous inputs, it should return a confidence score and let the caller decide whether to proceed. This would prevent false-positive document type detection when users casually mention document terms.
- **Impact**: Reduces incorrect artifact generation triggers, improves user trust.

### B-6. Observability for enrichment pipeline
- **Agents**: Backend + Document Generation
- **Description**: The context enrichment layer (`context-enrichment.ts`) silently fails when individual enrichment sources error. Adding structured logging (enrichment source, latency, success/failure, data size) would enable monitoring enrichment health and detecting degraded AI responses caused by missing context.
- **Impact**: Operational visibility into AI response quality drivers.

---

## Summary Table

| Severity | Count | Top Files |
|----------|-------|-----------|
| CRITICAL | 3 | `ana-ri.ts`, `command-executor.ts` |
| HIGH | 5 | `ana-ri.ts`, `AnaPersistentPanel.tsx` |
| MEDIUM | 11 | `ana-ri.ts`, `command-executor.ts`, `context-enrichment.ts`, `document-routing.ts`, `artifact-generator.ts` |
| LOW | 9 | Various |
| BIGGER IDEAS | 6 | Cross-cutting |
| **TOTAL** | **34** | |

---

## Chat-First Design Compliance (from Frontend UX agent)

| Check | Status |
|-------|--------|
| No new UI surfaces created | PASS |
| All features accessible through chat | PASS |
| Results render as inline markdown | PASS |
| Intelligence feels ambient | PASS |
| Workflow guidance through chat | PASS |

The architecture is strongly chat-first compliant. All findings are implementation-level (code quality, type safety, error handling) rather than architectural.

---

*Generated by QA Agent consolidation — 2026-03-25*
*Source agent outputs: a02b6fb9 (Frontend UX), ad4e451f (Backend), a659e7e2 (Document Generation)*
