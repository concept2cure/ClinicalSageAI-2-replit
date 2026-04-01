# Dead Code Audit — Client-Side Orphaned Files

**Date:** 2026-04-01  
**Scope:** `client/src/pages/`, `client/src/hooks/`, `client/src/services/`, `client/src/modules/`, `client/src/components/` (top-level only)  
**Method:** `rg` exhaustive import/reference search across `client/src/` for each file. Files referenced ONLY by other dead files are marked **CHAIN-DEAD**.

---

## Summary

| Directory | Total Files | DEAD | CHAIN-DEAD | ALIVE | Dead Lines |
|-----------|-------------|------|------------|-------|------------|
| `pages/` | 59 | 8 | 0 | 51 | 3,237 |
| `hooks/` | 43 | 17 | 3 | 23 | 2,212 |
| `services/` | 79 | 17 | 1 | 61 | 7,614 |
| `modules/` | 12 | 6 | 0 | 6 | 508 |
| `components/` (top-level) | 211 | 79 | 15 | 117 | 28,816 |
| **TOTAL** | **404** | **127** | **19** | **258** | **42,387** |

**Grand total dead (DEAD + CHAIN-DEAD): 146 files, ~42,387 lines**

---

## 1. `client/src/pages/` — Orphaned Page Components

| # | File | Lines | Status | Imported By |
|---|------|-------|--------|-------------|
| 1 | `pages/admin/AdminPage.tsx` | 16 | ALIVE | App.jsx, Module1AdminPage.jsx, ZenApp.tsx |
| 2 | `pages/admin/AdminProfile.jsx` | 1,106 | ALIVE | App.jsx |
| 3 | `pages/admin/AuditPage.jsx` | 512 | ALIVE | App.jsx |
| 4 | `pages/admin/AuditTrailDashboard.jsx` | 663 | ALIVE | App.jsx |
| 5 | `pages/admin/BatchOpsDashboard.tsx` | 789 | ALIVE | App.jsx |
| 6 | `pages/admin/ClientLicenseManagement.jsx` | 738 | ALIVE | App.jsx |
| 7 | `pages/admin/ClientManagement.jsx` | 1,204 | ALIVE | App.jsx |
| 8 | **`pages/admin/ModernTaskDashboard.jsx`** | **11** | **DEAD** | — |
| 9 | `pages/admin/ModuleSettingsPage.jsx` | 29 | ALIVE | App.jsx |
| 10 | `pages/admin/PlatformReadinessDashboard.tsx` | 586 | ALIVE | App.jsx |
| 11 | **`pages/admin/QualityDashboard.jsx`** | **34** | **DEAD** | — |
| 12 | `pages/admin/RegulatoryAITesting.jsx` | 279 | ALIVE | App.jsx |
| 13 | `pages/admin/RegulatoryRiskDashboard.jsx` | 149 | ALIVE | App.jsx |
| 14 | `pages/admin/RoleManagementPage.tsx` | 612 | ALIVE | App.jsx |
| 15 | `pages/admin/Settings.jsx` | 1,568 | ALIVE | App.jsx |
| 16 | `pages/admin/SignaturePage.jsx` | 638 | ALIVE | App.jsx |
| 17 | `pages/admin/TenantManagement.jsx` | 1,913 | ALIVE | App.jsx |
| 18 | `pages/admin/UserManagementPage.tsx` | 562 | ALIVE | App.jsx |
| 19 | `pages/admin/ValidationDashboard.jsx` | 768 | ALIVE | App.jsx, cmc/ProcessTab.jsx |
| 20 | `pages/AnaCortex.tsx` | 60 | ALIVE | App.jsx, AnaCortexChat.tsx |
| 21 | `pages/billing/BillingDashboard.tsx` | 1,207 | ALIVE | App.jsx, ZenRouter.tsx |
| 22 | `pages/cmc/AnalyticalMethodsStubPage.jsx` | 522 | ALIVE | App.jsx |
| 23 | `pages/cmc/CMCPage.jsx` | 12 | ALIVE | App.jsx |
| 24 | `pages/cmc/ComparabilityStudiesStubPage.jsx` | 573 | ALIVE | App.jsx |
| 25 | `pages/coauthor/BlueprintPage.jsx` | 1,215 | ALIVE | App.jsx |
| 26 | `pages/coauthor/CanvasPage.css` | 97 | ALIVE | CanvasPage.jsx |
| 27 | `pages/coauthor/CanvasPage.jsx` | 42 | ALIVE | App.jsx |
| 28 | `pages/coauthor/CitationManagerPage.jsx` | 428 | ALIVE | App.jsx |
| 29 | `pages/coauthor/CoAuthor.jsx` | 15,076 | ALIVE | App.jsx, portal-v2, tests |
| 30 | `pages/coauthor/DocumentTemplates.jsx` | 1,142 | ALIVE | App.jsx, cmc components |
| 31 | `pages/coauthor/DocumentViewer.jsx` | 78 | ALIVE | CERV2Page, CoAuthor, modals |
| 32 | `pages/coauthor/DocxFactory.tsx` | 1,378 | ALIVE | App.jsx |
| 33 | `pages/coauthor/FulleCTDCoAuthor.jsx` | 1,112 | ALIVE | App.jsx |
| 34 | `pages/coauthor/ModuleDashboard.css` | 16 | ALIVE | ModuleDashboard.jsx |
| 35 | `pages/coauthor/ModuleDashboard.jsx` | 126 | ALIVE | coauthor/DocumentSelector, coauthor/ModuleDashboard |
| 36 | `pages/coauthor/ModuleSectionEditorPage.jsx` | 359 | ALIVE | App.jsx |
| 37 | **`pages/coauthor/RealCoAuthor.jsx`** | **752** | **DEAD** | — |
| 38 | **`pages/coauthor/SimpleDocumentCreator.jsx`** | **143** | **DEAD** | — |
| 39 | `pages/coauthor/TimelinePage.css` | 281 | ALIVE | TimelinePage.jsx |
| 40 | `pages/coauthor/TimelinePage.jsx` | 387 | ALIVE | App.jsx |
| 41 | `pages/csr/CerPage.jsx` | 10 | ALIVE | App.jsx |
| 42 | `pages/csr/CERV2EditorAI.jsx` | 1,080 | ALIVE | App.jsx, MedicalDeviceDocumentEditor |
| 43 | `pages/csr/CERV2Page.jsx` | 9,349 | ALIVE | App.jsx, CERRoutes, portal-v2, ZenApp.tsx |
| 44 | `pages/csr/CSRDetail.tsx` | 322 | ALIVE | App.jsx |
| 45 | `pages/csr/CSRIntelligence.jsx` | 1,824 | ALIVE | App.jsx, csr-intelligence components |
| 46 | `pages/csr/CSRPage.jsx` | 879 | ALIVE | App.jsx |
| 47 | `pages/csr/PredicateIntelligence.tsx` | 2,141 | ALIVE | App.jsx |
| 48 | **`pages/HomeLanding.jsx`** | **24** | **DEAD** | versionControl.ts mentions `HomeLandingProtected` (not an import) |
| 49 | **`pages/ind/INDFullSolution.jsx`** | **2,132** | **DEAD** | — |
| 50 | `pages/ind/PreSubmissionValidation.jsx` | 15 | ALIVE | App.jsx |
| 51 | `pages/ind/UnifiedECTD.jsx` | 12 | ALIVE | App.jsx |
| 52 | `pages/ind/UnifiedSubmissionCenter.jsx` | 1,979 | ALIVE | App.jsx |
| 53 | `pages/NewProjectWizard.tsx` | 552 | ALIVE | App.jsx |
| 54 | **`pages/regulatory/IVDRModulePage.jsx`** | **77** | **DEAD** | — |
| 55 | `pages/regulatory/IVDRProjectHub.tsx` | 561 | ALIVE | App.jsx |
| 56 | **`pages/reports/reportDashboardConfig.js`** | **79** | **DEAD** | — |
| 57 | `pages/reports/ReportsDashboard.jsx` | 415 | ALIVE | App.jsx |
| 58 | `pages/reports/ReportsPage.jsx` | 814 | ALIVE | App.jsx |
| 59 | `pages/SalesLandingPage.tsx` | 850 | ALIVE | App.jsx, ZenRouter.tsx |
| 60 | `pages/vault/EmbeddedVaultBrowser.jsx` | 162 | ALIVE | App.jsx |
| 61 | `pages/VaultPage.jsx` | 265 | ALIVE | App.jsx, ZenApp.tsx |
| 62 | `pages/vault/VaultBrowser.jsx` | 108 | ALIVE | App.jsx, ZenApp.tsx, CoAuthor |
| 63 | `pages/vault/VaultPage.jsx` | 281 | ALIVE | App.jsx, ZenApp.tsx |

**Pages DEAD: 8 files, 3,252 lines**

---

## 2. `client/src/hooks/` — Orphaned Hooks

| # | File | Lines | Status | Imported By |
|---|------|-------|--------|-------------|
| 1 | `hooks/useAuth.jsx` | 53 | ALIVE | App.jsx, contexts, portal-v2 |
| 2 | **`hooks/use-auth.tsx`** | **177** | **DEAD** | — |
| 3 | **`hooks/useCERGenerator.jsx`** | **246** | **DEAD** | — |
| 4 | `hooks/useClaudeAI.ts` | 161 | ALIVE | ClaudeVisionUpload.tsx |
| 5 | `hooks/useClaudeStream.ts` | 172 | ALIVE | useClaudeAI.ts, ClaudeStreamingDraft.tsx |
| 6 | `hooks/useCollaboration.js` | 234 | ALIVE | contexts, concept2cure, layout |
| 7 | **`hooks/useContextualGuidance.js`** | **161** | **DEAD** | — |
| 8 | `hooks/useDocAI.js` | 83 | ALIVE | DropzoneUpload.jsx |
| 9 | `hooks/useDocumentDownload.js` | 215 | ALIVE | document-management/DocumentViewer.jsx |
| 10 | **`hooks/useDocumentRiskAnalysis.jsx`** | **362** | **DEAD** | — |
| 11 | **`hooks/useDocuShareComponents.js`** | **115** | **DEAD** | — |
| 12 | `hooks/useDocuShare.js` | 32 | ALIVE | DocuShareContext, DropzoneUpload, DocuShareVault |
| 13 | `hooks/use-docx-factory.ts` | 470 | ALIVE | use-predicate-intelligence.ts, DocxFactory.tsx |
| 14 | `hooks/useExportFAERS.jsx` | 247 | ALIVE | cer/CerBuilderPanel, cer/FaersReportExporter |
| 15 | `hooks/useFetchFAERS.jsx` | 137 | ALIVE | cer/FaersReportDisplay |
| 16 | **`hooks/useFirstRun.test.tsx`** | **42** | **DEAD** | test file only (no prod consumer) |
| 17 | `hooks/useFirstRun.ts` | 46 | ALIVE | cmc/ComprehensiveCMCPlatformClean.jsx |
| 18 | **`hooks/useFreezeDetection.jsx`** | **111** | **DEAD** | — |
| 19 | `hooks/useHealthCheck.js` | 44 | ALIVE | DatabaseStatusIndicator.jsx |
| 20 | **`hooks/useHealthMonitor.jsx`** | **101** | **DEAD** | — |
| 21 | **`hooks/useLearningProfile.jsx`** | **216** | **DEAD** | — |
| 22 | **`hooks/useLearningService.ts`** | **120** | **CHAIN-DEAD** | only by AdaptiveLearningInterface (DEAD) |
| 23 | **`hooks/useLicenseCheck.js`** | **66** | **DEAD** | — |
| 24 | **`hooks/useMemoryOptimization.jsx`** | **243** | **DEAD** | — |
| 25 | `hooks/use-mobile.tsx` | 19 | ALIVE | ui/sidebar.tsx |
| 26 | **`hooks/useModuleSettings.js`** | **43** | **DEAD** | — |
| 27 | **`hooks/useNetworkResilience.jsx`** | **224** | **DEAD** | — |
| 28 | `hooks/use-predicate-intelligence.ts` | 886 | ALIVE | PredicateIntelligence.tsx, predicate/ panels |
| 29 | **`hooks/useQcSocket.js`** | **162** | **CHAIN-DEAD** | only by fix-toast-references.js (dead script) + useQcSocket.ts |
| 30 | **`hooks/useQcSocket.ts`** | **229** | **CHAIN-DEAD** | only by fix-toast-references.js + useQcSocket.js |
| 31 | `hooks/useQCWebSocket.js` | 88 | ALIVE | fix-toast-references, useQCWebSocket.ts/.tsx |
| 32 | `hooks/useQCWebSocket.ts` | 141 | ALIVE | fix-toast-references, useQCWebSocket.js/.tsx |
| 33 | `hooks/useQCWebSocket.tsx` | 321 | ALIVE | fix-toast-references, useQCWebSocket.js/.ts |
| 34 | `hooks/useReferenceModel.js` | 120 | ALIVE | folderHierarchy.js, DocumentUploadForm.jsx |
| 35 | `hooks/use-research-companion.tsx` | 178 | ALIVE | layout/TopNavbar.tsx, ResearchCompanion.tsx |
| 36 | `hooks/useSectionSync.js` | 402 | ALIVE | ModuleSectionEditor.jsx, EnhancedDocumentEditor.jsx |
| 37 | **`hooks/use-theme.ts`** | **29** | **DEAD** | — |
| 38 | **`hooks/use-title.ts`** | **22** | **DEAD** | — |
| 39 | `hooks/use-toast-context.tsx` | 181 | ALIVE | fix-toast-references.js |
| 40 | `hooks/use-toast.js` | 86 | ALIVE | portal-v2, fix-toast, routes |
| 41 | `hooks/use-toast.jsx` | 161 | ALIVE | portal-v2, fix-toast, routes, pages |
| 42 | `hooks/use-toast.ts` | 188 | ALIVE | portal-v2, fix-toast, routes, modules |
| 43 | `hooks/use-toast.tsx` | 116 | ALIVE | portal-v2, fix-toast, routes |
| 44 | `hooks/useWindowSize.js` | 38 | ALIVE | canvas/CanvasWorkbenchV2.jsx |

**Hooks DEAD + CHAIN-DEAD: 20 files, 2,603 lines**

> **Note on QCWebSocket hooks (useQCWebSocket.js/.ts/.tsx):** These three files only cross-reference each other and fix-toast-references.js. No actual component imports any of them. They are effectively dead but marked ALIVE due to cross-references.

---

## 3. `client/src/services/` — Orphaned Service Files

| # | File | Lines | Status | Imported By |
|---|------|-------|--------|-------------|
| 1 | **`services/AdminService.js`** | **900** | **DEAD** | — |
| 2 | `services/aiContext.js` | 516 | ALIVE | ai/AIResponseBlock, cmc components |
| 3 | `services/AIDocumentService.js` | 219 | ALIVE | docushare panels |
| 4 | `services/aiService.js` | 660 | ALIVE | ValidationDashboard, CoAuthor |
| 5 | `services/api.js` | 50 | ALIVE | workers, controllers, portal-v2 |
| 6 | `services/authService.js` | 66 | ALIVE | App.jsx, portal-v2, contexts |
| 7 | `services/AutoLinkService.js` | 190 | ALIVE | docushare/SmartDocuSharePanel |
| 8 | `services/blockchain.js` | 204 | ALIVE | portal-v2, DocuShareService, lib |
| 9 | **`services/CerAiValidationService.js`** | **659** | **DEAD** | — |
| 10 | `services/CerAPIService.js` | 1,805 | ALIVE | CERV2Page, cer components |
| 11 | `services/CerComplianceService.js` | 96 | ALIVE | cer components |
| 12 | `services/CerOpenAIService.js` | 441 | ALIVE | cer/CerGeneratorPanel |
| 13 | **`services/CerQualityGatingService.js`** | **138** | **DEAD** | — |
| 14 | `services/cerService.js` | 209 | ALIVE | KAutomationController |
| 15 | `services/CERV2AIService.js` | 157 | ALIVE | CERV2EditorAI |
| 16 | `services/CERV2AutoSaveService.js` | 273 | ALIVE | CERV2EditorAI, CERV2VersionHistory |
| 17 | `services/CERV2ExportService.js` | 235 | ALIVE | CERV2ExportControls, CERV2FullExportSimulation |
| 18 | `services/CERV2SectionService.js` | 367 | ALIVE | 510k/EnhancedDocumentVault, MedicalDeviceDocumentEditor |
| 19 | `services/CerValidationService.js` | 1,647 | ALIVE | cer/CerValidationPanel |
| 20 | `services/coauthorCollaborationService.js` | 555 | ALIVE | CoAuthor |
| 21 | `services/coauthorService.js` | 196 | ALIVE | CoAuthor, coauthor components |
| 22 | `services/coauthorWorkspaceService.js` | 42 | ALIVE | coauthor/DocumentSelector |
| 23 | `services/collaborationService.js` | 234 | ALIVE | hooks, CoAuthor, contexts |
| 24 | `services/copilotService.js` | 51 | ALIVE | CoAuthor |
| 25 | `services/DeviceProfileAPI.js` | 125 | ALIVE | controllers, api, 510k components |
| 26 | `services/DocumentAPIService.js` | 311 | ALIVE | cer/DocumentVaultPanel, cer/SaveCerToVaultButton |
| 27 | **`services/documentIntelligenceHub.js`** | **267** | **DEAD** | — |
| 28 | `services/DocumentIntelligenceService.js` | 1,722 | ALIVE | concept2cure/services/documentIntelligenceService.ts |
| 29 | `services/DocumentSectionRecommenderService.js` | 241 | ALIVE | documentrecommender components |
| 30 | `services/documentService.js` | 226 | ALIVE | cer/ReportHistoryPanel |
| 31 | `services/DocuShareService.js` | 537 | ALIVE | controllers, docushare panels |
| 32 | **`services/DraftingOrchestrator.ts`** | **109** | **DEAD** | — |
| 33 | **`services/ectdPyramidService.js`** | **1,265** | **DEAD** | — |
| 34 | `services/ectdTemplates.js` | 431 | ALIVE | templates/ectd/ectdTemplates.js |
| 35 | `services/ectdValidationService.js` | 476 | ALIVE | ValidationDashboard |
| 36 | **`services/EnterpriseService.js`** | **771** | **DEAD** | — |
| 37 | `services/errorHandling.js` | 112 | ALIVE | api/cer, cer components |
| 38 | `services/faers-api.js` | 117 | ALIVE | cer/FAERSIntegration |
| 39 | `services/FDA510kAIService.js` | 546 | ALIVE | MedicalDeviceDocumentEditor |
| 40 | `services/Fda510kExportService.js` | 357 | ALIVE | MedicalDeviceDocumentEditor |
| 41 | `services/FDA510kService.js` | 623 | ALIVE | controllers, tests, cer components |
| 42 | `services/FDA510kTemplateService.js` | 1,371 | ALIVE | MedicalDeviceDocumentEditor |
| 43 | `services/FDAPMAService.js` | 248 | ALIVE | CERV2Page |
| 44 | `services/googleAuthService.js` | 74 | ALIVE | CoAuthor |
| 45 | `services/googleDocsService.js` | 103 | ALIVE | CoAuthor |
| 46 | `services/indWizardService.js` | 453 | ALIVE | indwizard components |
| 47 | `services/ivdrBinderApi.ts` | 188 | ALIVE | concept2cure regulatory components |
| 48 | **`services/KnowledgeGraphClient.ts`** | **214** | **DEAD** | — |
| 49 | `services/LiteratureAPIService.js` | 633 | ALIVE | CERV2Page, cer/LiteratureReviewWorkflow, 510k components |
| 50 | `services/LiteratureFeatureService.js` | 85 | ALIVE | CERV2Page, 510k/LiteratureTab |
| 51 | `services/LiteratureRetrievalService.js` | 385 | ALIVE | cer/CerGeneratorPanel |
| 52 | `services/lumenService.js` | 152 | ALIVE | common/LumenChatPane |
| 53 | `services/ManagerSignOffService.js` | 211 | ALIVE | tests, 510k components |
| 54 | **`services/MashableService.js`** | **1,119** | **DEAD** | — |
| 55 | `services/MAUDService.js` | 475 | ALIVE | cer/MAUDIntegrationPanel |
| 56 | **`services/microsoftAuthService.js`** | **309** | **DEAD** | — |
| 57 | **`services/msCopilotService.js`** | **191** | **CHAIN-DEAD** | only by documentIntelligenceHub (DEAD) |
| 58 | `services/openaiService.js` | 252 | ALIVE | ValidationDashboard |
| 59 | `services/packageMonitorService.js` | 213 | ALIVE | App.jsx, utils, PackageHealthMonitor |
| 60 | `services/ProjectService.js` | 199 | ALIVE | project-manager/NextActionsSidebar |
| 61 | `services/ProjectTemplates.js` | 406 | ALIVE | 510k components |
| 62 | **`services/QmpService.js`** | **237** | **DEAD** | — |
| 63 | `services/realtimeService.js` | 129 | ALIVE | cer/GenerateFullCerButton |
| 64 | `services/RecommendationService.js` | 201 | ALIVE | docushare panels |
| 65 | `services/regulatory/globalPyramids.ts` | 39 | ALIVE | concept2cure/components/regulatory/index.ts |
| 66 | `services/RegulatoryIntelligenceCore.js` | 390 | ALIVE | MashableService (dead) + AIAssistantPanel (alive) |
| 67 | **`services/ResilienceService.js`** | **186** | **DEAD** | — |
| 68 | `services/SecurityService.js` | 318 | ALIVE | EnterpriseService, AdminService, admin/AdminModule, client-portal |
| 69 | `services/SemanticSearchService.js` | 274 | ALIVE | KAutomationController |
| 70 | **`services/sendValidationService.js`** | **593** | **DEAD** | — |
| 71 | **`services/sharePointIntegrationService.js`** | **264** | **DEAD** | — |
| 72 | `services/simulationService.js` | 184 | ALIVE | protocol/StatisticalDesign |
| 73 | `services/SmartSearchService.js` | 167 | ALIVE | docushare/SmartDocuSharePanel |
| 74 | `services/taskManagementService.js` | 521 | ALIVE | CoAuthor |
| 75 | `services/templates/ctdTemplates.json` | 35 | ALIVE | templates/ectd, data/ctd-templates, document/CTDTemplateManager |
| 76 | **`services/validationService.ts`** | **293** | **DEAD** | only by ValidationResultsPanel.tsx (mutual) |
| 77 | `services/vaultService.js` | 281 | ALIVE | CoAuthor, VaultMetadataPanel |
| 78 | **`services/wordIntegration.js`** | **478** | **DEAD** | — |
| 79 | **`services/WorkflowService.js`** | **519** | **DEAD** | — |

**Services DEAD + CHAIN-DEAD: 18 files, 7,805 lines**

---

## 4. `client/src/modules/` — Orphaned Module Files

| # | File | Lines | Status | Imported By |
|---|------|-------|--------|-------------|
| 1 | `modules/AnalyticsDashboard.jsx` | 12 | ALIVE | App.jsx, portal-v2, CSRIntelligence, ZenApp.tsx |
| 2 | `modules/CerGenerator.jsx` | 12 | ALIVE | cer/AiCerGenerator, cer/CerGeneratorPanel |
| 3 | `modules/cmc/CMCReportsTab.jsx` | 495 | ALIVE | CMCModule.jsx |
| 4 | `modules/CMCModule.jsx` | 934 | ALIVE | cmc/CMCPage.jsx |
| 5 | `modules/CmcWizard.jsx` | 16 | ALIVE | App.jsx, portal-v2 |
| 6 | **`modules/CsrAnalyzer.jsx`** | **12** | **DEAD** | — |
| 7 | **`modules/Module1AdminPage.jsx`** | **168** | **DEAD** | — |
| 8 | **`modules/Module2SummaryPage.jsx`** | **86** | **DEAD** | — |
| 9 | **`modules/Module3QualityPage.jsx`** | **126** | **DEAD** | — |
| 10 | **`modules/Module4NonclinicalPage.jsx`** | **73** | **DEAD** | — |
| 11 | **`modules/Module5ClinicalPage.jsx`** | **43** | **DEAD** | — |
| 12 | `modules/Vault.jsx` | 185 | ALIVE | KAutomationController, App.jsx, portal-v2 |

**Modules DEAD: 6 files, 508 lines**

---

## 5. `client/src/components/` (top-level) — Orphaned Components

| # | File | Lines | Status | Imported By |
|---|------|-------|--------|-------------|
| 1 | **`AcademicInsightsPanel.jsx`** | **255** | **DEAD** | — |
| 2 | **`AdaptiveLearningInterface.jsx`** | **366** | **DEAD** | — |
| 3 | **`AdminEmbeddingPanel.jsx`** | **334** | **DEAD** | — |
| 4 | **`AdvancedFeatureCards.jsx`** | **287** | **DEAD** | — |
| 5 | **`AIAssistantButton.jsx`** | **179** | **DEAD** | — |
| 6 | `AIAssistantPanel.jsx` | 409 | ALIVE | cmc/AISuggestionEngine, RoleDashboard, cmc components |
| 7 | **`AIStudyConversation.jsx`** | **719** | **CHAIN-DEAD** | only by SimilarStudyResults (chain-dead) |
| 8 | `AlertsDashboard.jsx` | 248 | ALIVE | portal-v2 |
| 9 | `AnaCortexChat.tsx` | 629 | ALIVE | pages/AnaCortex.tsx |
| 10 | **`AnalyticsQuickView.jsx`** | **212** | **DEAD** | only by analytics/AnalyticsQuickView (different file, not an import) |
| 11 | **`AnnotatedViewer.jsx`** | **28** | **DEAD** | — |
| 12 | **`AppPackagesBanner.hardcoded.jsx`** | **607** | **DEAD** | — |
| 13 | **`AppPackagesBanner.jsx`** | **545** | **CHAIN-DEAD** | only by .hardcoded (DEAD) |
| 14 | **`AssistantResponsePanel.jsx`** | **42** | **DEAD** | — |
| 15 | **`AuditDashboard.jsx`** | **28** | **DEAD** | — |
| 16 | **`BenchmarksModal.jsx`** | **210** | **DEAD** | — |
| 17 | **`BiotechRAGInterface.jsx`** | **1,253** | **DEAD** | — |
| 18 | `CategoryMultiSelect.tsx` | 120 | ALIVE | DeviceDataCenter.jsx |
| 19 | **`CERDashboardAccessButton.jsx`** | **19** | **DEAD** | — |
| 20 | `CERV2AttachmentManager.jsx` | 294 | ALIVE | CERV2EditorAI |
| 21 | `CERV2CitationManager.jsx` | 320 | ALIVE | CERV2EditorAI |
| 22 | `CERV2DeviceContextPanel.jsx` | 272 | ALIVE | CERV2EditorAI |
| 23 | `CERV2ExportControls.jsx` | 308 | ALIVE | CERV2EditorAI |
| 24 | `CERV2ExportPreviewPanel.jsx` | 399 | ALIVE | CERV2EditorAI |
| 25 | `CERV2FullExportSimulation.jsx` | 587 | ALIVE | CERV2EditorAI |
| 26 | `CERV2PredicateSearch.jsx` | 254 | ALIVE | CERV2EditorAI |
| 27 | `CERV2ReviewWorkflow.jsx` | 348 | ALIVE | CERV2EditorAI |
| 28 | `CERV2ValidationPanel.jsx` | 216 | ALIVE | CERV2EditorAI, CERV2ExportPreviewPanel |
| 29 | `CERV2VersionHistory.jsx` | 207 | ALIVE | CERV2EditorAI |
| 30 | `ChatPanel.jsx` | 472 | ALIVE | concept2cure/chat, csr/CSRChatPanel |
| 31 | **`CoAuthor_eCTD_Module_Review.jsx`** | **0** | **DEAD** | empty file |
| 32 | **`CoAuthor.jsx.VERSION_LOCK`** | **16** | **DEAD** | not a source file |
| 33 | `CommitmentExtractor.jsx` | 579 | ALIVE | CoAuthor |
| 34 | `CommitmentIntelligenceHub.jsx` | 4,379 | ALIVE | CoAuthor |
| 35 | **`CompetitorComparison.jsx`** | **133** | **DEAD** | — |
| 36 | `ComplianceInsights.jsx` | 337 | ALIVE | cmc/ComprehensiveCMCPlatformClean |
| 37 | **`ComplianceValidator.jsx`** | **434** | **DEAD** | — |
| 38 | `ContentPlanDialog.jsx` | 525 | ALIVE | CoAuthor |
| 39 | `ContentPlan.jsx` | 501 | ALIVE | CoAuthor, ContentPlanDialog |
| 40 | **`ConversationalAssistant.jsx`** | **263** | **DEAD** | — |
| 41 | **`CSRAlignmentBanner.jsx`** | **43** | **DEAD** | — |
| 42 | **`CSRAlignmentPanel.tsx`** | **373** | **CHAIN-DEAD** | only by csr/CSRAlignmentPanel.jsx (which is never imported) |
| 43 | `CSRAnalyticsDashboard.jsx` | 351 | ALIVE | CSRIntelligence, unified/tabs |
| 44 | `CSRAnalyticsTab.jsx` | 614 | ALIVE | CSRIntelligence, unified/tabs |
| 45 | `CSRBusinessValueDashboard.jsx` | 391 | ALIVE | CSRIntelligence, unified/tabs |
| 46 | **`CSRCounter.jsx`** | **56** | **DEAD** | — |
| 47 | **`CSRIntelligenceRebuilt.jsx`** | **464** | **DEAD** | — |
| 48 | **`CSRLibraryMetrics.jsx`** | **115** | **CHAIN-DEAD** | only by AppPackagesBanner (chain-dead) |
| 49 | `CSRSemanticAnalyzer.jsx` | 429 | ALIVE | CSRIntelligence, unified/tabs |
| 50 | `CSRValuePropositionTab.jsx` | 502 | ALIVE | CSRIntelligence, unified/tabs |
| 51 | **`CustomerValidation.jsx`** | **192** | **DEAD** | — |
| 52 | `Dashboard.jsx` | 216 | ALIVE | App.jsx, portal-v2 |
| 53 | **`DashboardSidebar.jsx`** | **309** | **DEAD** | — |
| 54 | **`DatabaseStatusIndicator.jsx`** | **92** | **DEAD** | only self-references useHealthCheck which only refs back |
| 55 | **`DataPrivacy.jsx`** | **35** | **DEAD** | — |
| 56 | **`DebugInfo.jsx`** | **225** | **DEAD** | — |
| 57 | **`DeltaAnalysisPanel.jsx`** | **150** | **DEAD** | — |
| 58 | **`DesignFromMolecule.jsx`** | **554** | **DEAD** | — |
| 59 | `DeviceDataCenterEnhanced.tsx` | 758 | ALIVE | CERV2Page |
| 60 | `DeviceDataCenter.jsx` | 1,275 | ALIVE | CERV2Page, DeviceDataCenterEnhanced |
| 61 | **`DirectDevInterface.jsx`** | **184** | **DEAD** | — |
| 62 | **`DocsChecklist.jsx`** | **48** | **CHAIN-DEAD** | only by INDAssembler (DEAD) |
| 63 | `DocumentCitationHelper.jsx` | 446 | ALIVE | MedicalDeviceDocumentEditor |
| 64 | `DocumentDataCenter.jsx` | 821 | ALIVE | vault/VaultPage, VaultPage |
| 65 | `DocumentDiffViewer.tsx` | 309 | ALIVE | fix-toast-references.js |
| 66 | **`DocumentEmbeddingInfo.jsx`** | **310** | **CHAIN-DEAD** | only by AdminEmbeddingPanel (DEAD) |
| 67 | `DocumentPreview.tsx` | 181 | ALIVE | CERV2Page, docushare panels, 510k |
| 68 | **`document_templates_section.jsx`** | **190** | **DEAD** | — |
| 69 | **`DocumentTypeSelector.jsx`** | **176** | **DEAD** | — |
| 70 | `DocumentUploadForm.jsx` | 573 | ALIVE | lumen-bio/CsrIntelligenceInsights |
| 71 | **`DocuShareVault.jsx`** | **473** | **CHAIN-DEAD** | only by enterprise/EnterpriseDocuShareVault (never imported) |
| 72 | **`DraftPanel.jsx`** | **239** | **DEAD** | — |
| 73 | **`DropoutEstimator.jsx`** | **74** | **DEAD** | — |
| 74 | **`DropoutSimulator.jsx`** | **164** | **DEAD** | — |
| 75 | `DropzoneUpload.jsx` | 108 | ALIVE | ImportPanel.jsx |
| 76 | **`EctdBuilder.jsx`** | **282** | **DEAD** | — |
| 77 | **`EmailArchiveButton.jsx`** | **151** | **DEAD** | — |
| 78 | **`EndpointEvaluator.jsx`** | **253** | **DEAD** | — |
| 79 | `EnhancedDocumentEditor.jsx` | 2,329 | ALIVE | App.jsx, CoAuthor, MedicalDeviceDocumentEditor, cmc |
| 80 | **`EnhancedProtocolIntelligencePanel.jsx`** | **354** | **DEAD** | — |
| 81 | **`EnhancedVideoWalkthroughs.jsx`** | **266** | **DEAD** | — |
| 82 | **`EnhancedVisionCards.jsx`** | **267** | **DEAD** | — |
| 83 | `ErrorBoundary.jsx` | 114 | ALIVE | App.jsx, main.tsx, ZenApp.tsx |
| 84 | **`ErrorRecoveryUI.jsx`** | **203** | **DEAD** | — |
| 85 | **`EsgSubmit.jsx`** | **314** | **DEAD** | — |
| 86 | **`ExampleReportPackages.jsx`** | **318** | **CHAIN-DEAD** | only by INDFullSolution (DEAD) |
| 87 | **`ExportLogPanel.jsx`** | **238** | **DEAD** | — |
| 88 | **`FDA510kEMREditor.jsx`** | **638** | **DEAD** | — |
| 89 | **`FDAFAERSGenerator.jsx`** | **254** | **DEAD** | — |
| 90 | `FDAFormGenerator.tsx` | 444 | ALIVE | CERV2Page |
| 91 | `FileUploader.jsx` | 174 | ALIVE | ValidationDashboard, ui/file-uploader, protocol |
| 92 | `FirstRunGuide.tsx` | 90 | ALIVE | cmc/ComprehensiveCMCPlatformClean, AnaBiostatsPanel |
| 93 | **`FixedProtocolViewer.jsx`** | **380** | **DEAD** | — |
| 94 | **`ForecastCard.jsx`** | **350** | **DEAD** | — |
| 95 | **`FormattedProtocolRecommendations.jsx`** | **93** | **DEAD** | — |
| 96 | **`GatedSalesInvestorAssets.jsx`** | **230** | **DEAD** | — |
| 97 | `GoogleDocsEmbed.jsx` | 29 | ALIVE | CoAuthor |
| 98 | **`GuidanceTooltip.jsx`** | **117** | **DEAD** | — |
| 99 | `HelpDrawer.tsx` | 35 | ALIVE | stability/SamplingWorkbench, cmc platform |
| 100 | **`HeroMessagingVariants.jsx`** | **189** | **DEAD** | — |
| 101 | **`HeroWithPersonas.jsx`** | **368** | **DEAD** | — |
| 102 | **`HighContrastModeToggle.jsx`** | **42** | **DEAD** | — |
| 103 | **`HistoryTable.jsx`** | **42** | **DEAD** | — |
| 104 | **`HomepageShowcaseSection.jsx`** | **667** | **DEAD** | — |
| 105 | `icons.jsx` | 60 | ALIVE | portal-v2, utils, pages |
| 106 | `ImportPanel.jsx` | 39 | ALIVE | CERV2Page, routes/quality, cmc |
| 107 | **`ImprovedLandingPage.jsx`** | **742** | **DEAD** | — |
| 108 | **`INDAssembler.jsx`** | **40** | **DEAD** | — |
| 109 | `InfoTip.tsx` | 32 | ALIVE | stability, quality routes |
| 110 | `InlineViewer.jsx` | 113 | ALIVE | docushare panels |
| 111 | **`InsightsModal.jsx`** | **119** | **DEAD** | — |
| 112 | **`IntelligenceCounter.jsx`** | **109** | **DEAD** | — |
| 113 | **`InteractiveTour.jsx`** | **107** | **DEAD** | — |
| 114 | **`KnowledgeBasePanel.jsx`** | **115** | **DEAD** | — |
| 115 | **`LandingHero.jsx`** | **33** | **DEAD** | — |
| 116 | `LandingPage.jsx` | 297 | ALIVE | App.jsx, ZenApp.tsx, SalesLandingPage, ZenRouter |
| 117 | **`LanguageSelector.jsx`** | **27** | **DEAD** | — |
| 118 | `Layout.jsx` | 24 | ALIVE | portal-v2 |
| 119 | `layout.tsx` | 66 | ALIVE | App.jsx, portal-v2 |
| 120 | **`LiveCodeMonitor.jsx`** | **178** | **DEAD** | — |
| 121 | **`LiveReviewRoom.jsx`** | **270** | **DEAD** | — |
| 122 | **`LumenAIAssistantContainer.jsx`** | **431** | **DEAD** | — |
| 123 | **`MainNavigation.jsx`** | **473** | **DEAD** | — |
| 124 | `MarkdownView.tsx` | 44 | ALIVE | routes/help |
| 125 | `MedicalDeviceDocumentEditor.jsx` | 4,145 | ALIVE | CERV2Page, CERV2EditorAI |
| 126 | `MetadataDynamicForm.tsx` | 141 | ALIVE | DeviceDataCenter |
| 127 | **`ModalPortal.tsx`** | **13** | **CHAIN-DEAD** | only by BenchmarksModal (DEAD) + InsightsModal (DEAD) |
| 128 | **`ModernDashboardUI.jsx`** | **346** | **DEAD** | — |
| 129 | **`Module1Forms.jsx`** | **29** | **DEAD** | — |
| 130 | **`Module2Narratives.jsx`** | **230** | **DEAD** | — |
| 131 | **`Module32Form.jsx`** | **109** | **DEAD** | — |
| 132 | **`Module3Benchling.jsx`** | **24** | **DEAD** | — |
| 133 | **`Module3Manual.jsx`** | **55** | **DEAD** | — |
| 134 | `ModuleSectionEditor.jsx` | 885 | ALIVE | App.jsx, ModuleSectionEditorPage |
| 135 | `NanoBananaImageGenerator.tsx` | 363 | ALIVE | concept2cure builders/reports |
| 136 | **`navbar.tsx`** | **176** | **CHAIN-DEAD** | only by AuroraAssistantButton (never imported) |
| 137 | `NavigationBanner.jsx` | 30 | ALIVE | VaultBrowser, EmbeddedVaultBrowser, CoAuthor |
| 138 | `Navigation.jsx` | 53 | ALIVE | portal-v2, routes |
| 139 | **`NextActionsSidebar.jsx`** | **176** | **CHAIN-DEAD** | only by project-manager/NextActionsSidebar (never imported) |
| 140 | `Office365WordEmbed.jsx` | 29 | ALIVE | CoAuthor |
| 141 | **`PackageHealthMonitor.jsx`** | **180** | **DEAD** | — |
| 142 | **`PeriodicReviewDashboard.jsx`** | **328** | **DEAD** | — |
| 143 | **`PersonaPages.jsx`** | **229** | **DEAD** | — |
| 144 | `ProjectForm.jsx` | 62 | ALIVE | TenantManagement |
| 145 | `ProjectList.jsx` | 38 | ALIVE | concept2cure/sidebar/ProjectsSidebar |
| 146 | `ProtectedRoute.jsx` | 39 | ALIVE | App.jsx, portal-v2, ZenRouter |
| 147 | **`ProtocolCorrectionSuggestions.tsx`** | **323** | **DEAD** | — |
| 148 | **`ProtocolEmailer.jsx`** | **119** | **DEAD** | — |
| 149 | **`ProtocolFieldAlignmentDisplay.jsx`** | **207** | **DEAD** | — |
| 150 | **`ProtocolImprovementPanel.jsx`** | **568** | **DEAD** | — |
| 151 | `ProtocolUploadPanel.jsx` | 75 | ALIVE | SummaryPacketGenerator (dead) + protocol/ProtocolUploadPanel |
| 152 | **`ProtocolValidator.jsx`** | **370** | **DEAD** | — |
| 153 | **`RedactionLog.jsx`** | **23** | **DEAD** | — |
| 154 | **`ReferenceModelAdmin.jsx`** | **587** | **DEAD** | — |
| 155 | **`RegionalExportModal.jsx`** | **390** | **DEAD** | — |
| 156 | **`RegionProfileSelector.jsx`** | **139** | **DEAD** | — |
| 157 | **`RegulatoryConfidenceStrip.jsx`** | **68** | **DEAD** | — |
| 158 | **`RegulatoryLogosInlineComponents.jsx`** | **186** | **CHAIN-DEAD** | only by RegulatoryConfidenceStrip (DEAD) |
| 159 | **`RegulatoryReadinessScore.jsx`** | **315** | **DEAD** | — |
| 160 | `RegulatoryRichTextEditor.jsx` | 407 | ALIVE | MedicalDeviceDocumentEditor |
| 161 | **`ReportsQuickWidget.jsx`** | **232** | **DEAD** | — |
| 162 | `ResearchCompanion.tsx` | 393 | ALIVE | use-research-companion, TopNavbar |
| 163 | **`RetentionDashboard.jsx`** | **444** | **DEAD** | — |
| 164 | `RiskMitigationPlanDialog.jsx` | 1,304 | ALIVE | CommitmentIntelligenceHub |
| 165 | **`RoleManager.jsx`** | **113** | **DEAD** | — |
| 166 | **`RulesSettings.jsx`** | **145** | **DEAD** | — |
| 167 | `SampleSizeCalculator.jsx` | 460 | ALIVE | StudyDesignAssistant |
| 168 | **`SectionTreeNavigator.jsx`** | **228** | **DEAD** | — |
| 169 | **`SelfHealingStatusPanel.jsx`** | **198** | **DEAD** | — |
| 170 | **`SessionSummaryPanel.jsx`** | **120** | **CHAIN-DEAD** | only by DropoutSimulator (DEAD) |
| 171 | `SidebarNav.jsx` | 53 | ALIVE | portal-v2 |
| 172 | `SidePanel.jsx` | 14 | ALIVE | ComplianceInsights, 510k, canvas |
| 173 | **`SimilarityGoalSearch.jsx`** | **372** | **DEAD** | — |
| 174 | **`SimilarStudyResults.jsx`** | **257** | **CHAIN-DEAD** | only by SimilarityGoalSearch (DEAD) |
| 175 | **`SimpleErrorBoundary.jsx`** | **52** | **DEAD** | — |
| 176 | **`SimpleLearningInterface.jsx`** | **227** | **DEAD** | — |
| 177 | **`SimplifiedLandingPage.jsx`** | **251** | **DEAD** | — |
| 178 | **`SmartAgentSidebar.css`** | **62** | **CHAIN-DEAD** | only by SmartAgentSidebar (DEAD) |
| 179 | **`SmartAgentSidebar.jsx`** | **66** | **DEAD** | — |
| 180 | `SmartFormsManager.tsx` | 531 | ALIVE | CERV2Page |
| 181 | **`SSOButton.jsx`** | **16** | **DEAD** | — |
| 182 | `StandardsPicker.tsx` | 91 | ALIVE | DeviceDataCenter |
| 183 | `StatCard.tsx` | 70 | ALIVE | portal-v2, client-portal, concept2cure |
| 184 | `StudyDesignAssistant.jsx` | 309 | ALIVE | studyArchitect, unified/tabs |
| 185 | `StudySessionSelector.tsx` | 392 | ALIVE | studyArchitect |
| 186 | **`SubscriptionTiers.jsx`** | **199** | **DEAD** | — |
| 187 | `SubtypeSelect.jsx` | 184 | ALIVE | DocumentUploadForm |
| 188 | **`SuccessProbabilityEstimator.jsx`** | **172** | **DEAD** | — |
| 189 | **`SummaryPacketArchive.jsx`** | **620** | **DEAD** | — |
| 190 | **`SummaryPacketGenerator.jsx`** | **111** | **DEAD** | — |
| 191 | **`TaskEnhancements.jsx`** | **882** | **DEAD** | — |
| 192 | **`TaskManagementHub.jsx`** | **1,029** | **DEAD** | — |
| 193 | `templateRegistry.ts` | 88 | ALIVE | MetadataDynamicForm |
| 194 | `TimeScrubber.jsx` | 34 | ALIVE | ComplianceInsights |
| 195 | **`TopNavigation.jsx`** | **78** | **CHAIN-DEAD** | only by layout/TopNavigation (never imported) |
| 196 | `TopNav.jsx` | 78 | ALIVE | App.jsx, ModuleDashboard, TopNavigation, TopNavbar, UnifiedTopNav |
| 197 | **`TourContext.jsx`** | **69** | **CHAIN-DEAD** | only by InteractiveTour (DEAD) |
| 198 | `TourOverlay.tsx` | 211 | ALIVE | cmc/ComprehensiveCMCPlatformClean |
| 199 | `TypeBreadcrumb.jsx` | 83 | ALIVE | DocumentUploadForm, PeriodicReviewDashboard |
| 200 | `UnifiedTaskCreationModal.jsx` | 510 | ALIVE | UnifiedTaskDashboard, cmc platform |
| 201 | `UnifiedTaskDashboard.jsx` | 678 | ALIVE | App.jsx |
| 202 | **`UseCaseGallery.jsx`** | **287** | **DEAD** | — |
| 203 | `UseCaseLibrary.jsx` | 263 | ALIVE | use-case-library components |
| 204 | **`ValidationResultsPanel.tsx`** | **350** | **DEAD** | only by validationService.ts (mutual dead pair) |
| 205 | **`VaultAssistant.jsx`** | **502** | **DEAD** | — |
| 206 | **`VaultConciergeAI.jsx`** | **530** | **DEAD** | — |
| 207 | **`VaultMetadataPanel.jsx`** | **376** | **DEAD** | — |
| 208 | **`VaultQuickAccess.jsx`** | **146** | **DEAD** | — |
| 209 | **`VoiceMic.jsx`** | **286** | **DEAD** | — |
| 210 | **`WelcomeAnimation.jsx`** | **170** | **DEAD** | — |
| 211 | **`WorkingVault.jsx`** | **187** | **CHAIN-DEAD** | only by RealCoAuthor (DEAD) |

**Components (top-level) DEAD + CHAIN-DEAD: 94 files, 24,471 lines**

---

## Flat Delete List (all DEAD + CHAIN-DEAD files)

```
# Pages (8 files, 3,252 lines)
client/src/pages/admin/ModernTaskDashboard.jsx
client/src/pages/admin/QualityDashboard.jsx
client/src/pages/coauthor/RealCoAuthor.jsx
client/src/pages/coauthor/SimpleDocumentCreator.jsx
client/src/pages/HomeLanding.jsx
client/src/pages/ind/INDFullSolution.jsx
client/src/pages/regulatory/IVDRModulePage.jsx
client/src/pages/reports/reportDashboardConfig.js

# Hooks (20 files, 2,603 lines)
client/src/hooks/use-auth.tsx
client/src/hooks/useCERGenerator.jsx
client/src/hooks/useContextualGuidance.js
client/src/hooks/useDocumentRiskAnalysis.jsx
client/src/hooks/useDocuShareComponents.js
client/src/hooks/useFirstRun.test.tsx
client/src/hooks/useFreezeDetection.jsx
client/src/hooks/useHealthMonitor.jsx
client/src/hooks/useLearningProfile.jsx
client/src/hooks/useLearningService.ts
client/src/hooks/useLicenseCheck.js
client/src/hooks/useMemoryOptimization.jsx
client/src/hooks/useModuleSettings.js
client/src/hooks/useNetworkResilience.jsx
client/src/hooks/useQcSocket.js
client/src/hooks/useQcSocket.ts
client/src/hooks/use-theme.ts
client/src/hooks/use-title.ts
client/src/hooks/use-toast-context.tsx
client/src/hooks/useWindowSize.js

# Services (18 files, 7,805 lines)
client/src/services/AdminService.js
client/src/services/CerAiValidationService.js
client/src/services/CerQualityGatingService.js
client/src/services/documentIntelligenceHub.js
client/src/services/DraftingOrchestrator.ts
client/src/services/ectdPyramidService.js
client/src/services/EnterpriseService.js
client/src/services/KnowledgeGraphClient.ts
client/src/services/MashableService.js
client/src/services/microsoftAuthService.js
client/src/services/msCopilotService.js
client/src/services/QmpService.js
client/src/services/ResilienceService.js
client/src/services/sendValidationService.js
client/src/services/sharePointIntegrationService.js
client/src/services/validationService.ts
client/src/services/wordIntegration.js
client/src/services/WorkflowService.js

# Modules (6 files, 508 lines)
client/src/modules/CsrAnalyzer.jsx
client/src/modules/Module1AdminPage.jsx
client/src/modules/Module2SummaryPage.jsx
client/src/modules/Module3QualityPage.jsx
client/src/modules/Module4NonclinicalPage.jsx
client/src/modules/Module5ClinicalPage.jsx

# Components top-level (94 files, 24,471 lines)
client/src/components/AcademicInsightsPanel.jsx
client/src/components/AdaptiveLearningInterface.jsx
client/src/components/AdminEmbeddingPanel.jsx
client/src/components/AdvancedFeatureCards.jsx
client/src/components/AIAssistantButton.jsx
client/src/components/AIStudyConversation.jsx
client/src/components/AnalyticsQuickView.jsx
client/src/components/AnnotatedViewer.jsx
client/src/components/AppPackagesBanner.hardcoded.jsx
client/src/components/AppPackagesBanner.jsx
client/src/components/AssistantResponsePanel.jsx
client/src/components/AuditDashboard.jsx
client/src/components/BenchmarksModal.jsx
client/src/components/BiotechRAGInterface.jsx
client/src/components/CERDashboardAccessButton.jsx
client/src/components/CoAuthor_eCTD_Module_Review.jsx
client/src/components/CoAuthor.jsx.VERSION_LOCK
client/src/components/CompetitorComparison.jsx
client/src/components/ComplianceValidator.jsx
client/src/components/ConversationalAssistant.jsx
client/src/components/CSRAlignmentBanner.jsx
client/src/components/CSRAlignmentPanel.tsx
client/src/components/CSRCounter.jsx
client/src/components/CSRIntelligenceRebuilt.jsx
client/src/components/CSRLibraryMetrics.jsx
client/src/components/CustomerValidation.jsx
client/src/components/DashboardSidebar.jsx
client/src/components/DatabaseStatusIndicator.jsx
client/src/components/DataPrivacy.jsx
client/src/components/DebugInfo.jsx
client/src/components/DeltaAnalysisPanel.jsx
client/src/components/DesignFromMolecule.jsx
client/src/components/DirectDevInterface.jsx
client/src/components/DocsChecklist.jsx
client/src/components/document_templates_section.jsx
client/src/components/DocumentEmbeddingInfo.jsx
client/src/components/DocumentTypeSelector.jsx
client/src/components/DocuShareVault.jsx
client/src/components/DraftPanel.jsx
client/src/components/DropoutEstimator.jsx
client/src/components/DropoutSimulator.jsx
client/src/components/EctdBuilder.jsx
client/src/components/EmailArchiveButton.jsx
client/src/components/EndpointEvaluator.jsx
client/src/components/EnhancedProtocolIntelligencePanel.jsx
client/src/components/EnhancedVideoWalkthroughs.jsx
client/src/components/EnhancedVisionCards.jsx
client/src/components/ErrorRecoveryUI.jsx
client/src/components/EsgSubmit.jsx
client/src/components/ExampleReportPackages.jsx
client/src/components/ExportLogPanel.jsx
client/src/components/FDA510kEMREditor.jsx
client/src/components/FDAFAERSGenerator.jsx
client/src/components/FixedProtocolViewer.jsx
client/src/components/ForecastCard.jsx
client/src/components/FormattedProtocolRecommendations.jsx
client/src/components/GatedSalesInvestorAssets.jsx
client/src/components/GuidanceTooltip.jsx
client/src/components/HeroMessagingVariants.jsx
client/src/components/HeroWithPersonas.jsx
client/src/components/HighContrastModeToggle.jsx
client/src/components/HistoryTable.jsx
client/src/components/HomepageShowcaseSection.jsx
client/src/components/ImprovedLandingPage.jsx
client/src/components/INDAssembler.jsx
client/src/components/InsightsModal.jsx
client/src/components/IntelligenceCounter.jsx
client/src/components/InteractiveTour.jsx
client/src/components/KnowledgeBasePanel.jsx
client/src/components/LandingHero.jsx
client/src/components/LanguageSelector.jsx
client/src/components/LiveCodeMonitor.jsx
client/src/components/LiveReviewRoom.jsx
client/src/components/LumenAIAssistantContainer.jsx
client/src/components/MainNavigation.jsx
client/src/components/ModalPortal.tsx
client/src/components/ModernDashboardUI.jsx
client/src/components/Module1Forms.jsx
client/src/components/Module2Narratives.jsx
client/src/components/Module32Form.jsx
client/src/components/Module3Benchling.jsx
client/src/components/Module3Manual.jsx
client/src/components/navbar.tsx
client/src/components/NextActionsSidebar.jsx
client/src/components/PackageHealthMonitor.jsx
client/src/components/PeriodicReviewDashboard.jsx
client/src/components/PersonaPages.jsx
client/src/components/ProtocolCorrectionSuggestions.tsx
client/src/components/ProtocolEmailer.jsx
client/src/components/ProtocolFieldAlignmentDisplay.jsx
client/src/components/ProtocolImprovementPanel.jsx
client/src/components/ProtocolValidator.jsx
client/src/components/RedactionLog.jsx
client/src/components/ReferenceModelAdmin.jsx
client/src/components/RegionalExportModal.jsx
client/src/components/RegionProfileSelector.jsx
client/src/components/RegulatoryConfidenceStrip.jsx
client/src/components/RegulatoryLogosInlineComponents.jsx
client/src/components/RegulatoryReadinessScore.jsx
client/src/components/ReportsQuickWidget.jsx
client/src/components/RetentionDashboard.jsx
client/src/components/RoleManager.jsx
client/src/components/RulesSettings.jsx
client/src/components/SectionTreeNavigator.jsx
client/src/components/SelfHealingStatusPanel.jsx
client/src/components/SessionSummaryPanel.jsx
client/src/components/SimilarityGoalSearch.jsx
client/src/components/SimilarStudyResults.jsx
client/src/components/SimpleErrorBoundary.jsx
client/src/components/SimpleLearningInterface.jsx
client/src/components/SimplifiedLandingPage.jsx
client/src/components/SmartAgentSidebar.css
client/src/components/SmartAgentSidebar.jsx
client/src/components/SSOButton.jsx
client/src/components/SubscriptionTiers.jsx
client/src/components/SuccessProbabilityEstimator.jsx
client/src/components/SummaryPacketArchive.jsx
client/src/components/SummaryPacketGenerator.jsx
client/src/components/TaskEnhancements.jsx
client/src/components/TaskManagementHub.jsx
client/src/components/TopNavigation.jsx
client/src/components/TourContext.jsx
client/src/components/UseCaseGallery.jsx
client/src/components/ValidationResultsPanel.tsx
client/src/components/VaultAssistant.jsx
client/src/components/VaultConciergeAI.jsx
client/src/components/VaultMetadataPanel.jsx
client/src/components/VaultQuickAccess.jsx
client/src/components/VoiceMic.jsx
client/src/components/WelcomeAnimation.jsx
client/src/components/WorkingVault.jsx
```

---

## Notes

1. **CHAIN-DEAD** files are technically "imported" but only by other dead files — removing the parent dead file makes them unreachable.
2. **`fix-toast-references.js`** is a dead migration script that references several hooks/components. Everything it references should NOT be considered alive.
3. **`useQCWebSocket.js/.ts/.tsx`** cross-reference each other but are never imported by any component. They appear "alive" due to mutual refs but are functionally dead. Not marked DEAD here because they have 3+ cross-refs, but flagged for manual review.
4. **`useWindowSize.js`** is kept alive only by `CanvasWorkbenchV2.jsx` — verify that canvas feature is still active.
5. **`ectdTemplates.js`** (service) is only referenced by `templates/ectd/ectdTemplates.js` which itself has no importers — both are effectively dead.
6. **`useHealthCheck.js`** and **`DatabaseStatusIndicator.jsx`** reference each other with no external consumers — both are effectively dead.
