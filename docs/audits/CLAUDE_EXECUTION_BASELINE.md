# CLAUDE_EXECUTION_BASELINE.md — Repo Truth Freeze

> Generated: 2026-03-27
> Branch: concept2cure-v2
> Purpose: Facts-only baseline before consolidation sprint

---

## 1. All Beta-Visible Nav Items Today

### Global Shell (6 items) — `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
| # | Label | Nav ID | Destination |
|---|-------|--------|-------------|
| 1 | New | dropdown | New Chat / New Project / New Artifact |
| 2 | Search | `search` | Project search interface |
| 3 | Projects | `projects` | Project list / switcher |
| 4 | Apps | `apps` | App launcher (`AppsPage.tsx`) |
| 5 | Artifacts | `artifacts-center` | Global artifacts browser |
| 6 | Setup | `setup` | Account/workspace settings |

### Project Tabs (5 items) — `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
| # | Label | Layout Mode | Status |
|---|-------|-------------|--------|
| 1 | Overview | `project-home` | Real — ProjectHomeDashboard |
| 2 | Work | `documents` | Real — FullDocumentBuilder |
| 3 | Vault | `vault` | Real — VaultPage |
| 4 | Review | `review` | Real — ReviewReadiness |
| 5 | Submit | `submissions` | Real — SubmissionReadinessView |

### Apps Page (16 apps) — `client/src/concept2cure/pages/AppsPage.tsx`

**Strategy & Evidence (5):**
| App | ID | Has Real Destination | Notes |
|-----|----|---------------------|-------|
| Deep Research | `deep-research` | YES | Routes to deep-research layout |
| Precedent Intelligence | `precedent-intelligence` | YES | PrecedentIntelligenceDashboard |
| Evidence Memo | `evidence-memo` | NO | Falls through to `documents` default |
| Protocol Rationale | `protocol-rationale` | NO | Falls through to `documents` default |
| Risk-Benefit Analysis | `risk-benefit` | NO | Falls through to `documents` default |

**Builders (7):**
| App | ID | Has Real Destination | Notes |
|-----|----|---------------------|-------|
| Clinical Overview | `clinical-overview` | NO | Falls through to `documents` |
| Module 3 Builder | `module3-builder` | NO | Falls through to `documents` |
| Safety Narrative | `safety-narrative` | YES | SafetyNarrativePage |
| 510(k) Workspace | `510k-workspace` | YES | Routes to `/concept2cure/project/:id/510k` |
| PMA Workspace | `pma-workspace` | YES | Routes to `/concept2cure/project/:id/pma` |
| CER Generator | `cer-generator` | PARTIAL | `window.location.href = '/cerv2?mode=cer'` — leaves ZenApp |
| Audit Report | `audit-report` | NO | Falls through to `documents` |

**Specialist Studios (4):**
| App | ID | Has Real Destination | Notes |
|-----|----|---------------------|-------|
| CMC | `cmc` | NO | Falls through to `documents` |
| Biostatistics | `biostatistics` | YES | Opens AnaBiostatsPanel tool panel |
| Clinical | `clinical` | NO | Falls through to `documents` |
| Device | `device` | NO | Falls through to `documents` |

---

## 2. All User-Visible Project Home / Launcher Surfaces

| Surface | File | Real Data | Notes |
|---------|------|-----------|-------|
| ProjectSwitcher | `client/src/concept2cure/components/projects/ProjectSwitcher.tsx` | Yes (via ConnectedProjectSwitcher) | ChatGPT-style project selector modal |
| ConnectedProjectSwitcher | `client/src/concept2cure/components/projects/ConnectedProjectSwitcher.tsx` | Yes (useProjects hook) | Wrapper that connects to DB |
| NewProjectModal | `client/src/concept2cure/components/sidebar/NewProjectModal.tsx` | Yes | Creates real projects |
| ProjectHomeDashboard | `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` | Yes | Light context strip above AnA |
| ProjectDashboard | `client/src/concept2cure/components/workspace/ProjectDashboard.tsx` | Yes (props) | Full dashboard with stats |
| ProjectWorkspaceShell | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Yes | 3-pane workspace (tree | content | inspector) |
| ProjectList (legacy) | `client/src/components/ProjectList.jsx` | Yes | Legacy — calls GET /api/projects |

---

## 3. All AI Entry Points

| Entry Point | Frontend | Backend | Produces Artifact | Notes |
|-------------|----------|---------|-------------------|-------|
| AnA Persistent Panel | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | `server/routes/chat.ts` | Via slash commands | Primary AI surface — always available |
| ZenChat | `client/src/concept2cure/components/chat/ZenChat.tsx` | `server/routes/chat.ts` | Via slash commands | Embedded chat in workspaces |
| RI Copilot Home | `client/src/concept2cure/components/intelligence/RICopilotHome.tsx` | Various RI routes | Yes (draft from precedent) | Evidence-first intelligence view |
| 510(k) AI (CERV2Page) | `client/src/pages/csr/CERV2Page.jsx` | `server/routes/510kRoutes.ts` | Yes (section generation) | Device document generation |
| PMA AI (PMAWorkspace) | `client/src/concept2cure/components/pma/PMAWorkspace.tsx` | PMA routes | Yes | PMA document generation |
| CER Generator | `client/src/components/cer/CerGeneratorPanel.jsx` | `server/routes/cer/generateFullCER.js` | Yes | CER generation (leaves ZenApp shell) |
| Safety Narrative | `client/src/concept2cure/pages/SafetyNarrative.tsx` | Various | Yes | ICH E3 §12 narrative |
| Biostatistics Panel | `client/src/concept2cure/components/biostats/AnaBiostatsPanel.tsx` | Various | Yes | Statistical analysis tool panel |
| Deep Research | Layout mode `deep-research` | Various search APIs | No direct artifact | Research/search tool |
| Precedent Intelligence | `client/src/concept2cure/components/precedent/PrecedentIntelligenceDashboard.tsx` | Precedent engine | No direct artifact | Precedent analysis |
| Report Engine | `client/src/concept2cure/components/reports/IntelligentReportGenerator.tsx` | `server/services/report-generator-service.ts` | Yes | Multi-persona reports |
| Command Palette (⌘K) | `client/src/concept2cure/components/command/ZenCommandPalette.tsx` | — | Indirect | Routes to AI surfaces |
| Authoring AI Actions | Editor extensions | `server/routes/authoring-actions.ts` | Yes | In-editor AI (autocomplete, generate, review) |

---

## 4. All Document Generation Paths

| Path | Frontend Entry | Backend Route | Creates Governed Artifact | Persists |
|------|---------------|---------------|---------------------------|----------|
| 510(k) sections | CERV2Page.jsx | `server/routes/510kRoutes.ts` | Yes (via export governance) | Yes |
| PMA sections | PMAWorkspace.tsx | PMA routes | Yes | Yes |
| CER full report | CerGeneratorPanel.jsx | `server/routes/cer/generateFullCER.js` | Yes (via export governance) | Yes |
| IND auto-draft | INDFullSolution.jsx | `server/routes/ind-autodraft.ts` | Yes | Yes |
| CMC blueprint | CMCHub.tsx | `server/api/cmc/cmcRoutes.ts` | Yes | Yes |
| eCTD packaging | EctdPackager.tsx | `server/src/services/ectd.ts` | Yes | Yes |
| Safety narrative | SafetyNarrative page | Various | Yes | Yes |
| Report generation | IntelligentReportGenerator | `server/services/report-generator-service.ts` | Yes | Yes |
| Authoring actions | Editor panel | `server/routes/authoring-actions.ts` | Yes (governed) | Yes |
| Full Document Builder | FullDocumentBuilder.tsx | Authoring router | Yes | Yes |
| AnA chat slash commands | ZenChat/AnaPersistentPanel | `server/routes/ana-ri.ts` | Some — depends on command | Varies |

---

## 5. All Editor Surfaces

| Editor | File | Notes |
|--------|------|-------|
| UnifiedDocumentEditor | `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` | Primary TipTap editor — compliance, traceability, audit trail |
| EditorPanel | `client/src/concept2cure/components/editor/EditorPanel.tsx` | Wrapper/bridge to UnifiedDocumentEditor |
| CERV2EditorAI | `client/src/pages/csr/CERV2EditorAI.jsx` | Legacy AI editor for 510(k)/CER — OUTSIDE ZenApp shell |
| EditorPage (authoring route) | `client/src/routes/authoring/documents/[docId]/EditorPage.tsx` | Standalone editor route |

---

## 6. All Vault / Artifact List Surfaces

| Vault | File | Notes |
|-------|------|-------|
| VaultPage (Concept2Cure) | `client/src/concept2cure/pages/VaultPage.tsx` | Primary vault in ZenApp |
| DocumentVault (Portal V2) | `client/src/portal-v2/components/vault/DocumentVault.tsx` | Enterprise DMS with version control |
| ArtifactsPage | Used in `artifacts-center` layout mode | Global cross-project artifact browser |
| VaultBrowserPanel | `client/src/components/sharepoint/SharePointFileManager.tsx` | Vault workspace tool panel |
| Vault.jsx (legacy) | `client/src/modules/Vault.jsx` | Legacy module vault |
| DocumentVaultPanel (CER) | `client/src/components/cer/DocumentVaultPanel.jsx` | CER-specific vault |
| EnhancedDocumentVault (510k) | `client/src/components/510k/EnhancedDocumentVault.jsx` | 510(k)-specific vault |
| EvidenceVaultDashboard (GCC) | `client/src/components/gcc/EvidenceVaultDashboard.tsx` | Evidence vault |

**DUPLICATES**: 8 vault surfaces. Should be 1 canonical vault (VaultPage) + 1 global artifact browser (ArtifactsPage).

---

## 7. All Fake / Mock / Decorative Surfaces

| Surface | File | Why It's Fake |
|---------|------|---------------|
| Apps with no real destination (9 of 16) | `AppsPage.tsx` | evidence-memo, protocol-rationale, risk-benefit, clinical-overview, module3-builder, cer-generator (partial), audit-report, cmc, clinical, device — all fall through to generic `documents` mode |
| SectionWorkspace hardcoded statuses | `ZenApp.tsx:2843-2949` | SECTION_LOOKUP has hardcoded status values (approved, drafting, not-started) — not from DB |
| CER Generator leaves ZenApp | `ZenApp.tsx:2442` | `window.location.href = '/cerv2?mode=cer'` — breaks shell, opens legacy page |
| Multiple demoted modes still in type | `ZenApp.tsx:391-448` | ~50 layout modes defined, ~30 are demoted/dead — type bloat |
| Vault Workspace (vault-workspace) | `ZenApp.tsx:2783-2805` | Separate from project vault — unclear purpose, uses SharePointFileManager |
| Legacy vault components (4+) | Various | DocumentVaultPanel, EnhancedDocumentVault, Vault.jsx, EvidenceVaultDashboard — all orphaned from main flow |

---

## 8. All Duplicate Workflows

| Concept | Surfaces | Canonical | Duplicates |
|---------|----------|-----------|------------|
| **Vault** | 8 surfaces | VaultPage (concept2cure) | 7 others (see §6) |
| **Editor** | 4 surfaces | UnifiedDocumentEditor | CERV2EditorAI (legacy), EditorPage (standalone route) |
| **Project Home** | 2 surfaces | ProjectHomeDashboard | ProjectDashboard (full dashboard) |
| **CER Generation** | 2 paths | Should be in-shell | CerGeneratorPanel (legacy /cerv2 page) |
| **Document Builder** | FullDocumentBuilder + CERV2Page | FullDocumentBuilder | CERV2Page (legacy standalone) |
| **AI Chat** | AnaPersistentPanel + ZenChat | AnaPersistentPanel | ZenChat (embedded duplicate) |
| **Review** | ReviewReadiness appears in 2 layout modes | `review` mode | `review-readiness` mode (same component) |

---

## 9. Top 10 Blast-Radius Files

| # | File | Lines | Why |
|---|------|-------|-----|
| 1 | `server/routes/concept2cure.ts` | 12,315 | Core product routes — all concept2cure APIs |
| 2 | `server/index.ts` | 7,948 | Main Express app — all middleware/routes |
| 3 | `server/routes/authoring.router.ts` | 4,981 | Authoring workflow — governed actions |
| 4 | `client/src/concept2cure/ZenApp.tsx` | 3,439 | Main React shell — all layout routing |
| 5 | `server/services/intelligent-report-engine.ts` | 2,659 | Report generation engine |
| 6 | `server/services/lumen-context-builder.ts` | 1,886 | AI context assembly |
| 7 | `server/services/precedent-engine.ts` | 1,748 | Regulatory precedent |
| 8 | `server/routes/chat.ts` | ~3,000+ | Chat infrastructure |
| 9 | `shared/schema/schema.ts` | 730KB+ | Legacy monolithic schema |
| 10 | `server/routes/ana-ri.ts` | ~2,000+ | RI orchestration routes |

---

## 10. Known Config/Env Blockers

| Blocker | Impact | Notes |
|---------|--------|-------|
| `DATABASE_URL` required | Fatal | Neon PostgreSQL — must be configured |
| `ANTHROPIC_API_KEY` required | AI broken | Claude primary — no AI without it |
| `OPENAI_API_KEY` optional | Fallback broken | OpenAI is fallback only |
| `JWT_SECRET` / `SESSION_SECRET` | Auth broken | Must be set for login |
| `REDIS_URL` | Job queue broken | Bull queue needs Redis |
| `CONCEPT2CURE_SIGNER_MODE=dev` | OK for beta | Production needs HSM/KMS |
| `STRIPE_SECRET_KEY` | Billing broken | Not needed for beta demo |
| `SMTP_*` | No password reset emails | Not critical for beta demo |
| Puppeteer for PDF export | May fail in some envs | Falls back to PDFKit |
| `CERV2_PROGRAM_ID` | Smoke test only | Not blocking |

---

## 11. Recommended Canonical Path Per Client Track

### Device (510(k)) — HERO PATH
```
Login → ZenApp → Projects → Select/Create 510K project
  → Project Home (Overview tab)
  → Apps → 510(k) Workspace → CERV2Page (embedded)
  → AI section generation → Export (PDF/DOCX/ZIP)
  → Governed artifact created → Vault
```

### Device (CER / EU MDR) — SECOND HERO
```
Login → ZenApp → Projects → Select/Create IVDR project
  → Project Home → Apps → CER Generator
  ⚠ PROBLEM: CER currently leaves ZenApp shell (window.location.href)
  → Needs to route to in-shell CER generation
  → Same governed artifact loop as 510(k)
```

### Biotech (IND/NDA/BLA) — EARLY ACCESS
```
Login → ZenApp → Projects → Select/Create IND project
  → Project Home → Work tab (FullDocumentBuilder)
  → AI-assisted section drafting via authoring actions
  → Same governed artifact loop
  ⚠ LABEL: Must be marked "Early Access"
```

### Diagnostics (IVDR)
```
Currently no dedicated diagnostics route.
Falls into CER path for EU MDR compliance.
```

---

## Summary of Key Findings

1. **9 of 16 Apps have no real destination** — they all fall through to generic "documents" mode
2. **8 vault surfaces exist** — should be 1
3. **CER generator breaks the shell** — uses window.location.href to leave ZenApp
4. **~50 layout modes defined, ~30 are dead** — type definition is cluttered
5. **SectionWorkspace uses hardcoded status data** — not from database
6. **ReviewReadiness appears twice** — in both `review` and `review-readiness` modes
7. **The front door (ZenApp) works** — Projects → real workspace is functional
8. **Governed artifact loop exists** — export governance creates 5 interconnected records
9. **Primary AI path (AnA) is real** — persistent panel, slash commands, RI orchestration
10. **510(k) path is the most complete** — CERV2Page with real generation + export
