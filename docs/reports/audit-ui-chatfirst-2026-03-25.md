# Audit Report: UI Standards & Chat-First Design Compliance

**Date:** 2026-03-25
**Audited against:** `.claude/skills/ui-standards.md`, `.claude/skills/chat-first-design.md`
**Auditor:** Claude Code automated audit

---

## Summary

10 files audited. **27 findings** total: 5 high, 13 medium, 9 low.

The architecture is strongly chat-first compliant — all features route through AnA, results render inline as markdown, and no new UI surfaces are introduced. The main violations are around backend response envelopes (raw `res.json()` instead of `sendSuccess()`/`sendError()`), raw `fetch()` usage without the `apiRequest()` wrapper, empty catch blocks, and a few `any` types.

---

## Findings

| # | File | Line(s) | Rule | Severity | Issue | Fix |
|---|------|---------|------|----------|-------|-----|
| 1 | `AnaPersistentPanel.tsx` | 93 | TypeScript | LOW | `executedActions?: any[]` — untyped array on `AnaMessage` interface | Define a proper `ExecutedAction` type |
| 2 | `AnaPersistentPanel.tsx` | 310-334 | ui-standards | MEDIUM | `apiRequest('GET', ...).then(r => r.json())` — uses `apiRequest` but calls `.json()` manually and catch block on line 332 is silent (no toast, no error state) | Add `toast({ variant: 'destructive' })` in the `.catch()` or comment justifying silence |
| 3 | `AnaPersistentPanel.tsx` | 429-431 | ui-standards | LOW | `/decisions` catch block is silent — shows inline message but no toast | Acceptable as a fallback message is shown inline; consider adding toast for consistency |
| 4 | `AnaPersistentPanel.tsx` | 491 | ui-standards | MEDIUM | Empty `catch {}` in SSE `onmessage` handler — silently swallows JSON parse errors | Add comment: `// Ignore malformed SSE chunks` |
| 5 | `AnaPersistentPanel.tsx` | 593-606 | ui-standards | HIGH | Raw `fetch('/api/ana-ri/stream', ...)` with manual `localStorage` header construction instead of `apiRequest()`. Comment on line 590-592 explains why (AbortController + SSE), but this duplicates auth logic. | Documented exception acceptable for SSE streaming, but the auth header construction (lines 593-601) should be extracted to a shared helper to avoid duplicating `localStorage` key logic |
| 6 | `AnaPersistentPanel.tsx` | 699 | ui-standards | MEDIUM | Empty `catch {}` inside SSE line parser — silently ignores parse failures | Add comment: `// Ignore malformed SSE data lines` |
| 7 | `AnaPersistentPanel.tsx` | 707 | TypeScript | LOW | `catch (err: any)` — could use `catch (err: unknown)` with type narrowing | Use `unknown` and narrow with `instanceof Error` |
| 8 | `AnaPersistentPanel.tsx` | 750-762 | ui-standards | MEDIUM | Second raw `fetch('/api/chat/upload', ...)` with manual `localStorage` header construction. Comment on line 750 documents the justification (multipart form). | Extract shared auth-header helper or accept as documented exception |
| 9 | `AnaPersistentPanel.tsx` | 796 | ui-standards | LOW | Empty `catch` in `resume_last_section` handler — falls back to `handleSend()` | Add comment explaining the fallback strategy |
| 10 | `AnaPersistentPanel.tsx` | 827, 849, 875, 895, 915, 951, 974, 995 | ui-standards | LOW | Multiple empty `catch` blocks in suggested action handlers — all fall back to `handleSend()` as graceful degradation | Add a single comment block explaining the pattern: "All suggested action handlers fall back to natural language when API fails" |
| 11 | `ana-ri.ts` | 94 | ui-standards | HIGH | `res.status(400).json({ error: '...', code: '...' })` — raw JSON, not `sendError()` envelope | Use `sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE')` |
| 12 | `ana-ri.ts` | 275-279 | ui-standards | HIGH | `res.status(503).json(...)` — raw JSON, not `sendError()` | Use `sendError()` |
| 13 | `ana-ri.ts` | 297-301 | ui-standards | MEDIUM | `res.status(502).json(...)` — raw JSON, not `sendError()` | Use `sendError()` |
| 14 | `ana-ri.ts` | 421-451 | ui-standards | HIGH | `res.json({...})` — success response uses raw JSON, not `sendSuccess()` | Use `sendSuccess(res, { response, thread_id, orchestration, ... })` |
| 15 | `ana-ri.ts` | 452-469 | ui-standards | MEDIUM | Main catch block: `console.error` + raw `res.status(500).json(...)` — should use `sendError()` | Use `sendError(res, 500, 'Internal server error', null, 'INTERNAL_ERROR')` |
| 16 | `ana-ri.ts` | 493 | ui-standards | MEDIUM | `/stream` endpoint: `res.status(400).json(...)` — raw JSON, not `sendError()` | Use `sendError()` |
| 17 | `ana-ri.ts` | 498-502 | ui-standards | MEDIUM | `/stream` endpoint: `res.status(503).json(...)` — raw JSON | Use `sendError()` |
| 18 | `ana-ri.ts` | 788 | ui-standards | MEDIUM | `/stream` catch: `res.status(500).json(...)` — raw JSON | Use `sendError()`. Note: the SSE path (line 785-786) correctly sends error via SSE data event — that is acceptable |
| 19 | `ana-ri.ts` | 800, 831-837 | ui-standards | MEDIUM | `/plan` endpoint: raw `res.status(400).json(...)` and `res.status(500).json(...)` | Use `sendError()` |
| 20 | `ana-ri.ts` | 867-869, 880-881, 884, 891-892 | ui-standards | MEDIUM | `/generate` endpoint: all error paths use raw `res.status().json()` | Use `sendError()` |
| 21 | `ana-ri.ts` | 240 | ui-standards | LOW | Empty `catch` on thread message history load (line 240) — falls through to client history | Add comment: `// Fall through to client-provided history` |
| 22 | `ana-ri.ts` | 265 | ui-standards | LOW | Empty `catch` on file context load — non-blocking is correct | Add comment |
| 23 | `ana-ri.ts` | 316 (variable shadow) | TypeScript | MEDIUM | `let threadId = thread_id` on line 316 shadows the destructured `thread_id` — then is reassigned at line 321. Variable `threadId` is used before declaration at line 231 (`if (threadId)`) referencing the outer `thread_id` while the `let threadId` on line 316 hasn't been reached yet | Rename to avoid confusion, e.g. `let resolvedThreadId` |
| 24 | `command-executor.ts` | 128 | security | MEDIUM | `updateProject` builds SET clause from `setClauses.join(', ')` — but column names come from an allowlist (`allowedFields`), and values are parameterized. Safe, but the pattern should be noted. | No action needed — allowlist + parameterized values is secure |
| 25 | `command-executor.ts` | 749-751 | security | LOW | `searchArtifacts` ILIKE fallback uses `%${params.query}%` — string interpolation into SQL parameter value, but it is passed as a parameterized `$2` value, so it is safe against injection. The `%` wrapping is in the value, not the query template. | No action needed — safe |
| 26 | `context-enrichment.ts` | 150-155 | code-quality | LOW | Dynamic SQL construction for category placeholders — uses parameterized values, safe. | No action needed |
| 27 | `persona.ts` | - | all | PASS | No violations. Pure data/config file with no API calls, no UI, no SQL. Clean types. | N/A |
| 28 | `workflow-orchestration.ts` | - | all | PASS | No violations. Pure data/config file defining workflow steps. No API calls, no UI, no SQL queries. | N/A |
| 29 | `index.css` | - | all | PASS | CSS only. No violations possible for audited rules. Supports chat-first design (AnA response typography). | N/A |
| 30 | `CLAUDE.md` | 165-170 | chat-first | PASS | Chat-First Design section present and matches skill file. Marked NON-NEGOTIABLE. | N/A |

---

## Chat-First Design Compliance

| Check | Status | Notes |
|-------|--------|-------|
| No new UI surfaces created | PASS | All files are existing. No new pages, modals, or panels. |
| All features accessible through chat | PASS | Every feature (preflight, readiness, risk, precedent, workflow, biostat, etc.) is accessible via slash commands or natural language in AnA. |
| Results render as inline markdown | PASS | All suggested action handlers render results as markdown tables/lists directly in chat messages. |
| Intelligence feels ambient | PASS | Context enrichment (`context-enrichment.ts`) auto-injects Foresight, RIM signals, readiness scores, and precedent data into the system prompt without user action. AnA "just knows." |
| Workflow guidance through chat | PASS | `workflow-orchestration.ts` defines full submission workflows that AnA uses to guide users step-by-step in conversation. |

---

## Priority Remediation

### High Priority (5 items)
1. **Backend response envelope** — All `ana-ri.ts` routes use raw `res.json()` / `res.status().json()` instead of `sendSuccess()` / `sendError()`. This is the largest systematic violation. Every non-SSE endpoint should be migrated.
2. **Raw `fetch()` in AnaPersistentPanel** — The SSE streaming and file upload paths use raw `fetch()` with duplicated `localStorage` auth logic. Extract a shared `getAuthHeaders()` utility or accept as documented exceptions.

### Medium Priority (13 items)
3. Empty catch blocks throughout AnaPersistentPanel (lines 491, 699) should have explanatory comments.
4. The `threadId` variable shadowing in `ana-ri.ts` line 316 creates confusing control flow.

### Low Priority (9 items)
5. Minor TypeScript improvements (`any` -> proper types, `unknown` catch patterns).
6. Missing comments on graceful-degradation catch blocks in suggested action handlers.
