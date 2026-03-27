# GA Readiness Audit — Document System Convergence Sprint

**Date:** 2026-03-27
**Auditor:** Claude Code (Opus 4.6)
**Scope:** ToolsLanding, HAQManager, evidence-ask, useSubmissionSections, DocumentListPane, EditorPanel, ZenApp integration, backend route coverage

---

## Summary

**31 gaps identified across 7 categories.** Several are ship-blockers (P0), most are P1/P2 hardening items. The most critical finding is a **runtime crash bug** in HAQManager where `apiRequest` return type is misused.

---

## 1. STUBS AND TODOs

### 1.1 DocumentListPane.tsx (line 6)
**Severity: P2 — Incomplete feature**
```
Phase 3: expandable rows with CTD path, template type, subsection count.
```
The expandable rows ARE partially implemented (chevron + detail band), but "subsection count" is never shown. The comment implies Phase 3 is not fully delivered.

### 1.2 EditorPanel.tsx (line 1446)
**Severity: P1 — Quality gate scans for stubs**
The quality gate correctly scans for `TODO|TBD|FIXME|lorem ipsum` in document content before advancing status. This is working as intended — NOT a gap. Documenting for completeness.

### 1.3 EditorPanel.tsx (line 146)
**Severity: P2 — UI action is a placeholder**
```
{ id: 'add-references', label: 'Add References', description: 'Insert reference placeholders' },
```
The action exists in the ribbon definition but it's unclear if it's wired to actual functionality or just inserts bracket placeholders.

### 1.4 EditorPanel.tsx (line 2627-2628)
**Severity: P2 — Generic template**
```js
const template = `<h1>${activeArtifact.title || 'Document Title'}</h1><h2>1. Introduction</h2>...`;
```
The "Apply Template" action injects a generic 6-section template. For regulatory documents this is inadequate — should use submission-type-aware templates.

---

## 2. UNCONNECTED WIRING — DEAD CODE

### 2.1 useSubmissionSections.ts — NOT IMPORTED ANYWHERE
**Severity: P0 — Dead code / unfinished integration**

`useSubmissionSections` is defined in `client/src/concept2cure/hooks/useSubmissionSections.ts` but is **never imported or used by any component**. Grep across entire `client/src/` found it only in its own file.

This hook is critical infrastructure — it provides section trees for IND/510K/CER/PMA with artifact status enrichment and readiness scoring. The fact that nothing consumes it means the dossier section workflow is disconnected from live data.

### 2.2 useSubmissionSections — queryKeys not registered
**Severity: P1 — Violates UI standards**

The hook uses inline query key arrays (`['concept2cure', 'ind-sections']` and `['concept2cure', 'projects', projectId, 'artifacts']`) instead of the `queryKeys` registry from `@/concept2cure/hooks/queryKeys`. Per CLAUDE.md rule 4: "Query keys MUST be registered in queryKeys.ts — no ad-hoc string arrays."

---

## 3. TOOLS LANDING INTEGRATION GAPS

### 3.1 'create' action does NOT open NewDocumentDialog
**Severity: P1 — Misleading UX**

In ZenApp.tsx (line 2873-2876), the `'create'` action handler simply switches to editor mode:
```js
case 'create':
  setRiViewMode('editor');
  setLayoutMode('regulatory-workspace');
  break;
```
It does **not** open `NewDocumentDialog` (which exists at `client/src/concept2cure/components/workspace/NewDocumentDialog.tsx`) and is only used inside `ProjectWorkspaceShell`. The user clicks "New Document" and lands in the editor without any creation flow — no title prompt, no template selection, no submission type context.

### 3.2 'templates' action does NOT show template tree
**Severity: P1 — Misleading UX**

The `'templates'` handler (line 2880-2883) is identical to `'create'`:
```js
case 'templates':
  setRiViewMode('editor');
  setLayoutMode('regulatory-workspace');
  break;
```
No template browser, no template selection UI, no template tree. Two buttons with different labels do the exact same thing.

### 3.3 'recent' action does NOT show browse mode with artifacts
**Severity: P1 — Misleading UX**

The `'recent'` handler (line 2869-2872) is also identical:
```js
case 'recent':
  setRiViewMode('editor');
  setLayoutMode('regulatory-workspace');
  break;
```
User clicks "Recent Documents" and gets the same blank editor view. No filtering to recent, no pre-selection.

### 3.4 ToolsLanding recentArtifacts — missing `status` field
**Severity: P2 — Broken status badges**

In ZenApp.tsx (line 2857-2861), recent artifacts are mapped without the `status` field:
```js
recentArtifacts={workspaceSummary?.recent?.documents?.slice(0, 3)?.map(d => ({
  id: d.id,
  title: d.name,
  updatedAt: d.uploadedAt,
}))}
```
The `ToolsLanding` component renders `WorkspaceStatusBadge` for each artifact using `artifact.status`, but `status` is never passed. All badges will show `"not-started"` regardless of actual status.

### 3.5 Three of nine tool actions are functionally identical
**Severity: P1 — Three buttons, one destination**

`'create'`, `'templates'`, and `'recent'` all do `setRiViewMode('editor') + setLayoutMode('regulatory-workspace')`. Users cannot distinguish between these actions.

---

## 4. HAQ MANAGER GAPS

### 4.1 CRITICAL: apiRequest return type mismatch — RUNTIME CRASH
**Severity: P0 — Ship-blocker**

Line 164:
```ts
const data = await apiRequest<AskResponse>('POST', '/api/evidence/ask', { ... });
```

`apiRequest` returns `Promise<Response>` (a raw fetch Response object), NOT `Promise<T>`. The generic type parameter `<AskResponse>` is cosmetic — TypeScript won't enforce it at runtime. The code then accesses `data.answer` and `data.sources` which are **properties of a Response object, not JSON data**.

**Result:** `data.answer` will be `undefined`, and the HAQ response will always show "Response generation pending — please draft manually." The AI drafting feature is silently broken.

**Fix required:** Must be `const res = await apiRequest('POST', ...); const data: AskResponse = await res.json();` or use the envelope: `const json = await res.json(); const data = json.data;`

### 4.2 CRITICAL: Save-as-Artifact same apiRequest bug
**Severity: P0 — Ship-blocker**

Line 226:
```ts
await apiRequest('POST', `/api/concept2cure/projects/${projectId}/artifacts`, { ... });
```

This one is less critical because it doesn't use the return value, but `apiRequest` throws on non-2xx status (except 401). However, the success path runs unconditionally after `await` — if the API returns a 401, it will NOT throw (per the queryClient logic), yet the toast will still say "saved." Partial fix needed.

### 4.3 sessionStorage quota exceeded — silent failure
**Severity: P2 — Data loss risk**

Line 93-96:
```ts
} catch {
  /* quota exceeded — silent */
}
```

If sessionStorage quota is exceeded, session auto-save silently fails. The user loses their HAQ session on navigation with no warning. Should toast a warning.

### 4.4 Session restore shows toast on every mount
**Severity: P2 — UX noise**

Line 117-118: The session restore fires a toast every time the component mounts, including when switching tabs or re-rendering. This could be annoying in normal usage.

### 4.5 No confirmation before "Clear" destroys all work
**Severity: P1 — Destructive action without confirmation**

`handleClearSession` (line 264-269) immediately clears all questions and sessionStorage. There is no confirmation dialog. Accidental click = total data loss.

### 4.6 handleDraftAll is sequential, not parallel
**Severity: P2 — Performance**

Line 206-209: `handleDraftAll` awaits each question serially. For 10+ questions, this could take minutes. Should use controlled concurrency (e.g., batches of 3).

### 4.7 No way to edit drafted responses inline
**Severity: P1 — Workflow gap**

Once a response is drafted, the only option is "Open in Editor." There's no inline edit capability in the HAQ panel itself. Users must leave the HAQ context to make minor edits.

---

## 5. EDITOR LIFECYCLE GAPS

### 5.1 handleStatusChange — FUNCTIONAL
**Severity: OK — No gap**

The lifecycle pipeline (Draft -> In Review -> Approved -> Locked) is properly implemented:
- `handleStatusChange` (line 1425) handles quality gates
- `executeStatusChange` (line 1367) makes the API call to `PUT /api/.../status`
- Backend route exists at line 4799 of concept2cure.ts
- Undo is supported via toast callback
- Lock/unlock has proper attestation and reason requirements

### 5.2 EditorPanel uses res.ok pattern — potential envelope mismatch
**Severity: P2 — Fragile**

EditorPanel checks `res.ok` (12 occurrences) on the raw Response from `apiRequest`. This works because `apiRequest` only throws on non-2xx (except 401). However, the backend uses `sendSuccess/sendError` envelope, and a 200 response with `{ success: false }` would pass the `res.ok` check. Line 798 has one correct check: `if (res.ok && payload.success !== false)` — the other 11 do not.

### 5.3 CTD section assignment uses res.ok incorrectly
**Severity: P2 — Fragile**

Line 1480: `if (res.ok)` after `apiRequest` for CTD section update. Since `apiRequest` throws on non-2xx, the `else` branch (line 1486) for error handling is dead code.

---

## 6. MISSING / FRAGILE BACKEND ROUTES

### 6.1 /api/ind-sections — EXISTS and is mounted
**Severity: OK — No gap**

Route exists at `server/routes/ind-sections.ts` and is mounted in `server/index.ts` (line 1696-1698). Provides full section tree, flat list, AI-draftable sections, progress summary, and single-section lookup.

### 6.2 /api/evidence/ask — EXISTS and is mounted
**Severity: OK — No gap (but see 4.1 for frontend bug)**

Route exists at `server/routes/evidence-ask.ts` and is mounted at `server/index.ts` (line 1738-1740) under `/api/evidence`.

### 6.3 /api/concept2cure/projects/:id/artifacts — EXISTS
**Severity: OK — No gap**

Route is in `server/routes/concept2cure.ts`.

### 6.4 Evidence Ask — RAG pipeline dependency chain
**Severity: P1 — Fragile env dependency**

The evidence-ask route instantiates `ForesightRAGService` which calls `getRAGPipeline(pool)` which calls `getEmbeddingService()` and uses `AIProviderRouter`. The `AIProviderRouter` (line 291-292 of aiProviderRouter.ts) requires `ANTHROPIC_API_KEY` env var. If this is missing, the RAG pipeline will silently have no LLM provider and `queryWithGeneration` will fail at runtime.

The error is caught and returns a 502, which is correct, but there's no startup health check that validates the RAG pipeline is functional.

---

## 7. FEATURE FLAGS AND ENV DEPENDENCIES

### 7.1 ANTHROPIC_API_KEY — required for RAG/Evidence Ask
**Severity: P1 — Silent failure**

If `ANTHROPIC_API_KEY` is not set, the entire Evidence Ask / Data Room Q&A feature silently fails with a 502 "temporarily unavailable" error. No startup warning, no feature flag, no graceful degradation in the UI.

### 7.2 Database pool (getPool) — required for RAG
**Severity: P1 — Crash risk**

`ForesightRAGService` calls `getPool()` on every request. If the database connection pool is not initialized or the database is unreachable, this will throw. The `try/catch` in evidence-ask.ts handles this, but the error message ("Data Room search is temporarily unavailable") gives no indication of the root cause.

### 7.3 No pgvector extension check
**Severity: P1 — Silent failure**

The RAG pipeline uses vector similarity search, which requires the `pgvector` extension in PostgreSQL. There is no startup check or migration that ensures pgvector is installed. If missing, embedding queries will fail with cryptic SQL errors.

---

## 8. COMPONENT STANDARDS VIOLATIONS

### 8.1 DocumentListPane — raw `<button>` elements (8 instances)
**Severity: P2 — Violates component contract**

Lines 125, 147, 190, 201, 250, 295, 307, 319 all use raw `<button>` instead of `<Button>` from the governed component registry.

### 8.2 DocumentListPane — raw `<input>` and `<select>` elements
**Severity: P2 — Violates component contract**

Line 139: raw `<input>` instead of `<Input>`
Line 155: raw `<select>` instead of `<Select>`

Per CLAUDE.md: "Raw `<input>` / `<select>` = forbidden. Use `<Input>`, `<Select>` inside `<FormField>`."

### 8.3 DocumentListPane — hardcoded projectId
**Severity: P1 — Broken for multi-project**

Line 335:
```tsx
projectId={1}
```
`InlineAIMenu` receives a hardcoded `projectId={1}` instead of the actual project ID. This means all AI actions on document rows will target project 1 regardless of which project the user is in.

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 2 | HAQManager apiRequest crash bugs (4.1, 4.2) |
| **P1** | 11 | Broken UX flows, dead code, missing confirmations, env deps |
| **P2** | 8 | Standards violations, cosmetic, performance |
| **OK** | 4 | Verified working (editor lifecycle, backend routes) |

---

## Recommended Fix Order

1. **P0: Fix HAQManager apiRequest calls** — Add `.json()` parsing. ~15 min fix, unblocks entire HAQ workflow.
2. **P1: Wire ToolsLanding actions properly** — `create` should open NewDocumentDialog, `templates` should show template browser, `recent` should filter to recent artifacts.
3. **P1: Integrate useSubmissionSections** — Hook exists but is dead code. Wire it into DossierMap or ProjectWorkspaceShell.
4. **P1: Add Clear confirmation to HAQManager** — Destructive action needs a dialog.
5. **P1: Pass `status` in recentArtifacts mapping** — One-line fix in ZenApp.tsx.
6. **P1: Fix hardcoded projectId=1** in DocumentListPane.
7. **P2: Replace raw HTML elements** in DocumentListPane with governed components.
8. **P2: Register query keys** in useSubmissionSections.

---

*Report generated: 2026-03-27 by Claude Code GA Readiness Auditor*
