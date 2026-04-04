# CoAuthor.jsx Decomposition Map

> **File**: `client/src/pages/coauthor/CoAuthor.jsx`
> **Total Lines**: 15,012
> **Generated**: 2026-02-21
> **Purpose**: Structural audit for extracting 9 sub-modules from a monolithic React component.

---

## Table of Contents

1. [File Structure Overview](#file-structure-overview)
2. [Import Statements](#import-statements)
3. [Pre-Component Declarations](#pre-component-declarations)
4. [Main Component Signature](#main-component-signature)
5. [Target Module Mappings](#target-module-mappings)
6. [Shared / Cross-Cutting State](#shared--cross-cutting-state)
7. [useEffect Index](#useeffect-index)
8. [useCallback / useMemo Index](#usecallback--usememo-index)
9. [JSX Render Section Map](#jsx-render-section-map)

---

## 1. File Structure Overview

| Region                                  | Lines          | Description                                                 |
| --------------------------------------- | -------------- | ----------------------------------------------------------- |
| Header comment                          | 1–34           | Module doc block, TODO notes                                |
| Import statements                       | 36–260         | React, UI libs, services, icons                             |
| `GoogleIcon` component                  | 263–280        | Inline SVG helper                                           |
| `createContentChunks`                   | 285–330        | Standalone utility function                                 |
| `transformEctdToNavigation`             | 346–425        | Standalone utility function                                 |
| `TipTapEditor` sub-component            | 431–610        | Self-contained editor wrapper (own `useState`, `useEditor`) |
| **`CoAuthor` main component**           | **612–15,012** | Everything else                                             |
| Component function body (state + logic) | 612–6,379      | State declarations, hooks, callbacks, utility functions     |
| JSX return block                        | 6,380–15,009   | Full render tree                                            |
| File end                                | 15,010–15,012  | Closing braces + newline                                    |

---

## 2. Import Statements

### React Core (L36)

```
React, useState, useEffect, Suspense, lazy, useMemo, useRef, useCallback
```

### UI Components (L37–89) → **DocumentShell**

- `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle`
- `Button`, `Badge`, `Progress`, `Input`, `Label`, `Slider`, `Textarea`
- `Dialog/*`, `Tabs/*`, `Select/*`, `DropdownMenu/*`, `Tooltip/*`, `Command/*`

### Toast Hook (L50) → **Shared**

- `useToast`

### Service Imports → **Various modules**

| Lines   | Import                                                                                                                 | Target Module           |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 51      | `SharePointFileManager`                                                                                                | EditorPane              |
| 84      | `NavigationBanner`                                                                                                     | DocumentShell           |
| 85      | `CommitmentIntelligenceHub`                                                                                            | AuditEventEmitter       |
| 86      | `apiRequest`                                                                                                           | Shared                  |
| 87      | `useQuery, useMutation, useQueryClient`                                                                                | Shared                  |
| 90–92   | TipTap (`useEditor`, `EditorContent`, `StarterKit`, `Placeholder`)                                                     | EditorPane              |
| 95–104  | `mammoth`, `docx`, `file-saver`, `jsPDF`                                                                               | EditorPane (export)     |
| 107–109 | `googleDocsService`, `googleAuthService`, `copilotService`                                                             | EditorPane / AIComposer |
| 112     | `coauthorService`                                                                                                      | Shared                  |
| 115     | `aiService`                                                                                                            | AIComposer              |
| 118–121 | `taskManagementService`, `createECTDTask`, `applyAutomationRules`                                                      | ReviewWorkflowPanel     |
| 124–133 | Collaboration imports (`collaborationService`, `CollaborationSidebar`, `CollaborationPresence`, `CursorDisplay`)       | EditorPane (collab)     |
| 136–139 | Lazy-loaded editors: `EnhancedDocumentEditor`, `Office365WordEmbed`, `GoogleDocsEmbed`, `ImportFromINDDialog`          | EditorPane              |
| 142–143 | Lazy templates: `CTDTemplateManager`, `VaultDocumentBrowser`                                                           | DocumentShell           |
| 146–147 | `SemanticSearchBar`, `SemanticSearchResults`                                                                           | EvidencePanel           |
| 150–155 | Lazy: `ComponentManagementSystem`, `AskDataRoomPanel`, `SmartBlocks`, `ContentPlan`, `CommitmentExtractor`             | Various                 |
| 158–162 | eCTD: `ectdValidator`, `ECTDPyramidTemplateSelector`, `EmbeddedFileBrowser`, `SelectedDocumentsPanel`, `WorkflowGuide` | SectionNavigator        |
| 165     | `vaultService`                                                                                                         | VersioningPanel         |
| 166     | `useAuth`                                                                                                              | Shared                  |
| 167–244 | Lucide icons (80+ icons)                                                                                               | DocumentShell / Various |

---

## 3. Pre-Component Declarations (L263–425)

| Lines   | Declaration                           | Target Module    |
| ------- | ------------------------------------- | ---------------- |
| 263–280 | `GoogleIcon` component                | EditorPane       |
| 285–330 | `createContentChunks()` utility       | EvidencePanel    |
| 346–425 | `transformEctdToNavigation()` utility | SectionNavigator |

---

## 4. Main Component Signature

**Line 612**: `export default function CoAuthor({ sharedData = {}, onDocumentUpdate = () => {} })`

---

## 5. Target Module Mappings

### A. DocumentShell

> Layout, pane visibility, left/right panels, toolbar, workflow phase indicators

#### State Variables

| Line      | Variable                                                 | Purpose                         |
| --------- | -------------------------------------------------------- | ------------------------------- |
| 655       | `isTreeOpen` / `setIsTreeOpen`                           | Left sidebar visibility         |
| 658       | `showCCMS` / `setShowCCMS`                               | CCMS dialog toggle              |
| 776       | `showCommandPalette` / `setShowCommandPalette`           | Command palette                 |
| 777       | `searchQuery` / `setSearchQuery`                         | Global search                   |
| 778       | `showQuickSearch` / `setShowQuickSearch`                 | Quick search dialog             |
| 780       | `showOnboarding` / `setShowOnboarding`                   | Onboarding overlay              |
| 785       | `showDataRoomPanel` / `setShowDataRoomPanel`             | Data Room panel                 |
| 786       | `showSmartBlocksDialog` / `setShowSmartBlocksDialog`     | Smart Blocks dialog             |
| 787       | `showContentPlanDialog` / `setShowContentPlanDialog`     | Content Plan dialog             |
| 788       | `showCommitmentExtractor` / `setShowCommitmentExtractor` | Commitment dialog               |
| 789       | `showAskDataRoom` / `setShowAskDataRoom`                 | Ask Data Room panel             |
| 924       | `editorType` / `setEditorType`                           | Editor mode (tiptap/gdocs/word) |
| 947–953   | `expandedWorkflowPhases` / `activePhase`                 | Workflow phase bar              |
| 1510      | `viewMode` / `setViewMode`                               | Library vs tree view            |
| 1511–1512 | `sortBy`, `sortOrder`                                    | Document sort options           |
| 1513–1517 | `filterOptions`                                          | Document filter options         |
| 1520      | `breadcrumbs`                                            | Navigation breadcrumbs          |
| 1528      | `showReadinessDashboard`                                 | Submission readiness panel      |

#### Callbacks / Functions

| Line      | Function                       | Purpose                   |
| --------- | ------------------------------ | ------------------------- |
| 2548–2601 | Keyboard shortcuts `useEffect` | Cmd+K, Cmd+S, Cmd+B, etc. |
| 2605–2619 | Auto-save timer `useEffect`    | 30-second auto-save       |

#### Key JSX Sections

| Lines     | Section                                                              |
| --------- | -------------------------------------------------------------------- |
| 6380–6382 | `return (` — outer `<div>`                                           |
| 6382–6519 | Command Palette Dialog                                               |
| 6519–6567 | Quick Search Dialog                                                  |
| 6567–6570 | Navigation Banner                                                    |
| 6570–6811 | Top Header Bar (logo, search, actions)                               |
| 6811–7070 | Workflow Action Bar (Author/Analyze/Collaborate/Package phases)      |
| 7070–7176 | Consolidated Status Bar (doc info, validation scores, collaboration) |
| 7176–7178 | Main Content Area wrapper                                            |
| 7912–7927 | WorkflowGuide 4-step indicator                                       |
| 8632–8635 | Right Panel wrapper                                                  |

---

### B. SectionNavigator

> CTD tree navigation, module expansion, section selection, eCTD module tree

#### State Variables

| Line      | Variable                                                                                          | Purpose                          |
| --------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| 956–965   | `moduleExpanded`                                                                                  | Per-module expand/collapse state |
| 1039      | `selectedEctdTemplate`                                                                            | Selected eCTD template           |
| 1040      | `selectedEctdFiles`                                                                               | Selected eCTD files              |
| 1041      | `workflowStep`                                                                                    | Workflow guide step (1-4)        |
| 1042      | `showTemplateSelector`                                                                            | Template selector visibility     |
| 1043      | `showFileBrowser`                                                                                 | File browser visibility          |
| 1044      | `showDocumentsPanel`                                                                              | Documents panel visibility       |
| 1047      | `bulkOperationMode`                                                                               | Bulk operations toggle           |
| 1050–1054 | `moduleStatuses`, `lastModifiedTimes`, `documentAssignees`, `priorityFlags`, `sectionExpanded`    | Advanced tree features           |
| 1491–1500 | `moduleProgress`, `documentCounts`, `treeSearchQuery`, `treeFilterOptions`, `selectedDocumentIds` | Tree search/filter               |
| 1504      | `selectedSection`                                                                                 | Currently selected section       |

#### Callbacks / Functions

| Line      | Function                                     | Purpose                       |
| --------- | -------------------------------------------- | ----------------------------- |
| 1057–1185 | `handleDocumentSelect()`                     | Open document from tree click |
| 1187–1254 | `renderSection()` `useCallback`              | Recursive section rendering   |
| 1256–1353 | `renderEctdNavigationModule()` `useCallback` | Render module nav item        |

#### Queries

| Line    | Query                                                        |
| ------- | ------------------------------------------------------------ |
| 970–989 | `useQuery` for `/api/coauthor/ectd-modules/tree-with-counts` |

#### useMemo

| Line     | Memo                                                    |
| -------- | ------------------------------------------------------- |
| 990–1037 | `ectdNavigationTree` — transforms DB tree to nav format |

#### Key JSX Sections

| Lines     | Section                                                  |
| --------- | -------------------------------------------------------- |
| 7178–7500 | Left Sidebar — Document Navigation & eCTD tree           |
| 7184–7330 | Sidebar Header + Recent Documents list                   |
| 7334–7488 | Module Navigation with search/filter + dynamic eCTD tree |
| 7488–7501 | EmbeddedFileBrowser                                      |
| 9783–9799 | SelectedDocumentsPanel (right sidebar for compilation)   |

---

### C. EditorPane

> TipTap editor setup, content editing, save/load, Word import/export, multi-tab document management

#### State Variables

| Line      | Variable                                                                                                                                                                                                       | Purpose                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 660–676   | `openDocuments`, `activeTabIndex`                                                                                                                                                                              | Multi-tab document state                                   |
| 779       | `autoSaveStatus`                                                                                                                                                                                               | Save status indicator                                      |
| 782       | `documentLocked` / `lockedBy`                                                                                                                                                                                  | Document lock state                                        |
| 791–792   | `msWordPopupOpen`, `msWordAvailable`                                                                                                                                                                           | MS Word integration                                        |
| 804       | `googleDocsPopupOpen`                                                                                                                                                                                          | Google Docs integration                                    |
| 805       | `isGoogleAuthenticated`                                                                                                                                                                                        | Google auth state                                          |
| 806       | `googleUserInfo`                                                                                                                                                                                               | Google user info                                           |
| 923       | `authLoading`                                                                                                                                                                                                  | Auth loading flag                                          |
| 1421–1436 | `showExportDialog`, `exportInProgress`, `showImportFromINDDialog`, `exportFormat`, `exportRegion`, `exportOptions`                                                                                             | Export controls                                            |
| 1503      | `isLoadingDocument`                                                                                                                                                                                            | Loading spinner state                                      |
| 1508–1509 | `unsavedChanges`, `lastSavedTime`                                                                                                                                                                              | Unsaved changes tracking                                   |
| 1518–1525 | `documentLocks`, `documentViewers`, `showWordImportDialog`, `importingWord`, `hoveredDocument`, `fileInputRef`, `editorRef`                                                                                    | Advanced editor state                                      |
| 1539–1541 | `hasUnsavedChanges`, `autoSaveInterval`, `serializedDocument`                                                                                                                                                  | Auto-save                                                  |
| 1542–1551 | `documentMetadata`                                                                                                                                                                                             | Document metadata (docType, sequence, applicationId, etc.) |
| 1567      | `importWordDialogOpen`                                                                                                                                                                                         | Word import dialog                                         |
| 1570–1578 | Collaboration state: `isCollaborationConnected`, `collaborators`, `collaborationActivities`, `collaborationComments`, `typingUsers`, `cursors`, `selections`, `showCollaborationSidebar`, `editorContainerRef` |

#### Callbacks / Functions

| Line      | Function                                                                                                         | Purpose                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 612–654   | `escapeHtml()`, `tiptapNodeToHtml()`, `tiptapJsonToHtml()`                                                       | Utility converters                                          |
| 814–922   | `useEffect` — import pending IND canvas payload                                                                  | Auto-import from localStorage                               |
| 1592–1725 | `useEffect` — collaboration init                                                                                 | WebSocket collaboration setup                               |
| 1726–1766 | `handleAddComment`, `handleResolveComment`, `handleTypingStart/Stop`, `handleLockSection`, `handleUnlockSection` | Collaboration handlers                                      |
| 1770–1815 | `handleCloseTab()`, `handleTabSwitch()`, `updateCurrentDocument()`                                               | Tab management                                              |
| 1820–1912 | `createDocumentFromTemplate()`                                                                                   | Create doc from eCTD template                               |
| 1915–2146 | `getTemplateForSection()`                                                                                        | MASSIVE template content map (~230 lines of HTML templates) |
| 2524–2540 | `useEffect` — Google auth check                                                                                  | Check Google auth on mount                                  |
| 2625–2780 | `handleSaveDocument()`                                                                                           | Save document to API                                        |
| 2786–2790 | `handleExportDocument()`                                                                                         | Trigger export dialog                                       |
| 2796–2800 | `handleDocumentEditor()`                                                                                         | Open document editor                                        |
| 4741–4810 | `exportToPDF()`                                                                                                  | PDF generation with jsPDF                                   |
| 4885–4990 | `serializeDocument()`                                                                                            | Serialize doc state to JSON                                 |
| 4994–5120 | `exportDocument()` — includes `generateEctdBackbone()`                                                           | Master export function                                      |
| 5570–5640 | `handleWordImport()`                                                                                             | Word document import via server                             |
| 5642–5665 | `handleBatchWordImport()`                                                                                        | Batch Word import                                           |
| 5667–5710 | `exportToWord()`                                                                                                 | Word export via backend API                                 |

#### Key JSX Sections

| Lines       | Section                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| 7927–7985   | Document Tabs (multi-tab bar)                                              |
| 7985–8218   | Document Header & Actions Bar (breadcrumbs, status, quick actions)         |
| 8218–8632   | **Main Document Editor Content Area**                                      |
| 8222–8458   | Editor Toolbar (save, route, assign, check-in/out, CCMS, status workflow)  |
| 8458–8493   | Editor Mode Tabs (Edit, Files, Preview, Content Atoms, Templates, Changes) |
| 8493–8594   | Editor Content Area — TipTap editor / Google Docs / EnhancedDocumentEditor |
| 8594–8632   | Status Bar (word count, save time, module info)                            |
| 9216–9387   | Edit Tab — Full TipTap + AI Assistance panel                               |
| 9387–9404   | Files Tab — SharePoint File Manager                                        |
| 9404–9430   | Preview Tab                                                                |
| 9430–9712   | Content Atoms Tab with Template Library                                    |
| 9712–9730   | Templates Tab                                                              |
| 9730–9783   | Changes Tab                                                                |
| 9799–9838   | TipTap Editor Integration                                                  |
| 9838–10118  | Google Docs Integration                                                    |
| 10118–10165 | CCMS Dialog                                                                |
| 11355–11469 | Document Export Dialog                                                     |
| 11469–11753 | New Document Dialog                                                        |
| 12008–12120 | Import Word Document Dialog                                                |
| 12296–12658 | Phase 5 eCTD Export Dialog                                                 |

---

### D. EvidencePanel

> Citations, sources, excerpts, semantic search, vector search, Smart Reuse, Chat with Dossier

#### State Variables

| Line      | Variable                                                                                                                                                                                                                     | Purpose                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1359–1367 | `vectorSearchEnabled`, `semanticSearchQuery`, `semanticSearchResults`, `searchSuggestions`, `isSearchingVectors`, `showVectorSearchDialog`, `vectorizedDocuments`, `embeddingInProgress`, `embeddingStatus`                  | Vector search                |
| 1370–1373 | `showChatDossier`, `chatMessages`, `chatQuery`, `isGeneratingChatResponse`                                                                                                                                                   | Chat with Dossier            |
| 1376–1386 | `showSmartReusePanel`, `selectedText`, `similarContentResults`, `isFindingSimilarContent`, `selectedContentBlocks`, `documentTitle`, `documentModule`, `moduleFilter`, `regulatoryFilter`, `similarityFilter`, `showFilters` | Smart Reuse                  |
| 1389–1396 | `smartReuseFilters`                                                                                                                                                                                                          | Enhanced Smart Reuse filters |
| 2313–2320 | `semanticSearchOpen`, `semanticSearchQueryMain`, `semanticSearchResultsMain`, `isSearchingMain`                                                                                                                              | Main semantic search         |

#### Callbacks / Functions

| Line      | Function                     | Purpose                       |
| --------- | ---------------------------- | ----------------------------- |
| 3820–4040 | `createDocumentEmbeddings()` | Generate vector embeddings    |
| 4040–4200 | `chunkDocumentContent()`     | Chunk documents for embedding |
| 4200–4260 | `getSectionHierarchy()`      | Extract CTD section hierarchy |
| 4260–4300 | `generateChunkEmbedding()`   | Call backend for embedding    |
| 4310–4500 | `generateChatResponse()`     | RAG-based chat response       |
| 4500–4540 | `findSimilarContent()`       | Smart Reuse search            |
| 4540–4600 | `performSemanticSearch()`    | Semantic vector search        |

#### Key JSX Sections

| Lines       | Section                                                              |
| ----------- | -------------------------------------------------------------------- |
| 6586–6740   | Enhanced Vector Search in header (search bar + suggestions dropdown) |
| 12658–12762 | Semantic Search Results Dialog                                       |
| 12762–13025 | Chat with Your Dossier Dialog                                        |
| 13025–13684 | Smart Reuse Panel Dialog                                             |

---

### E. ReviewWorkflowPanel

> Document lifecycle, approval workflow, status changes, task automation

#### State Variables

| Line      | Variable                                                                                                                                                                                                            | Purpose                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 794–803   | `showAssignDialog`, `assignedTo`, `documentStatus`, `showStatusChangeDialog`, `statusChangeReason`, `statusChangeComments`, `targetStatus`, `showStatusHistoryModal`, `statusHistoryData`, `isLoadingStatusHistory` | Status / assignment controls                                        |
| 1446–1461 | `timelineView`, `milestones`, `showTimelinePanel`, `documentGanttTasks`, `teamRoles`, `taskAssignments`, `reviewWorkflows`, `approvalChains`, `digitalSignatures`                                                   | Timeline & collaboration                                            |
| 1465–1474 | `complianceValidation`, `showComplianceDashboard`, `autoValidateEnabled`                                                                                                                                            | Compliance validation                                               |
| 1553–1564 | `documentLifecycle`, `showLifecycleDialog`, `pendingApprovers`                                                                                                                                                      | Lifecycle state                                                     |
| 2291–2300 | Commitment extraction state                                                                                                                                                                                         | Commitment Intelligence                                             |
| 2302–2310 | Vault/checkout state                                                                                                                                                                                                | Vault integration                                                   |
| 2340–2365 | Workflow progression state                                                                                                                                                                                          | IND→BLA/NDA progression                                             |
| 2367–2382 | Enhanced workflow progression                                                                                                                                                                                       | Analysis modes, content mapping, gap analysis, timeline, cost, risk |

#### Callbacks / Functions

| Line      | Function                                  | Purpose                                 |
| --------- | ----------------------------------------- | --------------------------------------- |
| 2751–2780 | `handleSetImportedReviewAction()`         | Set review action on imported section   |
| 2800–2830 | `handleCheckOut()` / `handleCheckIn()`    | Check-in/out                            |
| 2910–2930 | `handleDocumentStatusChange()`            | Update document status                  |
| 2932–2970 | `handleSaveToVault()`                     | Save to vault                           |
| 2970–3000 | `handleImportFromVault()`                 | Import from vault                       |
| 3260–3340 | `handleStatusChange()`                    | Full status change with task automation |
| 3421–3436 | Auto-save for draft documents `useEffect` | Auto-save by status                     |
| 3436–3450 | Lock published documents `useEffect`      | Lock on publish                         |
| 2383–2440 | `handleCreateWorkflowProgression()`       | Create workflow progression             |
| 2440–2460 | `loadWorkflowTemplates()`                 | Load workflow templates                 |
| 2460–2510 | `exportWorkflowPlan()`                    | Export workflow plan                    |
| 2510–2524 | `loadWorkflowDashboard()`                 | Load workflow dashboard                 |
| 2524–2548 | `handleExtractCommitments()`              | Extract commitments from doc            |

#### Key JSX Sections

| Lines       | Section                                                      |
| ----------- | ------------------------------------------------------------ |
| 8417–8458   | Document Status Workflow Buttons (tab header)                |
| 11753–12008 | Document Lifecycle Dialog (status badge, history, approvals) |
| 13684–13690 | Commitment Intelligence Hub                                  |
| 13690–14419 | Workflow Progression Dialog (IND→BLA/NDA — 6 tabs)           |
| 14419–14496 | Assignment Dialog                                            |
| 14496–14632 | Status Change Dialog                                         |
| 14632–14733 | Status History Modal                                         |

---

### F. VersioningPanel

> Version history, diff, version comparison, check-in/checkout, version save/restore

#### State Variables

| Line      | Variable                                                                               | Purpose                           |
| --------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| 656       | `showVersionHistory`                                                                   | Version history dialog visibility |
| 657       | `showCompareDialog`                                                                    | Version compare dialog visibility |
| 683       | `activeVersion`                                                                        | Currently active version          |
| 684       | `compareVersions`                                                                      | Versions being compared           |
| 685–687   | `saveVersionDialogOpen`, `versionLabel`, `versionDescription`                          | Save version form                 |
| 1479–1481 | `versionComparison`, `changeTracking`, `qcCheckResults`                                | Comparison/tracking               |
| 1505–1507 | `documentCheckInStatus`, `documentOwners`, `documentVersions`                          | Document check-in                 |
| 3460–3463 | `versionHistory`, `selectedVersion`, `versionCompareMode`, `selectedVersionForCompare` | Version history state             |

#### Mutations

| Line    | Mutation                 | Purpose                  |
| ------- | ------------------------ | ------------------------ |
| 690–735 | `saveVersionMutation`    | Save new version via API |
| 737–760 | `restoreVersionMutation` | Restore previous version |

#### Queries

| Line      | Query                                                  | Purpose               |
| --------- | ------------------------------------------------------ | --------------------- |
| 3467–3480 | `useQuery` for `/api/coauthor/documents/{id}/versions` | Fetch version history |

#### Callbacks / Functions

| Line      | Function                               | Purpose                       |
| --------- | -------------------------------------- | ----------------------------- |
| 760–768   | `viewVersion()`                        | View specific version content |
| 770–776   | `handleSaveVersion()`                  | Trigger save version mutation |
| 2830–2910 | `handleCompareVersions()`              | Compare two versions          |
| 2885–2910 | `highlightDifferences()`               | Simple text diff              |
| 3493–3520 | `useEffect` — format versions from API | Transform API data            |

#### Key JSX Sections

| Lines       | Section                   |
| ----------- | ------------------------- |
| 10165–10266 | Version History Dialog    |
| 10266–10334 | Save Version Dialog       |
| 10334–10491 | Version Comparison Dialog |

---

### G. CrossReferenceManager

> Cross-references, section links, auto-populate fields, regulatory intelligence

#### State Variables

| Line      | Variable                                                                                               | Purpose                     |
| --------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1477      | `crossReferences`                                                                                      | Cross-reference list        |
| 1478      | `autoPopulateFields`                                                                                   | Auto-populated field values |
| 1484–1488 | `guidanceDocuments`, `approvedPrecedents`, `regulatoryAlerts`, `contextualHelp`, `showRegulatoryIntel` | Regulatory intelligence     |

#### Notes

- This module has state defined but **minimal dedicated logic** in the current implementation.
- Cross-references are mentioned but not deeply implemented with dedicated handlers.
- The regulatory intelligence state (`guidanceDocuments`, `approvedPrecedents`) is declared but not populated via API calls in the current code.
- This is the **thinnest** of the target modules — extraction is straightforward.

---

### H. AIComposer

> AI chat, copilot suggestions, prompt construction, response rendering, AI-enhanced atom generation

#### State Variables

| Line      | Variable                                                                                                                                                                                | Purpose                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 926–931   | `aiAssistantOpen`, `aiAssistantMode`, `aiUserQuery`, `aiResponse`, `aiIsLoading`, `aiError`                                                                                             | AI assistant state             |
| 1398–1407 | `showDraftAtomDialog`, `atomDraftingInProgress`, `draftAtomParams`, `draftedAtom`                                                                                                       | AI atom drafting               |
| 1410–1418 | `atomValidationInProgress`, `atomValidationResults`, `showValidationResults`, `atomImprovementInProgress`, `atomImprovementResults`, `atomImprovementFeedback`, `showImprovementDialog` | AI atom validation/improvement |
| 3450–3460 | `aiSuggestions`                                                                                                                                                                         | Mock AI suggestions array      |

#### Callbacks / Functions

| Line      | Function                | Purpose                                             |
| --------- | ----------------------- | --------------------------------------------------- |
| 3200–3260 | `handleAiQuerySubmit()` | Submit AI query (suggestions/compliance/formatting) |
| 3800–3820 | `handleDraftAtom()`     | AI-draft a content atom                             |
| 5140–5200 | `validateContentAtom()` | AI-validate a content atom                          |
| 5200–5240 | `getAtomImprovements()` | AI-suggest improvements                             |

#### Key JSX Sections

| Lines     | Section                                              |
| --------- | ---------------------------------------------------- |
| 7501–7912 | **AI Assistant Panel** (enterprise-grade side panel) |
| 9243–9387 | AI Assistance sub-panel within Edit tab              |
| 9463–9475 | AI-Enhanced Atom Generation button                   |
| 9602–9623 | Validate atom button within Content Atoms tab        |

---

### I. AuditEventEmitter

> Event logging, audit trail entries, IND KPI events

#### State Variables

- No dedicated state (uses `documentLifecycle.history`, `collaborationActivities`, `statusHistoryData`)

#### Callbacks / Functions

| Line      | Function                              | Purpose                                            |
| --------- | ------------------------------------- | -------------------------------------------------- |
| 2725–2750 | `emitIndKpiEvent()`                   | Emit IND milestones to `/api/ind-templates/events` |
| 2910–2930 | Inside `handleDocumentStatusChange()` | Audit trail console.log                            |
| 3260–3340 | Inside `handleStatusChange()`         | Task automation via `applyAutomationRules()`       |

#### Notes

- Audit events are currently scattered across multiple functions
- Lifecycle history entries are created inline within `exportDocument()` (L5080–5100) and `handleStatusChange()`
- Recommend creating a dedicated `emitAuditEvent(type, payload)` helper during extraction

---

## 6. Shared / Cross-Cutting State

These state variables and hooks are used by **multiple** target modules and should live in a shared context (e.g., `CoAuthorContext`) or remain in `DocumentShell` and be passed down.

| Line      | Variable                                                                                                                 | Used By                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 674–676   | `openDocuments`, `activeTabIndex`, `selectedDocument`                                                                    | EditorPane, SectionNavigator, VersioningPanel, ReviewWorkflowPanel, AIComposer |
| 679–681   | `submissionId`, `sessionId`, `indData`                                                                                   | DocumentShell, EditorPane, ReviewWorkflowPanel                                 |
| 796       | `documentStatus`                                                                                                         | ReviewWorkflowPanel, EditorPane, VersioningPanel                               |
| 808       | `toast` (from `useToast`)                                                                                                | ALL modules                                                                    |
| 810–811   | `session`, `authenticatedUser` (from `useAuth`)                                                                          | ALL modules                                                                    |
| 86–87     | `apiRequest`, `queryClient`                                                                                              | ALL modules                                                                    |
| 934–939   | `newDocumentDialogOpen`, `selectedTemplate`, `contentAtoms`, `isLoadingAtoms`, `selectedContentAtom`, `atomRegionFilter` | EditorPane, AIComposer                                                         |
| 942       | `currentOrganization`                                                                                                    | SectionNavigator, EditorPane                                                   |
| 1581–1590 | `currentUser` (useMemo from auth)                                                                                        | EditorPane (collab), ReviewWorkflowPanel                                       |
| 3540–3578 | `documents` (useMemo from API data)                                                                                      | DocumentShell, SectionNavigator                                                |

---

## 7. useEffect Index

| Line | Deps                                               | Purpose                                             | Target Module       |
| ---- | -------------------------------------------------- | --------------------------------------------------- | ------------------- |
| 814  | `[toast]`                                          | Import pending IND canvas payload from localStorage | EditorPane          |
| 1592 | `[selectedDocument, currentUser, toast]`           | Initialize collaboration WebSocket                  | EditorPane          |
| 2147 | `[sharedData, selectedDocument, onDocumentUpdate]` | Sync shared data from parent                        | DocumentShell       |
| 2171 | `[]`                                               | Init session/submission IDs                         | DocumentShell       |
| 2524 | `[]`                                               | Check Google auth on mount                          | EditorPane          |
| 2548 | `[isTreeOpen]`                                     | Keyboard shortcuts                                  | DocumentShell       |
| 2605 | `[selectedDocument, autoSaveStatus]`               | Auto-save every 30s                                 | EditorPane          |
| 3129 | `[selectedDocument?.id]`                           | Fetch latest validation + history                   | ReviewWorkflowPanel |
| 3196 | `[validationTimer]`                                | Cleanup validation debounce timer                   | ReviewWorkflowPanel |
| 3421 | `[documentStatus, selectedDocument, editorType]`   | Auto-save for draft docs                            | EditorPane          |
| 3436 | `[documentStatus]`                                 | Lock published documents                            | ReviewWorkflowPanel |
| 3493 | `[versionsData]`                                   | Format version history from API                     | VersioningPanel     |
| 3579 | `[documents, selectedDocument, onDocumentUpdate]`  | Notify parent about doc status                      | DocumentShell       |
| 3720 | `[]`                                               | Fetch content atoms + templates on mount            | EditorPane          |

---

## 8. useCallback / useMemo Index

| Line | Name                          | Type        | Target Module       |
| ---- | ----------------------------- | ----------- | ------------------- |
| 942  | `currentOrganization`         | useMemo     | Shared              |
| 990  | `ectdNavigationTree`          | useMemo     | SectionNavigator    |
| 1187 | `renderSection`               | useCallback | SectionNavigator    |
| 1256 | `renderEctdNavigationModule`  | useCallback | SectionNavigator    |
| 1581 | `currentUser`                 | useMemo     | Shared              |
| 1726 | `handleAddComment`            | useCallback | EditorPane (collab) |
| 1730 | `handleResolveComment`        | useCallback | EditorPane (collab) |
| 1737 | `handleTypingStart`           | useCallback | EditorPane (collab) |
| 1741 | `handleTypingStop`            | useCallback | EditorPane (collab) |
| 1745 | `handleLockSection`           | useCallback | EditorPane (collab) |
| 1766 | `handleUnlockSection`         | useCallback | EditorPane (collab) |
| 2241 | `generatePrePopulatedContent` | useCallback | EditorPane          |
| 3179 | `triggerDebouncedValidation`  | useCallback | ReviewWorkflowPanel |
| 3540 | `documents`                   | useMemo     | Shared              |

---

## 9. JSX Render Section Map

The main return starts at **line 6380**. Here is the full structure:

```
6380  return (
6382    <div className="flex flex-col h-full">
│
├── 6382-6519   Command Palette Dialog                    → DocumentShell
├── 6519-6567   Quick Search Dialog                       → DocumentShell
├── 6567-6570   NavigationBanner                          → DocumentShell
├── 6570-6811   Top Header Bar                            → DocumentShell
│   ├── 6575-6586   Left: Logo & Title
│   ├── 6586-6740   Vector Search Bar + Suggestions       → EvidencePanel
│   └── 6740-6811   Right: Quick Actions + Collab         → DocumentShell
│
├── 6811-7070   Workflow Action Bar (4 phases)             → DocumentShell
│   ├── 6817-6873   Author Phase
│   ├── 6879-6938   Analyze Phase
│   ├── 6944-7003   Collaborate Phase
│   └── 7009-7070   Package Phase
│
├── 7070-7176   Consolidated Status Bar                   → DocumentShell
│   ├── 7073-7109   Document Info & Status
│   ├── 7109-7140   Validation & Compliance Scores        → ReviewWorkflowPanel
│   └── 7140-7176   Workflow & Collaboration
│
├── 7176-~15009 Main Content Area (master-detail)
│   │
│   ├── 7178-7501  LEFT SIDEBAR                           → SectionNavigator
│   │   ├── 7184-7330   Recent Documents List
│   │   ├── 7334-7488   eCTD Module Navigation Tree
│   │   └── 7488-7501   EmbeddedFileBrowser
│   │
│   ├── 7501-7912  AI ASSISTANT PANEL                     → AIComposer
│   │
│   ├── 7912-8632  MAIN WORKSPACE (Editor)                → EditorPane
│   │   ├── 7916-7927   WorkflowGuide
│   │   ├── 7927-7985   Document Tabs
│   │   ├── 7985-8218   Header & Actions Bar
│   │   ├── 8218-8594   Editor Content Area
│   │   │   ├── 8222-8458   Toolbar
│   │   │   ├── 8458-8493   Mode Tabs
│   │   │   └── 8493-8594   TipTap / GDocs / Enhanced editor
│   │   └── 8594-8632   Status Bar
│   │
│   └── 8632-8635  RIGHT PANEL                            → EvidencePanel / Data Room
│
├── 9216-9783   Tab Content Panels                        → EditorPane
│   ├── 9216-9387   Edit Tab (TipTap + AI)
│   ├── 9387-9404   Files Tab (SharePoint)
│   ├── 9404-9430   Preview Tab
│   ├── 9430-9712   Content Atoms Tab
│   ├── 9712-9730   Templates Tab
│   └── 9730-9783   Changes Tab
│
├── 9783-9799   SelectedDocumentsPanel                    → SectionNavigator
├── 9799-10118  TipTap + Google Docs Embed                → EditorPane
├── 10118-10165 CCMS Dialog                               → EditorPane
│
├── 10165-10491 VERSION DIALOGS                           → VersioningPanel
│   ├── 10165-10266  Version History Dialog
│   ├── 10266-10334  Save Version Dialog
│   └── 10334-10491  Version Comparison Dialog
│
├── 10491-10584 Team Collaboration Dialog                  → EditorPane (collab)
├── 10584-11355 Document Validation Dialog                 → ReviewWorkflowPanel
│
├── 11355-11469 Document Export Dialog                     → EditorPane
├── 11469-11753 New Document Dialog                        → EditorPane
│
├── 11753-12008 DOCUMENT LIFECYCLE DIALOG                  → ReviewWorkflowPanel
│   ├── 11767-11883  Current Status
│   ├── 11883-11954  Approvals
│   └── 11954-12008  Lifecycle History
│
├── 12008-12120 Import Word Document Dialog                → EditorPane
│
├── 12120-12296 Content Plan Dialog                        → EditorPane
│
├── 12296-12658 eCTD EXPORT DIALOG                         → EditorPane
│   ├── 12321-12401  Document Metadata
│   ├── 12401-12439  Export Options
│   └── 12439-12658  Additional Options + Actions
│
├── 12658-12762 SEMANTIC SEARCH RESULTS DIALOG             → EvidencePanel
│
├── 12762-13025 CHAT WITH DOSSIER DIALOG                   → EvidencePanel
│
├── 13025-13684 SMART REUSE PANEL DIALOG                   → EvidencePanel
│   ├── 13049-13142  Search filters
│   ├── 13142-13389  Advanced Filters
│   ├── 13389-13437  Module filter pills
│   └── 13437-13684  Filter display + results
│
├── 13684-13690 Commitment Intelligence Hub                → AuditEventEmitter
│
├── 13690-14419 WORKFLOW PROGRESSION DIALOG                → ReviewWorkflowPanel
│   ├── 13729-13890  Setup & Overview Tab
│   ├── 13917-14024  Content Mapping
│   ├── 14024-14079  Gap Analysis
│   ├── 14079-14138  Gap Analysis Tab
│   ├── 14138-14191  Timeline & Cost Tab
│   ├── 14191-14247  Risk Assessment Tab
│   └── 14247-14419  Export & Summary Tab
│
├── 14419-14496 ASSIGNMENT DIALOG                          → ReviewWorkflowPanel
├── 14496-14632 STATUS CHANGE DIALOG                       → ReviewWorkflowPanel
├── 14632-14733 STATUS HISTORY MODAL                       → ReviewWorkflowPanel
│
├── 14733-14755 ImportFromINDDialog                        → EditorPane
├── 14755-14929 Template Manager Dialog                    → EditorPane
├── 14929-14963 Smart Blocks Dialog                        → EditorPane
├── 14963-14973 Content Plan Dialog                        → EditorPane
├── 14973-14983 Commitment Extractor Dialog                → AuditEventEmitter
└── 14983-15009 Ask Data Room Side Panel                   → EvidencePanel

15009 End of return
15012 End of file
```

---

## Summary — Extraction Counts by Target Module

| Module                     | State Vars | Callbacks/Functions            | useEffects | JSX Line Ranges                                             | Est. Lines |
| -------------------------- | ---------- | ------------------------------ | ---------- | ----------------------------------------------------------- | ---------- |
| **DocumentShell**          | ~20        | 3                              | 4          | 6382-7176, wrapper scaffolding                              | ~1,200     |
| **SectionNavigator**       | ~18        | 3 + 2 useCallbacks + 1 useMemo | 0          | 7178-7501, 9783-9799                                        | ~600       |
| **EditorPane**             | ~45        | 15+                            | 5          | 7912-8632, 9216-9783, 9799-12120, 12296-12658, 14733-14963  | ~4,500     |
| **EvidencePanel**          | ~25        | 6                              | 0          | 6586-6740, 8632-8635, 12658-13684, 14983-15009              | ~1,500     |
| **ReviewWorkflowPanel**    | ~35        | 10+                            | 4          | 7109-7140, 8417-8458, 10584-11355, 11753-12008, 13690-14733 | ~2,500     |
| **VersioningPanel**        | ~12        | 4 + 2 mutations + 1 query      | 1          | 10165-10491                                                 | ~400       |
| **CrossReferenceManager**  | ~7         | 0 (state only)                 | 0          | (inline references)                                         | ~50        |
| **AIComposer**             | ~14        | 4                              | 0          | 7501-7912, 9243-9387                                        | ~800       |
| **AuditEventEmitter**      | 0          | 2                              | 0          | 13684-13690, 14973-14983                                    | ~100       |
| **Shared context**         | ~15        | 0                              | 2          | N/A                                                         | ~200       |
| **Pre-component utils**    | 0          | 3                              | 0          | 263-425                                                     | ~160       |
| **TipTapEditor sub-comp**  | 2          | 1                              | 0          | 431-610                                                     | ~180       |
| **Content Block Registry** | 0          | 0                              | 0          | 5250-6370                                                   | ~1,120     |
| **Templates array**        | 0          | 0                              | 0          | 6050-6350                                                   | ~300       |

---

## Recommended Extraction Order

1. **Extract utilities** (L263-425) → `utils/coauthor-helpers.ts`
2. **Extract content block registry** (L5250-6370) → `data/contentBlockRegistry.ts`
3. **Extract templates array** (L6050-6350) → `data/regulatoryTemplates.ts`
4. **Create `CoAuthorContext`** with shared state (selectedDocument, toast, auth, queryClient, openDocuments)
5. **Extract `VersioningPanel`** (smallest JSX footprint, self-contained mutations)
6. **Extract `CrossReferenceManager`** (state-only, minimal)
7. **Extract `AuditEventEmitter`** (2 functions, minimal JSX)
8. **Extract `AIComposer`** (well-bounded panel)
9. **Extract `EvidencePanel`** (search + chat dialogs)
10. **Extract `SectionNavigator`** (left sidebar tree)
11. **Extract `ReviewWorkflowPanel`** (lifecycle + status dialogs)
12. **Extract `EditorPane`** (largest — do last, after all dependencies are out)
13. **Assemble `DocumentShell`** (what remains = layout + context providers)
