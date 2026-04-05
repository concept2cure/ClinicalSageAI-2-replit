# UI Authority Audit — 2026-04-05

**Automated audit:** `scripts/audit-ui-authority.ts` — 17/17 PASS
**Manual audit:** Below

---

## Shell Authority

| Surface | File | Status | Authority |
|---------|------|--------|-----------|
| ZenApp.tsx | `client/src/concept2cure/ZenApp.tsx` | active | **Canonical** — sole shell owner |
| ZenRouter.tsx | `client/src/concept2cure/router/ZenRouter.tsx` | active | Keep — URL dispatcher |
| ProjectWorkspaceShell.tsx | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | active | Keep — machine room sub-shell |
| EmbeddedModuleHosts.tsx | `client/src/concept2cure/components/shell/EmbeddedModuleHosts.tsx` | active | Keep — 510k/PMA/CER adapters |
| ZenShell.tsx | DELETED | deleted | Phase 3 |
| SplitScreenLayout.tsx | DELETED | deleted | Phase 3 |
| IndustryWorkspaceShell.tsx | DELETED | deleted | Phase 3 |
| GlobalOperatingShell.tsx | DELETED | deleted | Phase 7 |
| Sidebar.tsx (legacy) | DELETED | deleted | Phase 3 |

**Result:** ONE canonical shell authority (ZenApp.tsx). No competing shells exist.

---

## Navigation Authority

| Surface | File | Status | Items |
|---------|------|--------|-------|
| ZenSidebar.tsx | `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | active | 5 destinations |
| ProjectsSidebar.tsx | `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` | active | Sub-component |

**Destinations verified:** Chats, Projects, Communication Center, Apps, Settings

**Result:** ONE canonical nav source. No duplicate sidebar authorities.

---

## LayoutMode Authority

| Metric | Value |
|--------|-------|
| Total values in type | 24 |
| Active modes with renderers | 21 |
| Specialist tools (from Apps) | 6 |
| Demoted modes in redirect map | 55+ |
| LayoutMode type location | `zen-app-constants.ts` |
| Redirect map location | `zenRouteNormalization.ts` |

**Result:** Clean type union. All demoted modes handled by string-to-LayoutMode redirect map.

---

## Destination Authority

| Destination | Layout Mode | Render Block | Nav Wired |
|------------|-------------|-------------|-----------|
| Chats | `projects` | YES (project cards + AnaPersistentPanel full) | YES |
| Projects | `projects` | YES (shared with Chats) | YES |
| Communication Center | `communication-center` | YES (CommunicationCenter) | YES |
| Apps | `apps` | YES (AppsPage) | YES |
| Settings | `settings` | YES (SetupPage) | YES |

**Forbidden destinations removed from top-level:**
Documents, Intelligence, Workspace Home, Artifacts Center, Editor, Review, Verify, Vault, Submit

**Result:** Exactly 5 top-level destinations. No forbidden siblings.

---

## Typography Authority

| Token | Value |
|-------|-------|
| Shell font | System sans stack |
| Document font | Lora (preserved for editor surfaces) |
| Poppins references in client/ | 0 |
| Poppins references in server/ | 0 |

**Result:** Shell typography neutralized. Serif isolated to document surfaces.

---

## Theme Authority

| Token | Before | After |
|-------|--------|-------|
| Meta theme-color | #d97757 (terracotta) | #faf9f7 (warm neutral) |
| Server primary | #d97757 | #475569 (slate) |
| AnaPersistentPanel accent | 20 hardcoded #D97757 | 0 (all tokenized to terracotta-*) |

**Result:** Shell accent neutralized. Terracotta preserved as restrained accent via tokens.

---

## Chat Surface Authority

| Criterion | Status |
|-----------|--------|
| AnaPersistentPanel mode for Chats | full |
| AnaPersistentPanel mode for Projects | full |
| AnaPersistentPanel mode for Communication Center | full |
| AnaPersistentPanel mode for Apps | full |
| AnaPersistentPanel mode for Settings | full |
| AnaPersistentPanel mode for module pages | compact |
| AnaPersistentPanel mode for project-home | full (inline) |
| AnaPersistentPanel mode for regulatory-workspace | full (inline) |

**Result:** Full mode for all primary destinations. Compact only for project-scoped module pages.

---

## Regression Check

| System | Status | Verified |
|--------|--------|----------|
| EditorPanel render block | INTACT | `layoutMode === 'editor'` at line ~3153 |
| ProjectWorkspaceShell render block | INTACT | `layoutMode === 'regulatory-workspace'` at line ~2398 |
| Review render block | INTACT | `layoutMode === 'review'` at line ~2685 |
| Submissions render block | INTACT | `layoutMode === 'submissions'` at line ~2699 |
| Vault render block | INTACT | `layoutMode === 'vault'` at line ~2276 |
| handleOpenArtifact callback | INTACT | Line ~1108 |
| handleDraftInsert callback | INTACT | Line ~1032 |
| All 43 slash commands | INTACT | No changes to context-enrichment.ts |
| All 41 operational commands | INTACT | No changes to command-executor.ts |

**Result:** Zero regressions in machine room, editor, artifact lifecycle, review, submission, or vault.

---

## Audit Verdict: PASS

All authority checks pass. One canonical shell, one canonical nav, 5 destinations, clean types, neutralized theme, zero regressions.
