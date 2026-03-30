# AnA Single-Brain Audit — 2026-03-30

## 1. What Is the Actual Canonical AnA Runtime Today?

**Answer:** There is no single canonical runtime. There are **three competing inference paths**:

| Path | Endpoint | Orchestration | Memory | RIM | Commands | Evidence Gating |
|------|----------|--------------|--------|-----|----------|----------------|
| Ana RI Chat | `POST /api/ana-ri/chat` | Full | Full | Async | **None** | Log only |
| Ana RI Stream | `POST /api/ana-ri/stream` | Full | Full | Async | **Full** | Log only |
| Cortex-FT | `POST /api/ana-cortex-ft/inference` | None | None | None | None | Heuristic regex |

The **closest to canonical** is `/api/ana-ri/stream`, which has the most complete post-generation pipeline (guidance executor + command executor). However, the client currently calls `/api/ana-ri/chat` as primary, falling back to `/api/cortex/chat`.

The `/api/ana-ri/chat` path is **functionally inferior** to `/stream` because it skips:
- Guidance executor (auto-artifact creation)
- Command executor (operational commands)
- Real-time queue metadata

## 2. Where Are Split-Brain Behaviors Still Present?

### Runtime Splits
1. **`/chat` vs `/stream` parity gap** — `/chat` does not run guidance or command executors, producing different behavior for the same input.
2. **`ana-cortex-ft/inference`** — Completely separate brain. No orchestration, no memory, no RIM. Has its own citation extraction regex, its own wisdom profile, its own confidence calculation. If called, produces a fundamentally different AnA personality.
3. **`/api/cortex/chat` fallback** — Different payload shape, different auth expectations, no orchestration metadata, no evidence discipline.

### Client-Side Splits
4. **`AnaPersistentPanel.tsx` endpoint chain** — Calls `/api/ana-ri/chat` → `/api/cortex/chat` → `/api/cortex/chat` (error fallback). Each produces different response shapes.
5. **Auth token handling** — 4 competing patterns: `auth-headers.ts` (localStorage), `queryClient.ts` (cached localStorage), AnaPersistentPanel direct `localStorage.getItem('token')`, and 15+ hooks using `trialsage_*` keys.
6. **Response envelope** — `/chat` returns `{ success: true, data: {...} }` but cortex fallback returns raw `{ answer: "..." }`. Panel must handle both.

### Intelligence Splits
7. **Evidence validation** — Only exists as format checking (regex for `[KNOWN]`/`[INFERRED]`/`[MISSING]` labels). No actual evidence retrieval validation. PR #310 places validation on the wrong runtime (`cortex-ft` instead of `ana-ri`).
8. **Memory acceptance** — Thread intelligence extraction writes to project memory without provenance, confidence, or contradiction checking.

## 3. Which PR Changes Are Good and Should Be Salvaged?

### PR #309 — Queue + Streaming
**Good:**
- Queue types (`QueueWorkStatus`, `ConversationQueueItem`, `QueueContextSnapshot`)
- SessionStorage persistence for queue
- `finalizeTurnState()` concept
- Queue banner UI
- Streaming consumer with SSE event parsing
- `buildQueueMeta()` server-side helper

**Salvage:** Types, persistence pattern, SSE consumer logic, UI banner.

### PR #310 — Evidence Bridge
**Good:**
- `validateEvidenceWithEnterpriseBridge()` structure
- `CitationBridgeResult` type with `attempted/validated/provider/error/details`
- Feature flag gating (`oss.ana.enterprise_citation_bridge`)
- Python bridge security hardening (HS256 JWT, CORS, request signing)
- `evidenceValidation` block in response type

**Salvage:** Type definitions, feature flag, Python security changes.

### PR #311 — Auth Centralization
**Good:**
- `client/src/utils/authToken.ts` — `getAuthToken`/`setAuthToken`/`clearAuthToken`
- SessionStorage-first with localStorage migration
- `clearAuthToken()` on 401 across all API layers
- Tenant context verification with org membership checks
- `getSecureOrgId()` helper replacing `req.headers['x-organization-id']`
- Removal of X-API-Key from CORS headers

**Salvage:** Nearly all of it. Best of the three PRs.

## 4. Which PR Changes Are Dangerous or Incomplete?

### PR #309 Dangers
1. **Turn lifecycle race** — `finalizeTurnState()` called in `finally` block, but also called in error handlers. Double-finalization possible.
2. **Deep research async** — `finalizeTurnState('completed', ...)` called when deep research poll completes, but the async polling doesn't gate the queue. Next turn could start before research is done.
3. **Stream error recovery** — If stream fails mid-way, streamed content may be partially visible and then removed from DOM while fallback kicks in.
4. **No actual queue data structure** — Uses array + find/map. Not a real queue.

### PR #310 Dangers
1. **Wrong runtime location** — Evidence validation placed on `ana-cortex-ft/inference`, not on `ana-ri`. This means the main AnA chat path gets no evidence validation.
2. **Synthetic sources** — Validates against `syntheticSources` built from regex-extracted citations, not real retrieved evidence. This validates the model's own hallucinations against themselves.
3. **Single point of failure** — Python bridge dependency with 4.5s timeout. If bridge is slow, adds latency to every inference call.

### PR #311 Dangers
1. **`authToken.ts` not merged** — All the auth centralization code references it, but the file doesn't exist yet.
2. **AnaPersistentPanel not updated** — PR #311 doesn't touch the panel, leaving its direct `localStorage.getItem('token')` and `buildChatHeaders()` intact.
3. **Dev-login token refresh** — Panel still calls `/api/auth/dev-login` on 401, which is a development-only endpoint.

## 5. What Exact Files Currently Cause AnA Intelligence Drift?

| File | Issue |
|------|-------|
| `server/routes/ana-cortex-ft.ts` | Separate inference brain with no orchestration |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Direct auth, triple fallback chain, no shared runtime adapter |
| `server/routes/ana-ri.ts` (lines ~200-660: `/chat`) | Missing command/guidance executors that `/stream` has |
| `client/src/lib/auth-headers.ts` | Direct localStorage with 3-key fallback |
| `client/src/lib/queryClient.ts` | Cached localStorage with 3-key fallback |
| Various hooks using `trialsage_*` keys | Legacy naming, inconsistent auth |

## 6. What Is Still Only "Format Intelligence" Rather Than True Grounded Intelligence?

1. **Evidence labels** — `[KNOWN]`/`[INFERRED]`/`[MISSING]` are checked by regex count only. No validation that claims marked `[KNOWN]` are actually supported by retrieved evidence.
2. **Structure validation** — Checks for `##` headers matching patterns. A response could have all headers with garbage content and pass.
3. **Artifact quality gates** — Better than evidence checking (includes filler detection, semantic depth), but still regex-based. No cross-reference against project facts.
4. **Evaluation rubric** — Scores based on feature presence (has citations? has risk ranking?), not semantic accuracy.
5. **RIM signal capture** — Captures `claimCount: 0, supportedClaimRate: 0.5` hardcoded values, not actual analysis.
6. **Memory extraction** — No validation before persistence. No contradiction detection. No confidence scoring.
