# Stage 12 — AnA / Artifact / Governed Work Contract Enforcement

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Audit all AI entry points, enforce the governed artifact pipeline, eliminate bypasses

---

## 1. Mission

Make AnA the enforced system law for meaningful generation. Every valid AI generation
path must either route through AnA orchestration or land in the same
artifact + editor + lifecycle + audit contract.

---

## 2. The One Valid Pattern

```
Intent → AnA Orchestration (or equivalent governed pipeline)
       → Governed Artifact (draft status, project-scoped, tenant-isolated)
       → Editor (EditorPanel / ProjectWorkspaceShell)
       → Lifecycle (draft → review → approved → locked)
       → Audit / Provenance (version chain, source system, user)
```

This pattern is codified in `shared/types/document-contract.ts` as:
- `CanonicalDocumentContract` — the original artifact contract
- `GovernedDocumentActionContract` — the platform-law extension (2026-03 sprint)

---

## 3. Required Contract Fields

From `GovernedDocumentActionContract`:

| Field | Purpose | Required |
|-------|---------|----------|
| `projectId` | Project scope (no orphan artifacts) | Yes |
| `artifactId` | Target artifact (null for creation) | Yes |
| `documentType` | What kind of document | Yes |
| `generationMode` | full_draft / section_draft / edit / refine / analyze | Yes |
| `lifecycleStatus` | draft / review / approved / locked / archived | Yes |
| `originSurface` | Where the action came from | Yes |
| `content` | The document content | Yes |
| `title` | Artifact title | Yes |
| `auditEventPayload` | Event type + metadata for audit trail | Yes |
| `clientTrack` | Optional client context | No |
| `submissionProgram` | IND / eCTD / 510k / PMA / CER / IVDR | No |
| `persona` | regulatory_writer / medical_writer / etc. | No |
| `regulatorScope` | FDA / EMA / PMDA / TGA / Health_Canada | No |
| `evidenceMode` | evidence_first / guidance_first / hybrid | No |
| `documentClass` | strategy_memo / clinical_overview / etc. | No |

---

## 4. AI Entry Point Audit

### A. Governed Paths (Create Artifacts Through Contract)

| Entry point | File | How it governs |
|------------|------|---------------|
| AnA RI `/chat` | `server/routes/ana-ri.ts` | AI gateway → `processResponseActions` → conditional artifact creation via `ana-guidance-executor` with governed contract resolution |
| AnA RI `/stream` | `server/routes/ana-ri.ts` | Same as /chat but streaming; guidance executor runs post-stream |
| AnA RI `/generate` | `server/routes/ana-ri.ts` | `generateArtifact()` → AI gateway → `tagArtifact` with `status: 'draft'` and quality gates |
| Authoring Actions | `server/routes/authoring-actions.ts` | Wave 2 governed: `resolveGovernedContext` → contract validation → `GOVERNED_CONTRACT_INVALID` on failure |
| AI Actions `/execute` | `server/routes/ai-actions.ts` | Typed dispatch per `AIActionType`; handlers like `promote-artifact` use `resolveGovernedContext` |
| Compute Plane | `server/routes/compute.ts` | OPA-gated; `registerArtifactWithGovernance` in compute service |
| Chat `/send-message` | `server/routes/chat.ts` | Agentic loop → optional `processResponseActions` → governed artifact; provenance tables |
| Chat `/upload` | `server/routes/chat.ts` | Direct INSERT to `concept2cure_artifacts` (source type, project-scoped) |

### B. Non-Artifact Paths (Acceptable — Analysis, Metadata, Health)

| Entry point | File | Why acceptable |
|------------|------|---------------|
| AI Assistance `/assist` | `server/routes/ai-assistance.ts` | Text-only recommendation; no persistence in route |
| AI Assistance `/verify` | `server/routes/ai-assistance.ts` | Verification text; no persistence |
| AI Claims binder | `server/routes/ai-claims-routes.ts` | IVDR binder linkage of existing claims; not general generation |
| AnA RI `/health` | `server/routes/ana-ri.ts` | Gateway health check |
| AI Actions `/types` | `server/routes/ai-actions.ts` | Registry metadata |
| AnA RI `/decisions` | `server/routes/ana-ri.ts` | Decision metadata load |

### C. Legacy/Parallel Paths (Not in Beta Shell — Monitor Only)

| Entry point | File | Risk |
|------------|------|------|
| AnAAssistant.jsx | `client/src/components/ai/AnAAssistant.jsx` | Uses `/api/ana-ri/chat`; governed by server |
| LumenChatPane.jsx | `client/src/components/coauthor/LumenChatPane.jsx` | Uses `/api/chat/send-message`; older path |
| openaiService.js | `client/src/services/openaiService.js` | Direct `/api/ai/completion`; bypasses artifact contract |
| CerOpenAIService.js | `client/src/services/CerOpenAIService.js` | Same bypass risk |
| FDA510kAIService.js | `client/src/services/FDA510kAIService.js` | Uses `/api/ai/generate`; may bypass |
| CMC components | Various CMC `.jsx` files | Heavy `/api/ai/*` usage; parallel to governed pipeline |

### D. Client-Side Artifact Creation (Governed)

| Surface | File | Pattern |
|---------|------|---------|
| "Save to Vault" button | `AnaPersistentPanel.tsx` L4719 | `POST /api/concept2cure/projects/:id/artifacts` with title, content, type, category |
| "Insert into Editor" button | `AnaPersistentPanel.tsx` L4783 | `onDraftInsert` callback — editor-side mutation, not API |
| ZenChat artifact save | `ZenChat.tsx` | `useDocumentActions` → governed artifact API |
| Document factory | `useDocumentFactory.ts` | Template-based artifact creation |

---

## 5. Remaining Bypass Paths

| Path | Risk | Recommended action |
|------|------|-------------------|
| `/api/ai/completion` (openaiService.js) | LOW — legacy, not in beta shell | Fence: add deprecation warning; block in production behind feature flag |
| `/api/ai/generate` (FDA510kAIService.js) | LOW — 510k module, not in beta shell | Fence: redirect to governed generate path |
| CMC `/api/ai/*` family | MEDIUM — parallel generation in CMC components | Future: wire through `ai-actions/execute` or authoring-actions |
| `/api/chat/stream` (SSE) | LOW — no `processResponseActions` on this path | Future: add guidance executor parity with `/chat` and `/send-message` |
| `/api/claude/draft/stream` | LOW — streaming draft; used by ClaudeStreamingDraft.tsx | Monitor: not in beta shell |

---

## 6. Contract Tests Added

`tests/routes/ai-entry-point-contract.test.ts` — 25 tests covering:

| Category | Tests |
|----------|------:|
| Contract definition exists and is canonical | 5 |
| Governed contract service is wired | 2 |
| Primary AI generation paths use governed contract | 5 |
| AI action system enforces typed dispatch | 4 |
| AI gateway is canonical LLM access | 3 |
| Governed artifact lifecycle paths exist | 2 |
| Existing governance tests in place | 3 |
| AI entry point classification (governed/non-artifact/legacy) | ~8 |

---

## 7. One-Line Truth

**AnA is the enforced system standard for the beta path.** All primary AI generation
endpoints (`/api/ana-ri/chat`, `/api/ana-ri/generate`, `/api/authoring-actions/*`,
`/api/ai-actions/execute`) create governed artifacts through the contract pipeline.

**Remaining bypass paths exist but are outside the beta shell.** Legacy services
(`openaiService.js`, `CerOpenAIService.js`, CMC components) use direct `/api/ai/*`
endpoints that do not enforce artifact creation. These are tolerated for beta but
should be fenced or redirected post-beta.

---

## 8. Artifact Quality Gates

The governed pipeline enforces these gates:

| Gate | Where | What it checks |
|------|-------|---------------|
| Contract validation | `governedDocumentContractService.ts` | Required fields present; lifecycle status valid; project scope exists |
| Generation guard | `shared/types/document-contract.ts` | `validateGovernedDocumentActionContract` — structural validation |
| Rule pack resolution | `governedDocumentContractService.ts` → `ruleResolver.ts` | Persona + document class → applicable rules |
| Export gate checks | `governedDocumentContractService.ts` | Export allowed only for approved/locked artifacts |
| Governance boundary | `governance-boundary-service.js` | Transition validation (e.g., draft→review requires authority) |
| Decision lifecycle | `decision-lifecycle-service.js` | Decision records for promote/lock transitions |
