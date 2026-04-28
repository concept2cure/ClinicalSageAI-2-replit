/**
 * @fileoverview Zen App - Complete Application Shell
 * @module concept2cure/ZenApp
 * @version 3.0.0
 *
 * @description
 * The "New iPhone" of regulatory intelligence - complete minimalist application.
 * Combines all zen components into a cohesive, elegant experience.
 *
 * NOW CONNECTED TO:
 * - AnA 1.0 RI (AI chat)
 * - Project Cortex (data harvesting)
 * - Unified data layers
 *
 * Layout:
 * - Collapsible sidebar with conversations
 * - Main chat area (Claude.ai style)
 * - Tool panels slide from right (like Claude artifacts)
 * - Command palette (⌘K)
 * - Settings modal
 * - Project switcher
 *
 * @compliance
 * - FDA 21 CFR Part 11: Full audit trail
 * - WCAG 2.1 AA: Accessible throughout
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ZenSidebar } from './components/sidebar/ZenSidebar';
import { ZenCommandPalette } from './components/command/ZenCommandPalette';

// Stage 10 extracted modules
import {
  type ToolPanel,
  type LayoutMode,
  PRIMARY_NAV_ID_BY_LAYOUT,
  LEGACY_NAV_ID_BY_LAYOUT,
  SIDEBAR_NAV_TO_LAYOUT as SIDEBAR_NAV_TO_LAYOUT_EXTRACTED,
  normalizeIndustryMode,
  TOOL_PANELS,
  getProjectColor,
} from './zen-app-constants';
import { useZenKeyboardShortcuts } from './hooks/useZenKeyboardShortcuts';
import { useUserProfileFromStorage } from './hooks/useUserProfileFromStorage';
import { useWorkspaceSuggestedActions } from './hooks/useWorkspaceSuggestedActions';
const ZenSettings = React.lazy(() =>
  import('./components/settings/ZenSettings').then(m => ({ default: m.ZenSettings }))
);
import { NewProjectModal } from './components/projects/ProjectSwitcher';
import ProjectConfigPanel from './components/workspace/ProjectConfigPanel';
// [BATCH 3] WorkflowTimeline — renderer removed, import kept for type compatibility
// [BATCH 3] ProjectFilesCompact — unused, import removed
import { ProjectHeaderBar, getProjectAccentColor } from './components/workspace/ProjectHeaderBar';
// [BATCH 3] CustomInstructions — knowledge-base renderer removed
import { useProjectTasks } from './hooks/useProjectTasks';
import { useAuthoringIntelligence } from './hooks/useAuthoringIntelligence';
import { useProjects } from './hooks/useProjects';
import { useCortexThreads, useCortexHealth, useDeleteCortexThread } from './hooks/useCortex';
import { cortexService } from './services/cortexService';
import { usePlatformContext } from './hooks/useLicense';
import { useWorkspaceSummary } from './hooks/useWorkspaceSummary';
import { useReadinessAssessment } from './hooks/useOrchestration';
import {
  useProjectIntelligence,
  useNextBestActions,
  useRecommendations,
} from './hooks/useIntelligence';

import { ProjectWorkspaceShell } from './components/workspace/ProjectWorkspaceShell';
import { ErrorBoundary } from './components/ErrorBoundary';
// IndustryMode type unused — removed
// [BATCH 3] ProductAuditQuestionnaire — renderer removed
import { isFeatureEnabled } from '@/flags/featureFlags';
import { getProjectModuleRoutePolicy } from './router/projectModuleRoutePolicy';
import { evaluateApprovedRoute } from './router/approvedRoutePolicy';
import { normalizeLayoutMode } from './router/zenRouteNormalization';
import { Embedded510kHost, EmbeddedPMAHost, EmbeddedCERHost } from './components/shell/EmbeddedModuleHosts';

// Lazy-load CERV2Page for embedded module rendering inside the shell
const EmbeddedCERV2Page = lazy(() => import('@/pages/csr/CERV2Page'));
// Lazy-load PMA Workspace for embedded module rendering
const EmbeddedPMAWorkspace = lazy(() => import('./components/pma/PMAWorkspace'));
// Lazy-load FDA 510(k) Workspace — real 7-stage workflow (replaces CERV2 misrouting)
const FDA510kWorkspacePage = lazy(() => import('./pages/FDA510kWorkspacePage'));
// [BATCH 1 DELETED] LandingPage, CommandCenterHub, IntelligenceHub, AnaDashboard,
// AboutTrainingCenter, LegalCenter, IntegrationsPage, SubmissionOpsCommandCenter, INDWorkspace, PricingPage
// Full Document Builder wizard (CSR + CTD across global agencies)
const FullDocumentBuilder = lazy(() => import('./components/builder/FullDocumentBuilder'));
// Tools Landing — curated workbench (builder is one tool inside it)
const ToolsLanding = lazy(() => import('./components/workspace/ToolsLanding'));
import {
  X,
  ChevronLeft,
  Maximize2,
  Minimize2,
  WifiOff,
  FileText,
  Plus,
  ArrowLeft,
  FlaskConical,
  Star,
  MessageSquare,
  Brain,
  Loader2,
  Search,
  ChevronDown,
} from 'lucide-react';
import { LoadingState, ErrorState } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Canonical loading fallback for Suspense boundaries
const ModuleLoadingFallback = () => (
  <div className="flex-1 bg-white p-6">
    <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
      <div className="h-6 bg-stone-100 rounded w-1/3" />
      <div className="h-3 bg-stone-50 rounded w-2/3" />
      <div className="mt-6 space-y-3">
        <div className="h-32 bg-stone-50 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-20 bg-stone-50 rounded-lg" />
          <div className="h-20 bg-stone-50 rounded-lg" />
          <div className="h-20 bg-stone-50 rounded-lg" />
        </div>
      </div>
    </div>
  </div>
);

// Utility: instantly redirect dead layout modes to regulatory-workspace
const RedirectToWorkspace: React.FC<{ onRedirect: () => void }> = ({ onRedirect }) => {
  React.useEffect(() => {
    onRedirect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

// Lazy load the Convergent Canvas for the Sherpa System
// [BATCH 3] ConvergentCanvas (Sherpa mode) — renderer removed

// Enablement Center — Dr. Sage + AnA 1.0 dual-AI enablement hub
// [BATCH 3] EnablementCenter — renderer removed

// [Phase A] Dr. Sage removed — AnA is the single guide identity
// import DrSageGlobalLayer from './components/dr-sage/DrSagePanel';

// AnA Persistent Panel — always-available AI conversation on every page
import { Ana } from './components/ana';
import { useAnaChat } from './components/ana/useAnaChat';
import { Concept2CureHome } from './components/concept2cure-home';
import { BundleSurfaceFrame } from './components/bundle-surface-frame';
import {
  ClaudeEctdCoauthor,
  useEctdAuthoringData,
  useEctdReadiness,
} from './components/claude-ectd-coauthor';
import { GlobalOperatingShell } from './components/shell/GlobalOperatingShell';

// Canonical authoring context resolver
import { resolveAuthoringContext } from './services/authoring-context-resolver';
import type {
  AuthoringContextPack,
  ReadinessSnapshot,
  ContradictionEntry,
} from '../../../shared/types/authoring-context';

// First-run onboarding experience
const FirstRunExperience = lazy(() => import('./components/enablement/FirstRunExperience'));

// [BATCH 3] SnowGlobe — removed as user-reachable world

// [BATCH 1 DELETED] AboutTrainingCenter

// [BATCH 3] MissionControl + RulesManager — removed as user-reachable world

// [BATCH 1 DELETED] INDWorkspace

// [BATCH cleanup] INDRightRail — unused, lazy import removed

// [BATCH 1 DELETED] SubmissionOpsCommandCenter

// ─── Regulatory module standalones ────────────────────────────────────────────
// Document Editor panel (bridge to UnifiedDocumentEditor + live APIs)
const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then(m => ({ default: m.default }))
);
// [BATCH 3] ECTDCoAuthorStandalone — standalone mode removed, redirects to documents

// AnA 1.0 Intelligence Home (evidence-first landing surface)
const RICopilotHome = lazy(() =>
  import('./components/intelligence/RICopilotHome').then(m => ({
    default: m.RICopilotHome,
  }))
);

// Precedent Intelligence Dashboard (standalone 4-tab view)
const PrecedentIntelligenceDashboard = lazy(() =>
  import('./components/precedent/PrecedentIntelligenceDashboard').then(m => ({
    default: m.PrecedentIntelligenceDashboard,
  }))
);

// DocumentAppHub removed — absorbed into workspace flow (Wave 2)
// ProjectLauncher removed — all project routes go directly to regulatory-workspace

// ─── Regulatory module lazy-loads for tool panels ─────────────────────────────
const CAPAManagementPanel = lazy(() =>
  import('./components/regulatory/CAPAManagement').then(m => ({ default: m.default }))
);
const PostMarketSurveillancePanel = lazy(() =>
  import('./components/regulatory/PostMarketSurveillance').then(m => ({ default: m.default }))
);
const InspectionReadinessPanel = lazy(() =>
  import('./components/regulatory/InspectionReadiness').then(m => ({ default: m.default }))
);
const ECTDNavigatorPanel = lazy(() =>
  import('./components/regulatory/ECTDNavigator').then(m => ({ default: m.default }))
);
const StudyProtocolDesignerPanel = lazy(() =>
  import('./components/clinical/StudyProtocolDesigner').then(m => ({ default: m.default }))
);
const SOPManagementPanel = lazy(() =>
  import('./components/quality/SOPManagement').then(m => ({ default: m.default }))
);
const RegulatoryIntelligenceFullPanel = lazy(() =>
  import('./components/intelligence/RegulatoryIntelligencePanel').then(m => ({
    default: m.default,
  }))
);
const VaultBrowserPanel = lazy(() =>
  import('@/components/sharepoint/SharePointFileManager').then(m => ({ default: m.default }))
);

// [BATCH 3] CMC, Vault, StudyArchitect, Templates — standalone modes removed, redirect to documents

const IntelligentReportGenerator = lazy(
  () => import('./components/reports/IntelligentReportGenerator')
);

// [BATCH 1 DELETED] AnaDashboard

const SafetyNarrativePage = lazy(() => import('./pages/SafetyNarrative'));

// [BATCH 3] AnaPlatformControlPage — demoted, redirect to projects

const DocumentCanvasPanel = lazy(() =>
  import('./components/workspace/DocumentCanvasPanel').then(m => ({
    default: m.DocumentCanvasPanel,
  }))
);
const ProjectKnowledgePanel = lazy(() =>
  import('./components/workspace/ProjectKnowledgePanel').then(m => ({
    default: m.ProjectKnowledgePanel,
  }))
);

// ─── Unified workflow components ─────────────────────────────────────────────
const ProjectHomeDashboard = lazy(() =>
  import('./components/workflow/ProjectHomeDashboard').then(m => ({
    default: m.ProjectHomeDashboard,
  }))
);
const DossierMap = lazy(() =>
  import('./components/workflow/DossierMap').then(m => ({ default: m.DossierMap }))
);
const SectionWorkspace = lazy(() =>
  import('./components/workflow/SectionWorkspace').then(m => ({ default: m.SectionWorkspace }))
);
const SubmissionReadinessView = lazy(() =>
  import('./components/workflow/SubmissionReadiness').then(m => ({
    default: m.SubmissionReadiness,
  }))
);
const SubmissionBuilderView = lazy(() =>
  import('./components/submission/SubmissionBuilder').then(m => ({
    default: m.default,
  }))
);
const ProjectTaskBoardView = lazy(() =>
  import('./components/workspace/ProjectTaskBoard').then(m => ({
    default: m.ProjectTaskBoard,
  }))
);
const CSRWorkflowView = lazy(() =>
  import('./components/workflow/CSRWorkflow').then(m => ({
    default: m.CSRWorkflow,
  }))
);
const INDChecklistView = lazy(() =>
  import('./components/workflow/INDChecklist').then(m => ({
    default: m.INDChecklist,
  }))
);
const TemplateLibraryView = lazy(() =>
  import('./components/submission/TemplateLibrary').then(m => ({
    default: m.default,
  }))
);
const HAQManagerView = lazy(() =>
  import('./components/workflow/HAQManager').then(m => ({
    default: m.HAQManager,
  }))
);

// ─── New intent-organized workspace lazy loads ──────────────────────────────
// [BATCH 1 DELETED] IntelligenceHub
// [BATCH cleanup] RegulatoryPrecedentIntelligence — unused, lazy import removed
const ReviewReadiness = lazy(() =>
  import('./pages/ReviewReadiness').then(m => ({ default: m.ReviewReadiness }))
);
// [BATCH 1 DELETED] CommandCenterHub

// [BATCH 3] ClientIntelligencePage — demoted, redirect to projects

// [BATCH 3] CollaborationHubPage — demoted, redirect to projects

// [BATCH 3] UserInboxPage — demoted, redirect to projects

// [BATCH 3] ClientBrandingSettings — demoted, redirect to projects

// Biostatistics Platform — statistical analysis, power calculations, endpoints
const BiostatPlatformDashboard = lazy(
  () => import('@/components/biostat/BiostatPlatformDashboard')
);

// AnA Biostats Panel — structured input, computation, judgment, governed documents
const AnaBiostatsPanel = lazy(() => import('@/concept2cure/components/biostats/AnaBiostatsPanel'));

// [BATCH 3] TrainingManagementPage — demoted, redirect to projects
// [BATCH 1 DELETED] IntegrationsPage

// Agent Hub and Review Pulse removed — shell-only modules not demo-ready

// [BATCH 3] OnboardingWizardPage — demoted, redirect to projects

// Knowledge Base — account-level skills, .MD upload, materials ingestion
// Already imported: CustomInstructions from './components/knowledge/CustomInstructions'

// Project Knowledge — project-level context, uploads, sources
// Already lazy-loaded: ProjectKnowledgePanel

// [BATCH 1 DELETED] LegalCenter

// [BATCH cleanup] PlatformHome — unused, lazy import removed

// ─── New global destination pages (Phase 1 OS restructure) ──────────────────
const AppsPage = lazy(() => import('./pages/AppsPage'));
const DeviceDiagnosticsWorkbenchPage = lazy(() => import('./pages/DeviceDiagnosticsWorkbenchPage'));
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'));
const VaultPage = lazy(() => import('./pages/VaultPage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));

// [BATCH 3] ArtifactsGalleryPage — demoted, redirect to documents

// [BATCH 3] PlatformAdminPage — demoted, redirect to projects

// [BATCH 3] BiologicsDashboardPage — demoted, redirect to projects

// [BATCH 3] CTDOnboardingWizardPage — demoted, redirect to projects

// Project Sidebar — Claude.ai-style right sidebar (Context, Instructions, Files)
// ProjectSidebar — unused import removed

// Map panel keys to lazy components
// Early-access modules (capa, pms, inspection) gated behind feature flag
const PANEL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ...(isFeatureEnabled('ENABLE_EARLY_ACCESS_MODULES')
    ? {
        capa: CAPAManagementPanel,
        pms: PostMarketSurveillancePanel,
        inspection: InspectionReadinessPanel,
      }
    : {}),
  ectd: ECTDNavigatorPanel,
  protocol: StudyProtocolDesignerPanel,
  sop: SOPManagementPanel,
  intelligence: RegulatoryIntelligenceFullPanel,
  vault: VaultBrowserPanel,
  'doc-editor': EditorPanel,
  'ana-biostats': AnaBiostatsPanel,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ToolPanel and LayoutMode types imported from ./zen-app-constants

// PRIMARY_NAV_ID_BY_LAYOUT and LEGACY_NAV_ID_BY_LAYOUT imported from ./zen-app-constants

// INDUSTRY_MODES and normalizeIndustryMode imported from ./zen-app-constants

// UserProfile type imported from ./zen-app-constants

const PROJECT_SCOPED_LAYOUTS: ReadonlySet<LayoutMode> = new Set([
  'project-home',
  'documents',
  'review',
  'submissions',
  'dossier-map',
  'section-workspace',
  'csr-workflow',
  'ind-checklist',
  'template-library',
  'regulatory-workspace',
  'editor',
  'precedent-intelligence',
  'biostatistics',
  'review-readiness',
  'report-engine',
  'safety-narrative',
  'device-diagnostics-workbench',
  'vault-workspace',
  'task-board',
]);

const isProjectScopedLayout = (layout: LayoutMode): boolean => PROJECT_SCOPED_LAYOUTS.has(layout);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PANEL CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

// TOOL_PANELS and getProjectColor imported from ./zen-app-constants

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PANEL WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolPanelWrapperProps {
  panel: Exclude<ToolPanel, null>;
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const ToolPanelWrapper: React.FC<ToolPanelWrapperProps> = ({
  panel,
  onClose,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const config = TOOL_PANELS[panel];
  const Icon = config.icon;
  const PanelComponent = PANEL_COMPONENTS[panel];

  if (!PanelComponent) {
    return (
      <div
        className={cn(
          'flex flex-col h-full bg-white border-l border-stone-200',
          isFullscreen ? 'w-full' : 'w-full sm:w-80 md:w-96 lg:w-[600px]'
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-stone-100 bg-stone-50/50">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-stone-600" />
              <span className="font-medium text-stone-900">{config.title}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ErrorState
          title="Tool unavailable"
          message={`${config.title} is not enabled in this workspace.`}
          details="This panel has no mounted component in the current shell configuration."
          testId="tool-panel-unavailable"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white border-l border-stone-200',
        isFullscreen ? 'w-full' : 'w-full sm:w-80 md:w-96 lg:w-[600px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-stone-600" />
            <span className="font-medium text-stone-900">{config.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto zen-scroll">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <LoadingState size="sm" message="" />
              </div>
            }
          >
            <PanelComponent />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD — Real data from project/artifact APIs
// ═══════════════════════════════════════════════════════════════════════════════

// [BATCH 4] AnalyticsDashboardInline deleted — dead code (~200 lines)

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN APP
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenAppProps {
  initialProjectId?: string;
  initialConversationId?: string;
}

export const ZenApp: React.FC<ZenAppProps> = ({ initialProjectId, initialConversationId } = {}) => {
  // ─────────────────────────────────────────────────────────────────────────────
  // URL-DRIVEN PROJECT IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const embedModulesEnabled = isFeatureEnabled('EMBED_MODULES_IN_SHELL');
  const projectModuleRoutePolicy = useMemo(
    () => getProjectModuleRoutePolicy(location, embedModulesEnabled),
    [location, embedModulesEnabled]
  );
  const urlProjectId = projectModuleRoutePolicy.projectId;

  // ─────────────────────────────────────────────────────────────────────────────
  // EMBEDDED MODULE DETECTION
  // When EMBED_MODULES_IN_SHELL is enabled and URL has /project/:id/510k,
  // render CERV2Page inside the shell frame instead of as a standalone page.
  // ─────────────────────────────────────────────────────────────────────────────
  const embeddedModule = projectModuleRoutePolicy.shouldRenderInShell
    ? projectModuleRoutePolicy.module
    : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA HOOKS (Connected to Cortex + Data Layer)
  // ─────────────────────────────────────────────────────────────────────────────

  // Cortex health check
  const { data: cortexHealth } = useCortexHealth({ refetchInterval: 30000 });
  const isConnected = cortexHealth?.status === 'healthy';

  // License gating + user intelligence (personalized context)
  const {
    industryMode: orgIndustryMode,
    greeting: platformGreeting,
    intelligence: userIntelligence,
    // lastWorkSummary, nextTask — unused, not destructured
  } = usePlatformContext();

  // Workspace summary — real counts, org, recent activity, next actions
  const { data: workspaceSummary } = useWorkspaceSummary();

  // Projects from database
  const {
    projects: rawProjects,
    createProject: createProjectMutation,
    updateProject: updateProjectMutation,
    deleteProject: deleteProjectMutation,
    updateOwnershipPreferences: updateOwnershipPreferencesMutation,
  } = useProjects();

  // Map DB submission type strings to the UI SubmissionType enum
  function mapSubmissionType(raw: string): string {
    const map: Record<string, string> = {
      clinical_trial: 'IND',
      regulatory_submission: 'NDA',
      medical_device: '510K',
      literature_review: 'NDA',
      ind: 'IND',
      nda: 'NDA',
      bla: 'BLA',
      pma: 'PMA',
      maa: 'MAA',
      eua: 'EUA',
      de_novo: 'DE_NOVO',
    };
    if (['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'].includes(raw)) return raw;
    return map[raw?.toLowerCase()] || 'IND';
  }

  // Transform projects for UI
  const projects = useMemo(() => {
    return rawProjects.map(p => ({
      id: p.id,
      name: p.name,
      type: mapSubmissionType(p.submissionType),
      color: getProjectColor(p.submissionType),
      description: p.description,
      sponsor: p.sponsor,
      product: p.product,
      region: p.region,
      targetAgency: (p as any).targetAgency,
      pinned: (p.metadata as any)?.pinned ?? false,
      lastUpdated: p.updatedAt,
      conversationCount: p.conversations?.length ?? 0,
      starred: (p.metadata as any)?.starred ?? false,
      archived: p.status === 'archived',
      status: p.status || 'active',
    }));
  }, [rawProjects]);

  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  // Sidebar — default to the thin icon rail (Claude-style 2026-04-14 WO-8).
  // Users can still expand via the chevron in the rail.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [userProfile, setUserProfile] = useUserProfileFromStorage();

  // Modals
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const [pendingLayoutAfterSelect, setPendingLayoutAfterSelect] = useState<LayoutMode | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return !localStorage.getItem('concept2cure_first_run_complete');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!showFirstRun) return;
    if (projects.length === 0) return;
    setShowFirstRun(false);
    try {
      localStorage.setItem('concept2cure_first_run_complete', 'true');
    } catch {
      /* localStorage unavailable */
    }
  }, [projects.length, showFirstRun]);

  useEffect(() => {
    try {
      setExternalTestingMode(localStorage.getItem('concept2cure_external_testing_mode') === 'true');
    } catch {
      setExternalTestingMode(false);
    }
  }, []);

  // Tool panels
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
  const [toolPanelFullscreen, setToolPanelFullscreen] = useState(false);

  // Layout mode — initialize from URL when deep-linked into a project
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    urlProjectId ? 'regulatory-workspace' : initialProjectId ? 'project-home' : 'projects'
  );

  // Phase 2 MDX deep-link hash — passed to BundleSurfaceFrame iframe src
  // so clicking "Vault DMS" / "Tasking" / etc. from the bundle home rail
  // lands on the right tab inside the MDX bundle prototype.
  const [mdxDeepLink, setMdxDeepLink] = useState<string>('');

  // Active section code — tracks which dossier section is open in SectionWorkspace
  const [activeSectionCode, setActiveSectionCode] = useState<string | null>(null);

  // Submission view sub-tab: readiness checklist vs package builder
  const [submissionTab, setSubmissionTab] = useState<'readiness' | 'builder'>('readiness');

  // Guard: prevents URL-sync from reverting a navigation that's in-flight
  const navInProgressRef = useRef(false);

  // Page-level context for AnA awareness (active tab, filters, etc.)
  const [moduleContext, setModuleContext] = useState<Record<string, unknown>>({});

  // ── Authoring context state (feeds AnA with section/artifact/workflow awareness) ──
  const [activeArtifactId, setActiveArtifactId] = useState<string | undefined>();
  const [activeArtifactVersion, setActiveArtifactVersion] = useState<string | undefined>();
  const [activeArtifactStatus, setActiveArtifactStatus] = useState<string | undefined>();
  const [activeSectionTitle, setActiveSectionTitle] = useState<string | undefined>();
  const [, setActiveModuleCode] = useState<string | undefined>();
  const [sectionReadiness, setSectionReadiness] = useState<ReadinessSnapshot | undefined>();
  const [sectionContradictions, setSectionContradictions] = useState<
    ContradictionEntry[] | undefined
  >();

  // Account-level custom instructions for Knowledge Base
  const [customInstructions, setCustomInstructions] = useState('');

  // Right panel tab in workspace mode — reserved for future panel switching
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_workspacePanelTab, _setWorkspacePanelTab] = useState<
    'files' | 'outputs' | 'instructions'
  >('files');
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);

  const [moduleAssistantOpen, setModuleAssistantOpen] = useState(false);
  const [externalTestingMode, setExternalTestingMode] = useState(false);

  // Tools sub-view: 'landing' shows the curated workbench, 'builder' shows FullDocumentBuilder, 'haq' shows HAQ Manager
  const [toolsSubView, setToolsSubView] = useState<'landing' | 'builder' | 'haq'>('landing');
  // Reset tools sub-view when entering documents mode (always land on workbench)
  useEffect(() => {
    if (layoutMode === 'documents') setToolsSubView('landing');
  }, [layoutMode]);

  // Pending editor content — when a module wants to open the editor with pre-populated content
  const [pendingEditorContent, setPendingEditorContent] = useState<{
    title: string;
    content: string;
    ctdSection?: string;
    templateId?: string;
  } | null>(null);

  // Direct artifact open — when a module has already saved an artifact and wants to open it
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();

  // AnA intelligence view: 'intelligence' = evidence-first home, 'editor' = document editing
  const [riViewMode, setRiViewMode] = useState<'intelligence' | 'editor'>(
    urlProjectId ? 'editor' : 'intelligence'
  );

  // Active selection — URL projectId takes precedence, then session restore, then first project
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(
    urlProjectId ?? initialProjectId ?? projects[0]?.id
  );
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

  const approvedRouteDecision = useMemo(
    () =>
      evaluateApprovedRoute(location, {
        externalTestingMode,
        projectId: urlProjectId ?? activeProjectId,
      }),
    [location, externalTestingMode, urlProjectId, activeProjectId]
  );

  // Sherpa project detail view state
  const [sherpaDetailProjectId] = useState<string | null>(null);
  const [
    ,/* newTaskOpen */
    /* setNewTaskOpen */
  ] = useState(false);
  const [
    ,/* taskFilter */
    /* setTaskFilter */
  ] = useState<string>('all');

  // Task management for the selected project in sherpa mode
  useProjectTasks(sherpaDetailProjectId || activeProjectId || '');

  // Run log — lightweight action execution transparency
  // NOTE: declared after activeProjectId to avoid TDZ in deps arrays
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_runLog, setRunLog] = useState<
    Array<{
      id: string;
      intent: string;
      label: string;
      status: 'running' | 'done' | 'failed';
      ts: number;
    }>
  >([]);


  // [C-03/C-04] Validate initialProjectId exists in the projects array.
  // If the stored/URL project was deleted or is inaccessible, fall back gracefully.
  useEffect(() => {
    if (initialProjectId && projects.length > 0 && !projects.find(p => p.id === initialProjectId)) {
      setActiveProjectId(projects[0]?.id);
      setLayoutMode('projects');
    }
  }, [initialProjectId, projects]);

  // [BATCH 3] Redirect demoted layout modes to surviving destinations.
  // This catches deep links, stale bookmarks, and any navigation to removed worlds.
  useEffect(() => {
    const normalized = normalizeLayoutMode(layoutMode);
    if (normalized !== layoutMode) {
      setLayoutMode(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);
  useEffect(() => {
    if (!activeProjectId) return;
    try {
      const stored = sessionStorage.getItem(`runlog:${activeProjectId}`);
      setRunLog(stored ? JSON.parse(stored) : []);
    } catch {
      setRunLog([]);
    }
  }, [activeProjectId]);

  const handleActionRun = useCallback(
    (entry: {
      id: string;
      intent: string;
      label: string;
      status: 'running' | 'done' | 'failed';
      ts: number;
    }) => {
      setRunLog(prev => {
        const idx = prev.findIndex(e => e.id === entry.id);
        const next =
          idx === -1 ? [entry, ...prev].slice(0, 20) : prev.map((e, i) => (i === idx ? entry : e));
        // Persist immediately in the updater so we always save the final value
        if (activeProjectId) {
          try {
            sessionStorage.setItem(`runlog:${activeProjectId}`, JSON.stringify(next));
          } catch {
            /* quota exceeded */
          }
        }
        return next;
      });
    },
    [activeProjectId]
  );

  // Derive active project early so downstream hooks / memos can reference it
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeRawProject = rawProjects.find(p => p.id === activeProjectId);

  useEffect(() => {
    if (!activeRawProject) return;
    const preferredContext =
      activeRawProject.ownership?.preferences?.currentWorkbenchContext ||
      activeRawProject.ownership?.currentWorkbenchContext;
    if (!preferredContext) return;
    if (layoutMode === preferredContext) return;
    if (urlProjectId) return; // Respect direct URL route during initial load
    setLayoutMode(preferredContext as LayoutMode);
  }, [activeRawProject, layoutMode, urlProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (!activeRawProject) return;
    const supportedContexts = new Set([
      'project-home',
      'regulatory-workspace',
      'documents',
      'review',
      'review-readiness',
      'submissions',
      'section-workspace',
      'report-engine',
    ]);
    if (!supportedContexts.has(layoutMode)) return;
    const currentStored =
      activeRawProject.ownership?.preferences?.currentWorkbenchContext ||
      activeRawProject.ownership?.currentWorkbenchContext;
    if (currentStored === layoutMode) return;
    const t = setTimeout(() => {
      void updateOwnershipPreferencesMutation({
        projectId: activeProjectId,
        preferences: { currentWorkbenchContext: layoutMode as any },
      }).catch(error => {
        console.warn('Failed to persist workbench context preference', error);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [activeProjectId, activeRawProject, layoutMode, updateOwnershipPreferencesMutation]);

  useEffect(() => {
    if (!activeRawProject?.ownership) return;
    setModuleContext(prev => ({
      ...prev,
      projectInstructions:
        activeRawProject.ownership?.preferences?.projectInstructions ||
        activeRawProject.ownership?.projectInstructions ||
        '',
      reviewState:
        activeRawProject.ownership?.derived?.reviewState || activeRawProject.ownership?.reviewState,
      readinessState:
        activeRawProject.ownership?.derived?.readinessState ||
        activeRawProject.ownership?.readinessState,
    }));
    setCustomInstructions(
      activeRawProject.ownership?.preferences?.projectInstructions ||
        activeRawProject.ownership?.projectInstructions ||
        ''
    );
  }, [activeRawProject]);

  // Readiness score for the active project (displayed in ProjectHeaderBar)
  const { data: readinessData } = useReadinessAssessment(
    activeProjectId ? Number(activeProjectId) : null
  );
  const projectReadinessScore = readinessData?.metrics?.readinessScore;

  // Intelligence profile + next best actions for enriched Ana chat
  const { data: intelligenceProfile } = useProjectIntelligence(
    activeProjectId ? Number(activeProjectId) : null
  );
  const { data: nextActionsData } = useNextBestActions(
    activeProjectId ? Number(activeProjectId) : null,
    5
  );
  const { data: recommendationsData } = useRecommendations(
    activeProjectId ? Number(activeProjectId) : null
  );

  // Project intelligence stats for Ana greeting enrichment
  const projectIntelligenceStats = useMemo(() => {
    if (!readinessData && !intelligenceProfile) return undefined;
    return {
      documentCount: readinessData?.metrics?.artifactCount ?? 0,
      signalCount: readinessData?.metrics?.signalCount ?? 0,
      readinessScore: projectReadinessScore ?? null,
      memoryAtomCount: readinessData?.metrics?.memoryAtomCount ?? 0,
      // Enriched from useRecommendations (active recommendations sorted by severity)
      recommendations: recommendationsData?.recommendations
        ?.filter(r => r.status === 'active')
        ?.slice(0, 5)
        ?.map(r => ({
          id: r.recommendationId,
          title: r.suggestedAction || r.reason,
          severity: r.severity,
          category: r.type,
        })),
      nextActions: nextActionsData?.actions?.slice(0, 3).map(a => ({
        id: a.actionId,
        title: a.title,
        priority: a.urgency,
        reason: a.description,
      })),
      riskFactors: intelligenceProfile?.riskFactors?.slice(0, 5).map(rf => ({
        description: rf.risk,
        likelihood: rf.likelihood,
        impact: rf.impact,
      })),
      openQuestions: intelligenceProfile?.openQuestions?.slice(0, 5).map(oq => ({
        question: oq.question,
        priority: oq.priority ?? 'medium',
        context: oq.context ?? '',
      })),
    };
  }, [
    readinessData,
    projectReadinessScore,
    intelligenceProfile,
    nextActionsData,
    recommendationsData,
  ]);

  // ── Canonical AuthoringContextPack — derived from all available state ──────
  const authoringContext = useMemo<AuthoringContextPack | null>(() => {
    return resolveAuthoringContext({
      projectId: activeProjectId,
      layoutMode: layoutMode,
      submissionType: activeProject?.type,
      regulatorBody: activeProject?.region || activeProject?.regulatoryRegion,
      sectionCode: activeSectionCode,
      sectionTitle: activeSectionTitle,
      artifactId: activeArtifactId,
      artifactVersion: activeArtifactVersion,
      artifactStatus: activeArtifactStatus,
      readiness: sectionReadiness,
      contradictions: sectionContradictions,
    });
  }, [
    activeProjectId,
    layoutMode,
    activeProject?.type,
    activeProject?.region,
    activeProject?.regulatoryRegion,
    activeSectionCode,
    activeSectionTitle,
    activeArtifactId,
    activeArtifactVersion,
    activeArtifactStatus,
    sectionReadiness,
    sectionContradictions,
  ]);

  // Handler for child surfaces to update authoring context fields
  const handleAuthoringContextChange = useCallback((partial: Partial<AuthoringContextPack>) => {
    if (partial.sectionCode !== undefined) setActiveSectionCode(partial.sectionCode || null);
    if (partial.sectionTitle !== undefined) setActiveSectionTitle(partial.sectionTitle);
    if (partial.moduleCode !== undefined) setActiveModuleCode(partial.moduleCode);
    if (partial.artifactId !== undefined) setActiveArtifactId(partial.artifactId);
    if (partial.artifactVersionId !== undefined)
      setActiveArtifactVersion(partial.artifactVersionId);
    if (partial.artifactStatus !== undefined) setActiveArtifactStatus(partial.artifactStatus);
    if (partial.readiness !== undefined) setSectionReadiness(partial.readiness);
    if (partial.contradictions !== undefined) setSectionContradictions(partial.contradictions);
  }, []);

  // ── P1: Draft insertion → pendingEditorContent → EditorPanel auto-creates artifact ──
  const handleDraftInsert = useCallback(
    (content: string, title: string, ctdSection?: string) => {
      setPendingEditorContent({ title, content, ctdSection });
      // Switch to documents mode where EditorPanel will consume the pending content
      if (
        layoutMode !== 'documents' &&
        layoutMode !== 'workspace' &&
        layoutMode !== 'regulatory-workspace'
      ) {
        setLayoutMode('documents');
      }
    },
    [layoutMode]
  );

  // Project-scoped artifacts for section navigation and Outputs tab
  const { data: projectArtifacts = [] } = useQuery({
    queryKey: ['project-artifacts', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const token =
        sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token');
      const res = await fetch(`/api/concept2cure/projects/${activeProjectId}/artifacts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.data ?? data?.artifacts ?? [];
    },
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  // ── Moved up: requireActiveProject must be defined before hooks that reference it ──
  const requireActiveProject = useCallback(
    (
      targetLayout: LayoutMode,
      options?: {
        reason?: string;
        projectId?: string;
      }
    ): boolean => {
      const resolvedProjectId = options?.projectId ?? activeProjectId;
      if (resolvedProjectId) {
        setLayoutMode(targetLayout);
        return true;
      }
      // Stay on the current screen — open the project picker overlay and
      // remember the destination so we can route once a project is chosen.
      setPendingLayoutAfterSelect(targetLayout);
      setLayoutMode('projects');
      navigate('/concept2cure');
      toast({
        title: 'Pick a project',
        description: options?.reason ?? 'Choose a project to continue.',
      });
      return false;
    },
    [activeProjectId, navigate, toast]
  );

  useEffect(() => {
    if (layoutMode !== 'biostatistics') return;
    requireActiveProject('regulatory-workspace');
    setActiveToolPanel('ana-biostats');
  }, [layoutMode, requireActiveProject]);

  // ── P2: Navigate to section — real navigation ──
  const handleNavigateToSection = useCallback(
    (sectionCode: string) => {
      if (!activeProjectId && !requireActiveProject('regulatory-workspace')) return;
      setActiveSectionCode(sectionCode);
      const moduleNum = sectionCode.charAt(0);
      const match = projectArtifacts.find(
        (a: any) =>
          a.ctdSection === sectionCode ||
          a.ctdSection === `csr-${sectionCode}` ||
          a.ctdSection === `m${moduleNum}-${sectionCode}`
      );
      if (match) {
        setOpenArtifactId(match.id);
      } else {
        setPendingEditorContent({
          title: `Section ${sectionCode}`,
          content: '',
          ctdSection: sectionCode,
        });
      }
      setRiViewMode('editor');
      setLayoutMode('regulatory-workspace');
    },
    [activeProjectId, projectArtifacts, requireActiveProject]
  );

  // ── P2: Open artifact — real navigation ──
  const handleOpenArtifact = useCallback(
    (artifactId: string) => {
      if (!activeProjectId && !requireActiveProject('documents')) return;
      // On project-home (AnA-first): show artifact in canvas panel without leaving conversation
      // On other modes: navigate to documents/editor
      setActiveArtifactId(artifactId);
      if (layoutMode !== 'project-home') {
        setOpenArtifactId(artifactId);
        setLayoutMode('documents');
      }
    },
    [activeProjectId, layoutMode, requireActiveProject]
  );

  // ── P5: Governed promotion — calls real status API ──
  const handleRequestPromotion = useCallback(
    async (artifactId: string): Promise<{ promoted: boolean; message: string }> => {
      if (!activeProjectId) {
        return { promoted: false, message: 'No active project.' };
      }
      const token =
        sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `/api/concept2cure/projects/${activeProjectId}/artifacts/${artifactId}/status`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: 'review' }),
        }
      );
      if (res.ok) {
        return {
          promoted: true,
          message: 'Artifact promoted to review. Governance workflow initiated.',
        };
      }
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { promoted: false, message: err.error || err.message || 'Promotion failed.' };
    },
    [activeProjectId]
  );

  const workspaceSuggestedActions = useWorkspaceSuggestedActions(
    activeProject?.type,
    workspaceSummary
  );

  // Pending draft request from IND Workspace → passed to AnA when switching to workspace mode
  const [pendingDraftSection, setPendingDraftSection] = useState<{
    code: string;
    title: string;
  } | null>(null);

  // External message to send into AnA chat (triggered by suggested prompts, dashboard actions)
  const [externalChatMessage, setExternalChatMessage] = useState<{
    text: string;
    ts: number;
  } | null>(null);
  const [guidedStageRequest, setGuidedStageRequest] = useState<{
    stage: 'project' | 'ind_ectd' | 'authoring' | 'verify' | 'submission';
    controlMode?: 'ana' | 'client';
    ts: number;
  } | null>(null);

  // ── Authoring intelligence — real readiness/contradiction data for active section ──
  const authoringIntelligence = useAuthoringIntelligence(
    activeProjectId,
    layoutMode === 'section-workspace' ? activeSectionCode : null
  );
  // Feed real intelligence data into authoring context when available
  useEffect(() => {
    if (authoringIntelligence.readiness) setSectionReadiness(authoringIntelligence.readiness);
    if (authoringIntelligence.contradictions)
      setSectionContradictions(authoringIntelligence.contradictions);
  }, [authoringIntelligence.readiness, authoringIntelligence.contradictions]);

  const { mutateAsync: deleteThread } = useDeleteCortexThread();

  // Threads for current project
  const { data: threads = [] } = useCortexThreads(activeProjectId);

  // Transform threads to conversations for sidebar
  const conversations = useMemo(() => {
    return threads.map(t => ({
      id: t.id,
      title: t.title || 'New conversation',
      projectId: t.projectId || activeProjectId || '',
      timestamp: t.updatedAt,
      starred: false,
      pinned: false,
    }));
  }, [threads, activeProjectId]);

  // Set active project when projects load (prefer summary's last-touched project)
  // NOTE: activeProjectId intentionally excluded from deps to prevent re-trigger loops
  // Restore last active project from workspace summary (don't force-select first project)
  // This allows an unscoped "general" chat mode when no project is selected (Claude.ai parity)
  useEffect(() => {
    if (!activeProjectId) {
      const summaryProject = workspaceSummary?.active?.projectId;
      if (summaryProject) {
        setActiveProjectId(summaryProject);
      }
      // Intentionally NOT auto-selecting projects[0] — allow unscoped state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, workspaceSummary]);

  // Keep unscoped mode safe: project-scoped layouts require an active project.
  useEffect(() => {
    if (!activeProjectId && PROJECT_SCOPED_LAYOUTS.has(layoutMode)) {
      setLayoutMode('projects');
      setActiveThreadId(undefined);
      setActiveConversationId(undefined);
    }
  }, [activeProjectId, layoutMode]);

  // Open a tool panel from the ?panel= URL query param on first load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const panelParam = params.get('panel') as ToolPanel | null;
      if (panelParam && panelParam in TOOL_PANELS) {
        setActiveToolPanel(panelParam);
        // Strip the query param so a refresh doesn't re-open it
        const url = new URL(window.location.href);
        url.searchParams.delete('panel');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: if URL has /project/:projectId, set active project + go to workspace
  useEffect(() => {
    if (urlProjectId && urlProjectId !== activeProjectId) {
      setActiveProjectId(urlProjectId);
      setRiViewMode('editor');
      setLayoutMode('regulatory-workspace');
    }
    // Also support legacy ?projectId= query param for backwards compat
    try {
      const params = new URLSearchParams(window.location.search);
      const qp = params.get('projectId');
      if (qp && !urlProjectId) {
        setActiveProjectId(qp);
        setRiViewMode('editor');
        setLayoutMode('regulatory-workspace');
        // Upgrade to path-based URL
        navigate(`/concept2cure/project/${qp}`);
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId]);

  useEffect(() => {
    if (approvedRouteDecision.disposition === 'allowed') return;
    if (location === approvedRouteDecision.fallbackPath) return;
    navigate(approvedRouteDecision.fallbackPath);
  }, [approvedRouteDecision, location, navigate]);

  // Sync URL path when active project or layout changes
  useEffect(() => {
    if ((layoutMode === 'workspace' || layoutMode === 'regulatory-workspace') && activeProjectId) {
      // Only update URL if not already on the right project path
      const expected = `/concept2cure/project/${activeProjectId}`;
      if (!window.location.pathname.startsWith(expected)) {
        window.history.replaceState({}, '', expected);
      }
      navInProgressRef.current = false;
    } else if (layoutMode === 'projects' && !embeddedModule) {
      // Back to project hub — clear project from URL
      // Skip if a navigation is in-flight (state updates still batching)
      if (navInProgressRef.current) return;
      if (window.location.pathname.includes('/project/')) {
        window.history.replaceState({}, '', '/concept2cure');
      }
    }
  }, [layoutMode, activeProjectId, embeddedModule]);

  // Clear stale pending state when switching layout modes
  useEffect(() => {
    if (layoutMode !== 'workspace' && layoutMode !== 'regulatory-workspace') {
      setPendingDraftSection(null);
    }
  }, [layoutMode]);

  const handleNewChat = useCallback(() => {
    // Clear active conversation/thread
    setActiveConversationId(undefined);
    setActiveThreadId(undefined);
    setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
    setActiveToolPanel(null);
  }, [activeProjectId]);

  // requireActiveProject is now defined earlier (before hooks that reference it)

  // ─────────────────────────────────────────────────────────────────────────────
  // NAVIGATION HELPER — intercepts special paths before falling through to layoutMode
  // ─────────────────────────────────────────────────────────────────────────────
  const SAFE_ANA_NAV_TARGETS = new Set<string>([
    'projects',
    'project-home',
    'apps',
    'documents',
    'review',
    'submissions',
    'dossier-map',
    'section-workspace',
    'csr-workflow',
    'ind-checklist',
    'template-library',
    'regulatory-workspace',
    'editor',
    'deep-research',
    'precedent-intelligence',
    'biostatistics',
    'review-readiness',
    'report-engine',
    'safety-narrative',
    'device-diagnostics-workbench',
    'vault',
    'vault-workspace',
  ]);

  const handleAnaPanelNavigate = useCallback(
    (path: string) => {
      const normalizedPath = String(path || '').trim();
      if (!normalizedPath) return;

      // ── Bundle home rail ids (data.tsx NAV_ITEMS) ───────────────────────
      // Per CLAUDE.md Replace-or-Delete Law: bundle rail items must never
      // route to legacy panel layoutModes that would force the legacy
      // ZenSidebar to render. Where the design-system bundle ships a
      // canonical surface, we route to that surface; where it does not,
      // we route to Phase 2 Ana with an intent message so the user gets a
      // bundle-faithful response instead of a legacy panel.
      //
      // Phase 2 MDX (design-system/ui_kits/mdx/) covers Medical Device +
      // Diagnostics including 510(k), PMA, CER, Precedent Intelligence —
      // mounted as the new 'mdx' layoutMode rendering the bundle prototype.
      const BUNDLE_MDX_HASH: Record<string, string> = {
        mdx: '',                       // bundle home — Overview tab
        biopharma: '',                 // routes through MDX shell scope tabs
        vault: '#vault',
        tasking: '#tasks',
        submission: '#submissions',
        protocol: '#templates',
        cmc: '#cer',                   // CER generator covers CMC docs in MDX
        biostat: '',                   // no MDX surface yet → fall through to Ana
        quality: '#validation',
        reporting: '#analytics',
        memory: '#memory',
        artifacts: '#vault',
        audit: '#admin',
        admin: '#admin',
      };
      const BUNDLE_INTENTS: Record<string, string> = {
        biostat: 'Show me Biostatistics — active SAPs, sample size calculations, interim analyses, and tables/listings/figures.',
      };
      if (normalizedPath === 'projects') {
        setLayoutMode('projects');
        return;
      }
      if (normalizedPath === 'ectd-coauthor') {
        setLayoutMode('ectd-coauthor');
        return;
      }
      if (normalizedPath in BUNDLE_MDX_HASH) {
        // Persist the deep-link hash so the early return for 'mdx' can
        // pick it up and pass it to the iframe.
        setMdxDeepLink(BUNDLE_MDX_HASH[normalizedPath]);
        setLayoutMode('mdx');
        return;
      }
      if (normalizedPath in BUNDLE_INTENTS) {
        setExternalChatMessage({ text: BUNDLE_INTENTS[normalizedPath], ts: Date.now() });
        setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'deep-research');
        return;
      }

      if (normalizedPath === 'ana-intelligence') {
        setSettingsSection('ana-intelligence');
        setSettingsOpen(true);
        return;
      }
      if (normalizedPath === 'project-config') {
        setEditProjectOpen(true);
        return;
      }
      if (
        normalizedPath === 'open_capabilities' ||
        normalizedPath === '/concept2cure?panel=capabilities'
      ) {
        setLayoutMode(activeProjectId ? 'project-home' : 'projects');
        if (activeProjectId) {
          setExternalChatMessage({
            text: 'Show me all available capabilities for this project, grouped by workflow stage and what AnA can execute for me.',
            ts: Date.now(),
          });
        }
        return;
      }
      if (
        normalizedPath === 'guided_project' ||
        normalizedPath === 'guided_ind_ectd' ||
        normalizedPath === 'guided_authoring' ||
        normalizedPath === 'guided_verify' ||
        normalizedPath === 'guided_submission'
      ) {
        if (!activeProjectId) {
          setLayoutMode('projects');
          return;
        }
        const stageMap: Record<
          string,
          'project' | 'ind_ectd' | 'authoring' | 'verify' | 'submission'
        > = {
          guided_project: 'project',
          guided_ind_ectd: 'ind_ectd',
          guided_authoring: 'authoring',
          guided_verify: 'verify',
          guided_submission: 'submission',
        };
        const stage = stageMap[normalizedPath];
        setLayoutMode('regulatory-workspace');
        setGuidedStageRequest({
          stage,
          controlMode: 'client',
          ts: Date.now(),
        });
        return;
      }
      // Project-scoped layouts require an active project
      const nextLayout = normalizedPath as LayoutMode;
      if (isProjectScopedLayout(nextLayout)) {
        requireActiveProject(nextLayout);
        return;
      }
      const mapped = SIDEBAR_NAV_TO_LAYOUT[normalizedPath];
      if (mapped) {
        setLayoutMode(mapped);
        return;
      }
      if (SAFE_ANA_NAV_TARGETS.has(normalizedPath)) {
        setLayoutMode(normalizedPath as LayoutMode);
        return;
      }
      console.warn(
        `[Ana] Unknown navigation target, falling back safely: ${normalizedPath}`
      );
      setLayoutMode(activeProjectId ? 'project-home' : 'projects');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProjectId, requireActiveProject]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS — use refs to avoid re-attaching listeners on every state change
  // ─────────────────────────────────────────────────────────────────────────────

  useZenKeyboardShortcuts(
    { activeToolPanel, commandPaletteOpen, settingsOpen, layoutMode, activeProjectId },
    {
      openCommandPalette: () => setCommandPaletteOpen(true),
      openSettings: () => setSettingsOpen(true),
      openEditProject: () => setEditProjectOpen(true),
      closeToolPanel: () => {
        setActiveToolPanel(null);
        setToolPanelFullscreen(false);
      },
      openVaultPanel: () => setActiveToolPanel('vault'),
      handleNewChat,
      setLayoutMode: mode => {
        setLayoutMode(mode);
        setActiveToolPanel(null);
      },
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteThread(id);
        if (activeConversationId === id) {
          setActiveConversationId(undefined);
          setActiveThreadId(undefined);
        }
        toast({
          title: 'Conversation deleted',
          description: 'The conversation has been removed.',
        });
      } catch (error) {
        toast({
          title: 'Failed to delete conversation',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [activeConversationId, deleteThread, toast]
  );

  // Conversation star/pin are intentionally disabled until persistence lands.
  // Keep handlers silent and hide affordance in sidebar instead of fake success UX.
  const handleToggleConversationStar = useCallback((_id: string) => {}, []);

  const handleToggleConversationPin = useCallback((_id: string) => {}, []);

  const handleRenameConversation = useCallback(
    async (id: string) => {
      const existing = conversations.find(c => c.id === id);
      if (!existing) return;
      // eslint-disable-next-line no-alert
      const nextTitle = window.prompt(
        'Rename conversation title',
        existing.title || 'New conversation'
      );
      if (!nextTitle) return;
      const trimmed = nextTitle.trim();
      if (!trimmed || trimmed === existing.title) return;
      try {
        await cortexService.updateThreadTitle(id, trimmed);
        toast({
          title: 'Conversation renamed',
          description: 'The title was updated.',
        });
      } catch (error) {
        toast({
          title: 'Failed to rename conversation',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [conversations, toast]
  );

  const handleMoveConversation = useCallback(
    async (conversationId: string, targetProjectId: string) => {
      try {
        await apiRequest('PATCH', `/api/chat/thread/${conversationId}`, {
          project_id: targetProjectId,
        });
      } catch (error) {
        console.error('Failed to move conversation:', error);
      }
    },
    []
  );

  const handleThreadChange = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setActiveConversationId(threadId);
  }, []);

  const handleCommandAction = useCallback(
    (actionId: string) => {
      const SUPPORTED_TOOL_PANELS: Exclude<ToolPanel, null>[] = [
        'ectd',
        'intelligence',
        'vault',
        'doc-editor',
        'ana-biostats',
      ];

      // Handle tool panel opens
      if (actionId.startsWith('tool-')) {
        const panel = actionId.replace('tool-', '') as ToolPanel;
        if (!SUPPORTED_TOOL_PANELS.includes(panel as Exclude<ToolPanel, null>)) {
          toast({
            title: 'Command unavailable',
            description: 'This tool is not enabled in the current workspace.',
            variant: 'destructive',
          });
          setCommandPaletteOpen(false);
          return;
        }
        setActiveToolPanel(panel);
        setLayoutMode(panel === 'ectd' ? 'ctd' : 'editor');
        setCommandPaletteOpen(false);
        return;
      }

      // Handle module navigation — every module accessible via command palette
      // [BATCH 3] Only surviving first-class + specialist destinations remain
      const MODULE_ROUTES: Record<string, LayoutMode> = {
        'go-copilot': 'regulatory-workspace',
        'go-home': 'projects',
        'go-review-readiness': 'review-readiness',
        'go-biostatistics': 'regulatory-workspace',
        'go-report-engine': 'report-engine',
      };
      const NAV_ACTION_ROUTES: Record<string, LayoutMode> = {
        'nav-intelligence-feed': 'intelligence-feed',
        'nav-gap-analysis': 'gap-analysis',
        'nav-change-impact': 'change-impact',
        'nav-ana-memory': 'ana-memory',
        'nav-mission-control': 'mission-control',
        'nav-artifact-graph': 'artifact-graph',
        'nav-review-center': 'review-center',
        'nav-dossier-view': 'dossier-view',
        'nav-risk-cockpit': 'risk-cockpit',
        'nav-route-planner': 'route-planner',
        'nav-evidence-manager': 'evidence-manager',
        'nav-decision-log': 'decision-log',
        'nav-authority-tracker': 'authority-tracker',
        'nav-provenance-trail': 'provenance-trail',
        'nav-notifications': 'notifications',
        'nav-collaboration-hub': 'collaboration-hub',
        'nav-task-board': 'task-board',
        'nav-team-workspace': 'team-workspace',
        'nav-program-analytics': 'program-analytics',
        'nav-snowglobe': 'snowglobe',
        'nav-snowglobe-chambers': 'snowglobe-chambers',
      };

      if (MODULE_ROUTES[actionId]) {
        setLayoutMode(MODULE_ROUTES[actionId]);
        if (actionId === 'go-biostatistics') {
          setActiveToolPanel('ana-biostats');
        }
        setCommandPaletteOpen(false);
        return;
      }
      if (NAV_ACTION_ROUTES[actionId]) {
        const targetLayout = NAV_ACTION_ROUTES[actionId];
        if (isProjectScopedLayout(targetLayout)) {
          requireActiveProject(targetLayout);
        } else {
          setLayoutMode(targetLayout);
        }
        setCommandPaletteOpen(false);
        return;
      }

      // Handle other actions
      switch (actionId) {
        case 'search-conversations':
          setCommandPaletteOpen(false);
          return;
        case 'go-author':
          requireActiveProject('documents');
          setCommandPaletteOpen(false);
          return;
        case 'go-agents':
          requireActiveProject('regulatory-workspace');
          setRiViewMode('intelligence');
          setCommandPaletteOpen(false);
          return;
        case 'new-chat':
          handleNewChat();
          setCommandPaletteOpen(false);
          return;
        case 'new-510k':
        case 'new-ind':
        case 'new-nda':
        case 'new-bla':
        case 'new-pma':
          setNewProjectOpen(true);
          setCommandPaletteOpen(false);
          return;
        case 'settings-account':
        case 'settings-org':
        case 'settings':
          setSettingsOpen(true);
          setCommandPaletteOpen(false);
          return;
        case 'settings-intelligence':
        case 'ana-intelligence':
          setSettingsSection('ana-intelligence');
          setSettingsOpen(true);
          setCommandPaletteOpen(false);
          return;
        case 'projects':
          setLayoutMode('projects');
          navigate('/concept2cure');
          setCommandPaletteOpen(false);
          return;
        default:
          // Unknown actions are ignored intentionally.
          return;
      }
    },
    [handleNewChat, requireActiveProject, toast]
  );

  const handleCreateProject = useCallback(
    async (data: {
      name: string;
      type: string;
      description?: string;
      sponsor?: string;
      product?: string;
      region?: string;
      goal?: string;
      color?: string;
      registryId?: string;
      applicationFamily?: string;
      applicationType?: string;
      agency?: string;
      dossierStandard?: string;
    }) => {
      try {
        const created = await createProjectMutation({
          name: data.name,
          submissionType: data.type as any,
          description: data.description,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
          goal: data.goal,
          color: data.color,
          registryId: data.registryId,
          applicationFamily: data.applicationFamily,
          applicationType: data.applicationType,
          agency: data.agency,
          dossierStandard: data.dossierStandard,
          conversations: [],
        });
        setNewProjectOpen(false);
        toast({
          title: 'Project created',
          description: `${data.name} is ready.`,
        });

        const newId = (created as any)?.id ?? (created as any)?.project?.id;
        if (newId) {
          setActiveProjectId(String(newId));
          setLayoutMode('project-home');
          navigate(`/concept2cure/project/${newId}`);
        }
      } catch (error) {
        console.error('Failed to create project:', error);
        toast({
          title: 'Failed to create project',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [createProjectMutation, toast]
  );

  const handleArchiveProject = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        await updateProjectMutation({
          ...project,
          status: 'archived' as const,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await deleteProjectMutation(id);
      if (activeProjectId === id && projects.length > 1) {
        setActiveProjectId(projects.find(p => p.id !== id)?.id);
      }
    },
    [activeProjectId, projects, deleteProjectMutation]
  );

  const handleToggleProjectStar = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        const currentStarred = (project.metadata as any)?.starred ?? false;
        await updateProjectMutation({
          ...project,
          metadata: { ...((project.metadata as any) || {}), starred: !currentStarred } as any,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleToggleProjectPin = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        const currentPinned = (project.metadata as any)?.pinned ?? false;
        await updateProjectMutation({
          ...project,
          metadata: { ...((project.metadata as any) || {}), pinned: !currentPinned } as any,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleEditProject = useCallback(
    async (data: Record<string, any>) => {
      const project = rawProjects.find(p => p.id === activeProjectId);
      if (project) {
        try {
          if (data.customInstructions !== undefined) {
            await updateOwnershipPreferencesMutation({
              projectId: project.id,
              preferences: {
                projectInstructions: data.customInstructions,
              },
            });
          }
          await updateProjectMutation({
            ...project,
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.sponsor !== undefined && { sponsor: data.sponsor }),
            ...(data.product !== undefined && { product: data.product }),
            ...(data.region !== undefined && { region: data.region }),
            ...(data.status !== undefined && { status: data.status }),
            metadata: {
              ...((project.metadata as any) || {}),
              ...(data.targetAgency !== undefined && { targetAgency: data.targetAgency }),
              ...(data.targetSubmissionDate !== undefined && {
                targetSubmissionDate: data.targetSubmissionDate,
              }),
              ...(data.submissionType !== undefined && { submissionType: data.submissionType }),
            } as any,
          });
          if (data.customInstructions !== undefined && activeProjectId) {
            await updateOwnershipPreferencesMutation({
              projectId: activeProjectId,
              preferences: {
                projectInstructions: data.customInstructions || '',
              },
            });
          }
          toast({
            title: 'Project updated',
            description: 'Configuration changes have been saved.',
          });
        } catch (error) {
          console.error('Failed to update project:', error);
          toast({
            title: 'Failed to update project',
            description: error instanceof Error ? error.message : 'Please try again.',
            variant: 'destructive',
          });
        }
      }
    },
    [activeProjectId, rawProjects, updateOwnershipPreferencesMutation, updateProjectMutation, toast]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _workflowRunId = activeProjectId ? `workflow-run-${activeProjectId}` : 'workflow-run-demo';
  const activeNavId = useMemo(() => {
    if (activeToolPanel === 'vault') return 'vault';
    if (activeToolPanel === 'ana-biostats') return 'biostatistics';
    if (layoutMode === 'regulatory-workspace') {
      return riViewMode === 'intelligence' ? 'ri-copilot' : 'submission-builder';
    }
    return PRIMARY_NAV_ID_BY_LAYOUT[layoutMode] ?? LEGACY_NAV_ID_BY_LAYOUT[layoutMode];
  }, [activeToolPanel, layoutMode, riViewMode]);

  const currentGlobalNodeLabel = useMemo(() => {
    if (activeToolPanel === 'vault') return 'Vault';
    if (activeToolPanel === 'ana-biostats') return 'Biostatistics';
    const labelByNavId: Record<string, string> = {
      'ri-copilot': 'Intelligence',
      'submission-builder': 'Submission Builder',
      cmc: 'CMC',
      'clinical-module5': 'Clinical / Module 5',
      verify: 'Verify',
      vault: 'Vault Workspace',
      review: 'Review',
      publish: 'Publish',
      haq: 'HAQ',
      biostatistics: 'Biostatistics',
    };
    return activeNavId ? labelByNavId[activeNavId] ?? 'Workspace' : 'Workspace';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavId, activeToolPanel]);

  const handleHeaderAction = useCallback(
    (
      action:
        | 'ri-copilot'
        | 'submission-builder'
        | 'cmc'
        | 'clinical-module5'
        | 'verify'
        | 'review'
        | 'publish'
        | 'haq'
        | 'vault'
    ) => {
      switch (action) {
        case 'ri-copilot':
          setRiViewMode('intelligence');
          setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
          break;
        case 'submission-builder':
          setRiViewMode('editor');
          setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
          break;
        case 'cmc':
          setRiViewMode('editor');
          requireActiveProject('section-workspace');
          break;
        case 'clinical-module5':
          setRiViewMode('editor');
          requireActiveProject('section-workspace');
          break;
        case 'verify':
          setActiveToolPanel(null);
          requireActiveProject('review-readiness');
          break;
        case 'vault':
          setActiveToolPanel(null);
          requireActiveProject('vault');
          break;
        case 'review':
          setActiveToolPanel(null);
          requireActiveProject('review');
          break;
        case 'haq':
          setActiveToolPanel(null);
          requireActiveProject('report-engine');
          break;
        case 'publish':
          setActiveToolPanel(null);
          requireActiveProject('submissions');
          break;
      }
    },
    [activeProjectId, requireActiveProject]
  );

  const userRole = userProfile?.role || 'Regulatory Lead';
  const canViewRouteDebugPanel = /founder|admin/i.test(userRole);

  // Phase 3 (eCTD co-authoring) Intelligence pane streams against the same
  // /api/ana-ri/stream endpoint Phase 2 uses. Hook lives here so it survives
  // tab switches; ClaudeEctdCoauthor only consumes it when rendered.
  const ectdChat = useAnaChat({
    projectId: activeProjectId,
    projectName: activeProject?.name,
    screenName: 'ectd-coauthor',
    userRole,
    submissionType: activeProject?.type,
  });

  // Phase 3 backend wiring step 2: live tree + artifact content from
  // /api/authoring/docs and /docs/:id/sections. Falls through to the bundle
  // fixtures when the project has no authoring documents yet.
  const ectdAuthoring = useEctdAuthoringData({
    projectId: activeProjectId ?? null,
    productCode: activeProjectId ?? null,
    enabled: layoutMode === 'ectd-coauthor',
  });

  // Phase 3 tree-footer stats: real readiness + blocker count + last
  // assessed-at relative time. Falls through to bundle defaults when the
  // assessment service has nothing yet for this project.
  const ectdReadiness = useEctdReadiness({
    projectId: activeProjectId ?? null,
    enabled: layoutMode === 'ectd-coauthor',
  });
  const rawIndustry = userProfile?.preferences?.industryMode;
  const industryMode = normalizeIndustryMode(
    typeof rawIndustry === 'string' ? rawIndustry : orgIndustryMode
  );
  const rawDisplayName = userProfile?.preferences?.displayName;
  const userName =
    (typeof rawDisplayName === 'string' && rawDisplayName) ||
    userIntelligence?.identity?.name ||
    'User';
  const userEmail = userIntelligence?.identity?.email ?? undefined;

  // Time-of-day greeting for the centered home (WO-8).
  // Computed once per mount; no re-render cost.
  const homeGreeting = useMemo(() => {
    const firstName = (userName || 'there').split(/\s+/)[0] || 'there';
    const hour = new Date().getHours();
    const part =
      hour < 5 ? 'evening' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    return `Good ${part}, ${firstName}`;
  }, [userName]);

  const openProjectsDirectory = () => {
    setLayoutMode('projects');
    navigate('/concept2cure');
  };

  const openProjectWorkspace = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveConversationId(undefined);
    setActiveThreadId(undefined);
    const targetLayout = pendingLayoutAfterSelect ?? 'project-home';
    setLayoutMode(targetLayout);
    setPendingLayoutAfterSelect(null);
    navigate(`/concept2cure/project/${projectId}`);
  };

  // userProfile sync moved to useUserProfileFromStorage hook

  // Phase 2 — Claude Design MDX workstream (Medical Device + Diagnostics
  // including 510(k), PMA, CER, Precedent Intelligence). Bundle source:
  // design-system/ui_kits/mdx/. Mounted as the canonical bundle prototype
  // via iframe so the user gets pixel-faithful rendering (terracotta,
  // brand fonts, bundle's own state machine) without a multi-thousand-
  // line React port. To swap to a real React port later, replace
  // <BundleSurfaceFrame surface="mdx" .../> with the ported components.
  if (layoutMode === 'mdx' && !embeddedModule) {
    return (
      <BundleSurfaceFrame
        surface="mdx"
        hash={mdxDeepLink}
        title="Medical Device and Diagnostics workstream"
      />
    );
  }

  // Project module deep-links route ONLY to bundle-designed surfaces.
  // Bundle coverage today (design-system/ui_kits/):
  //   - ectd → ClaudeEctdCoauthor (Phase 3 bundle)
  //   - 510k → MDX iframe (#k510)
  //   - pma  → MDX iframe (#pma)
  //   - cer  → MDX iframe (#cer)
  // Routes the bundle has NOT designed (ind, cmc) are NOT routed to a
  // best-guess fallback. Per CLAUDE.md "Mirror, do not interpret":
  // undesigned routes redirect to the project's chat-first shell
  // (bundle ana_ri) so the user never lands on invented UI.
  if (embeddedModule && urlProjectId) {
    if (embeddedModule === 'ectd') {
      return (
        <ClaudeEctdCoauthor
          applicationLabel={activeProject?.name}
          chat={ectdChat}
          tree={
            ectdAuthoring.tree && ectdAuthoring.tree.some(m => m.children.length > 0)
              ? ectdAuthoring.tree
              : undefined
          }
          artifacts={
            ectdAuthoring.artifacts && Object.keys(ectdAuthoring.artifacts).length > 0
              ? ectdAuthoring.artifacts
              : undefined
          }
          readinessPct={ectdReadiness.readinessPct ?? undefined}
          blockingCount={ectdReadiness.blockingCount ?? undefined}
          lastRimSync={ectdReadiness.lastRimSync ?? undefined}
        />
      );
    }
    const moduleHash: Record<string, string> = {
      '510k': '#k510',
      pma: '#pma',
      cer: '#cer',
    };
    const hash = moduleHash[embeddedModule];
    if (hash !== undefined) {
      return (
        <BundleSurfaceFrame
          surface="mdx"
          hash={hash}
          title={`${activeProject?.name ?? 'Project'} · ${embeddedModule.toUpperCase()}`}
        />
      );
    }
    // ind / cmc: bundle has not designed these surfaces. Redirect to the
    // project's chat-first shell so the user never lands on invented UI.
    if (location !== `/concept2cure/project/${urlProjectId}`) {
      navigate(`/concept2cure/project/${urlProjectId}`);
    }
  }

  // Phase 1 — Claude Design home surface. Renders standalone (no legacy
  // ZenSidebar) when the user is on the home destination and not viewing an
  // embedded project module. Bundle source: design-system/ui_kits/home/.
  if (layoutMode === 'projects' && !embeddedModule) {
    const initials = (userName || 'U')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || 'U';

    // Route an arbitrary chat-seed string into the current AnA surface. Picks
    // regulatory-workspace when a project is active, deep-research otherwise.
    const seedChat = (text: string) => {
      const t = text.trim();
      if (!t) return;
      setExternalChatMessage({ text: t, ts: Date.now() });
      setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'deep-research');
    };

    // Map an At-a-glance tile slug to the bundle MDX surface that owns it.
    const dashboardTileTarget: Record<string, string> = {
      'submission-readiness': '#submissions',
      'tasks-due': '#tasks',
      'alerts': '#admin',
      'view-all-dashboards': '#analytics',
    };

    return (
      <Concept2CureHome
        user={{ name: userName, initials, role: userRole }}
        onNavigate={navId => {
          handleAnaPanelNavigate(navId);
          return true;
        }}
        onLaunchChat={seedChat}
        onSelectProject={projectId => openProjectWorkspace(projectId)}
        onWorkspaceSwitch={() => setSettingsOpen(true)}
        onOpenNotifications={() => {
          setMdxDeepLink('#admin');
          setLayoutMode('mdx');
        }}
        onOpenHelp={() => {
          if (typeof window !== 'undefined') {
            window.open('/help/quality', '_blank', 'noopener,noreferrer');
          }
        }}
        onOpenAccount={() => setSettingsOpen(true)}
        onComposerAttach={() => {
          setMdxDeepLink('#vault');
          setLayoutMode('mdx');
        }}
        onComposerTools={() => {
          // Tools surface = command palette (slash-style capability list).
          if (typeof document !== 'undefined') {
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'k',
                code: 'KeyK',
                metaKey: true,
                ctrlKey: true,
                bubbles: true,
              }),
            );
          }
        }}
        onComposerModelPicker={() => {
          setSettingsSection('ana-intelligence');
          setSettingsOpen(true);
        }}
        onBriefingItemClick={item => {
          if (item.projectId) {
            openProjectWorkspace(item.projectId);
            setExternalChatMessage({ text: item.t, ts: Date.now() });
          } else {
            seedChat(item.t);
          }
        }}
        onStartFirstBriefing={item => {
          if (!item) return;
          if (item.projectId) {
            openProjectWorkspace(item.projectId);
            setExternalChatMessage({ text: item.t, ts: Date.now() });
          } else {
            seedChat(item.t);
          }
        }}
        onDashboardTileClick={key => {
          const hash = dashboardTileTarget[key];
          if (hash !== undefined) {
            setMdxDeepLink(hash);
            setLayoutMode('mdx');
          }
          // 'active-projects' is the current surface — no-op.
        }}
        onSelectThread={threadId => {
          setActiveThreadId(threadId);
          setActiveConversationId(threadId);
          setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'deep-research');
        }}
        onViewAllRecents={() => {
          setMdxDeepLink('');
          setLayoutMode('mdx');
        }}
      />
    );
  }

  // Phase 3 — Claude Design eCTD co-authoring workbench. Renders standalone
  // (no legacy ZenSidebar). Bundle source: docs/design/concept2cure-design-system/project/ui_kits/ectd_coauthor/.
  if (layoutMode === 'ectd-coauthor' && !embeddedModule) {
    return (
      <ClaudeEctdCoauthor
        applicationLabel={activeProject?.name}
        chat={ectdChat}
        tree={
          ectdAuthoring.tree && ectdAuthoring.tree.some(m => m.children.length > 0)
            ? ectdAuthoring.tree
            : undefined
        }
        artifacts={
          ectdAuthoring.artifacts && Object.keys(ectdAuthoring.artifacts).length > 0
            ? ectdAuthoring.artifacts
            : undefined
        }
        readinessPct={ectdReadiness.readinessPct ?? undefined}
        blockingCount={ectdReadiness.blockingCount ?? undefined}
        lastRimSync={ectdReadiness.lastRimSync ?? undefined}
      />
    );
  }

  // Phase 2 — Claude Design AnA RI chat shell, full viewport. Bundle source:
  // design-system/ui_kits/ana_ri/. Used for every chat-shell layoutMode.
  // Replace-or-Delete Law (CLAUDE.md): the legacy shell that wrapped these
  // mounts is dead for these layoutModes; the inline mounts in the legacy
  // main return are unreachable for these modes. embeddedModule cases
  // (510k/pma/cer/ectd) were already redirected to bundle MDX / eCTD above.
  if (
    layoutMode === 'project-home' ||
    layoutMode === 'regulatory-workspace' ||
    layoutMode === 'deep-research'
  ) {
    return (
      <Ana
        mode="full"
        defaultChatMode={layoutMode === 'deep-research' ? 'deep-research' : 'standard'}
        authoringContext={authoringContext}
        navContext={activeNavId}
        contextProfile={{
          productType: activeProject?.type,
          userRole: userRole,
          screenName: layoutMode,
          activeProject: activeProject?.name,
          projectId: activeProjectId,
          threadId: activeThreadId || activeConversationId,
          moduleContext,
        }}
        projectIntelligence={projectIntelligenceStats}
        greeting={
          layoutMode === 'deep-research'
            ? "What would you like to research? I'll search across ClinicalTrials.gov, PubMed, FDA, EMA, and more."
            : platformGreeting?.text ||
              `How can I help with ${activeProject?.name || 'your project'}?`
        }
        externalMessage={externalChatMessage?.text ?? null}
        onInitialMessageConsumed={() => setExternalChatMessage(null)}
        suggestedActions={workspaceSuggestedActions}
        onActionRun={handleActionRun}
        onNavigate={handleAnaPanelNavigate}
        onCreateProject={() => setNewProjectOpen(true)}
        projects={projects.map(p => ({
          id: p.id,
          title: p.name,
          description: p.type,
          meta: '',
        }))}
        onSelectProject={id => {
          setActiveProjectId(id);
          setLayoutMode('project-home');
          navigate(`/concept2cure/project/${id}`);
        }}
        onDraftInsert={handleDraftInsert}
        onNavigateToSection={handleNavigateToSection}
        onOpenArtifact={handleOpenArtifact}
        onRequestPromotion={handleRequestPromotion}
        onRefreshIntelligence={authoringIntelligence.refetch}
        onThreadChange={threadId => {
          setActiveThreadId(threadId);
          setActiveConversationId(threadId);
        }}
        initialMessage={
          pendingDraftSection
            ? `Draft CTD section ${pendingDraftSection.code}: ${pendingDraftSection.title}. Generate a compliant first draft following ICH M4 guidelines and 21 CFR 312.23(a) requirements.`
            : null
        }
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TO BE REMOVED — legacy ZenApp main return.
  //
  // Everything below this point renders surfaces the design-system bundle
  // has NOT shipped. They remain reachable only through legacy state-driven
  // navigation (handleAnaPanelNavigate fall-throughs, internal layoutMode
  // flips not yet audited). Per CLAUDE.md "UI Source of Truth" and the
  // user directive "Remove any surface that has not been built by Claude
  // Design", every layoutMode rendered here is on the chopping block.
  //
  // Each block must be deleted as the bundle ships its replacement, or
  // collapsed into the bundle's existing surfaces (MDX iframe / eCTD
  // coauthor / ana_ri / home) where one already covers the workstream.
  //
  // Layout modes still rendered here (non-bundle, awaiting deletion):
  //   apps, artifacts-center, biostatistics, csr-workflow, ctd,
  //   device-diagnostics-workbench, documents, dossier-map, editor,
  //   ind-checklist, precedent-intelligence, report-engine, review,
  //   safety-narrative, section-workspace, setup, submissions, task-board,
  //   templates, vault, workspace
  //
  // Plus the now-unreachable "project-home" / "regulatory-workspace"
  // mounts that lived inside this return (early returns above intercept
  // those layoutModes for the bundle Ana shell).
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="zen flex h-screen w-full overflow-hidden bg-white">
      {/* CSS Variables */}
      <style>{`
        .zen {
          --zen-canvas: #FAFAF9;
          --zen-canvas-muted: #F5F5F4;
          --zen-canvas-elevated: #FFFFFF;
          --zen-ink: #18181B;
          --zen-ink-muted: #71717A;
          --zen-border: #E4E4E7;
          --zen-accent: #d97757;
        }

        .zen-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        .zen-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .zen-scroll::-webkit-scrollbar-thumb {
          background-color: #E4E4E7;
          border-radius: 9999px;
        }

        .zen-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #D4D4D8;
        }
      `}</style>

      {/* Connection Status - only show if confirmed offline after health check loaded */}
      {cortexHealth && !isConnected && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-700 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>RI running in offline mode — chat still available</span>
        </div>
      )}

      {/* Sidebar */}
      <ZenSidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        conversations={conversations}
        projects={projects}
        activeConversationId={activeConversationId}
        activeProjectId={activeProjectId}
        activeNavId={
          activeToolPanel === 'vault'
            ? 'vault'
            : activeToolPanel === 'ana-biostats'
            ? 'biostatistics'
            : activeNavId
        }
        onSelectConversation={id => {
          setActiveConversationId(id);
          setActiveThreadId(id);
          setLayoutMode('project-home');
        }}
        onSelectProject={id => {
          openProjectWorkspace(id);
        }}
        onNewChat={handleNewChat}
        onOpenProjects={openProjectsDirectory}
        onCreateProject={() => setNewProjectOpen(true)}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onToggleStar={handleToggleConversationStar}
        onTogglePin={handleToggleConversationPin}
        onArchiveProject={handleArchiveProject}
        onDeleteProject={handleDeleteProject}
        onMoveConversation={handleMoveConversation}
        industryMode={industryMode}
        onNavigate={id => {
          const globalDestinationIds = new Set([
            'projects',
            'home',
            'apps',
            'artifacts-center',
            'setup',
            'vault',
          ]);
          switch (id) {
            // ── Global destinations + project tabs (mapped via SIDEBAR_NAV_TO_LAYOUT) ──
            case 'projects':
            case 'home':
            case 'apps':
            case 'artifacts-center':
            case 'setup':
            case 'overview':
            case 'work':
            case 'vault':
            case 'review-tab':
            case 'submit':
            case 'documents':
            case 'review':
            case 'reports':
            case 'submissions':
            case 'dossier':
            case 'publish':
            case 'verify':
            case 'haq':
            case 'submission-builder':
            case 'clinical-module5':
            case 'cmc':
            case 'ri-copilot':
            case 'task-board':
            case 'csr-workflow':
            case 'ind-checklist':
            case 'templates':
            case 'template-library':
              if (globalDestinationIds.has(id)) {
                setLayoutMode(SIDEBAR_NAV_TO_LAYOUT[id] ?? 'projects');
              } else {
                requireActiveProject(SIDEBAR_NAV_TO_LAYOUT[id] ?? 'projects');
              }
              if (id === 'ri-copilot') setRiViewMode('intelligence');
              if (id === 'submission-builder') setRiViewMode('editor');
              break;
            case 'tools':
              requireActiveProject(SIDEBAR_NAV_TO_LAYOUT['tools'] ?? 'documents');
              break;
            case 'agents':
              requireActiveProject('regulatory-workspace');
              break;
            case 'evidence-search':
              setCommandPaletteOpen(true);
              break;
            case 'project-config':
              setEditProjectOpen(true);
              break;
            // ── Product routes (external modules) ──
            case 'ai-copilot':
              setRiViewMode('intelligence');
              requireActiveProject('regulatory-workspace');
              break;
            case '510k-workspace':
              if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/510k`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'pma-workspace':
              if (embeddedModule !== null || !embedModulesEnabled) {
                setLayoutMode('projects');
              } else if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/pma`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'cer-generator':
              if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/cer`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'device-diagnostics-workbench':
              if (activeProjectId) {
                setLayoutMode('device-diagnostics-workbench');
              } else {
                // No project — open create modal so user can make one
                setNewProjectOpen(true);
                toast({
                  title: 'Create a project first',
                  description: 'Select 510(k), PMA, or De Novo to open the device workspace.',
                });
              }
              break;
            // ── Core submission workflow ──
            case 'regulatory-workspace':
            case 'section-workspace':
              requireActiveProject(id);
              break;
            case 'document-vault':
              requireActiveProject('vault');
              break;
            // ── Surviving specialist tools ──
            case 'precedent-intelligence':
              requireActiveProject('precedent-intelligence');
              break;
            case 'review-readiness':
              requireActiveProject('review-readiness');
              break;
            case 'biostatistics':
              requireActiveProject('regulatory-workspace');
              setActiveToolPanel('ana-biostats');
              break;
            case 'report-engine':
              requireActiveProject('report-engine');
              break;
            case 'safety-narrative':
              requireActiveProject('safety-narrative');
              break;
            case 'deep-research':
              requireActiveProject('deep-research');
              break;
            // [BATCH 3] All demoted/deleted modes — set the layout mode and let
            // the DEMOTED_REDIRECTS useEffect handle the redirect.
            default: {
              // If it's a known LayoutMode string, set it (useEffect will redirect).
              // Otherwise ignore.
              const knownModes: string[] = [
                'mission-control',
                'snowglobe',
                'snowglobe-chambers',
                'rules',
                'ectd-coauthor',
                'cmc',
                'document-vault',
                'clinical-trial',
                'templates',
                'sherpa',
                'analytics',
                'timeline',
                'audit',
                'enablement-center',
                'platform-admin',
                'biologics-dashboard',
                'ctd-onboarding',
                'client-intelligence',
                'collaboration-hub',
                'user-inbox',
                'client-branding',
                'training-center',
                'client-onboarding',
                'knowledge-base',
                'project-knowledge',
                'artifacts',
                'document-builder',
                'ana-platform-control',
                'author',
                'ind-workspace',
                'submission-workspace',
                'intelligence-hub',
                'command-center',
                'legal-center',
                'about-training',
                'ana-dashboard',
                'integrations',
                'agents',
                'tasks',
              ];
              if (knownModes.includes(id)) {
                const candidate = id as LayoutMode;
                if (PROJECT_SCOPED_LAYOUTS.has(candidate)) {
                  requireActiveProject(candidate);
                } else {
                  setLayoutMode(candidate);
                }
              }
              break;
            }
          }
        }}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Main area — no top bar, exactly like Claude.ai */}
      <GlobalOperatingShell
        layoutMode={layoutMode}
        activeProjectName={activeProject?.name}
        activeNavId={activeNavId}
        currentGlobalNodeLabel={currentGlobalNodeLabel}
        activeArtifactLabel={
          activeArtifactId
            ? `${activeArtifactId}${activeArtifactVersion ? ` · v${activeArtifactVersion}` : ''}`
            : undefined
        }
        onAction={handleHeaderAction}
      >
        {/* Content Area */}
        <div className="flex-1 flex min-w-0 min-h-0">
          {/* ── Embedded Module Host ── */}
          {embeddedModule === '510k' && urlProjectId && (
            <Embedded510kHost
              moduleAssistantOpen={moduleAssistantOpen}
              setModuleAssistantOpen={setModuleAssistantOpen}
              activeProjectId={activeProjectId}
              projectId={urlProjectId}
              projectName={activeProject?.name}
              activeThreadId={activeThreadId}
              onNavigate={handleAnaPanelNavigate}
              onNewProject={() => setNewProjectOpen(true)}
              onThreadChange={handleThreadChange}
              FDA510kWorkspacePage={FDA510kWorkspacePage}
              ModuleLoadingFallback={ModuleLoadingFallback}
              onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
            />
          )}

          {embeddedModule === 'pma' && urlProjectId && (
            <EmbeddedPMAHost
              moduleAssistantOpen={moduleAssistantOpen}
              setModuleAssistantOpen={setModuleAssistantOpen}
              activeProjectId={activeProjectId}
              projectId={urlProjectId}
              projectName={activeProject?.name}
              activeThreadId={activeThreadId}
              onNavigate={handleAnaPanelNavigate}
              onNewProject={() => setNewProjectOpen(true)}
              onThreadChange={handleThreadChange}
              EmbeddedPMAWorkspace={EmbeddedPMAWorkspace}
              ModuleLoadingFallback={ModuleLoadingFallback}
              onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
            />
          )}

          {embeddedModule === 'cer' && urlProjectId && (
            <EmbeddedCERHost
              moduleAssistantOpen={moduleAssistantOpen}
              setModuleAssistantOpen={setModuleAssistantOpen}
              activeProjectId={activeProjectId}
              projectId={urlProjectId}
              projectName={activeProject?.name}
              activeThreadId={activeThreadId}
              onNavigate={handleAnaPanelNavigate}
              onNewProject={() => setNewProjectOpen(true)}
              onThreadChange={handleThreadChange}
              EmbeddedCERV2Page={EmbeddedCERV2Page}
              ModuleLoadingFallback={ModuleLoadingFallback}
              onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
            />
          )}

          {/* [BATCH 3] Removed renderers: sherpa, analytics, timeline, audit,
              mission-control, snowglobe, snowglobe-chambers.
              These modes now redirect via DEMOTED_REDIRECTS useEffect. */}

          {/* [BATCH 3] Removed: timeline, audit, mission-control, snowglobe, snowglobe-chambers */}
          {/* [BATCH 1] Removed: about-training, ind-workspace, medtech-dashboard */}

          {/* ── Global destination: Apps launcher ── */}
          {!embeddedModule && layoutMode === 'apps' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-apps"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <AppsPage
                    submissionType={activeProject?.type}
                    onCreateProject={() => setNewProjectOpen(true)}
                    onNavigate={id => {
                      // Tool-panel mapping for apps that live as a project-scoped
                      // tool panel (eCTD Navigator, Protocol Designer, SOP, etc.)
                      const TOOL_PANEL_MAP: Record<
                        string,
                        'ectd' | 'protocol' | 'sop' | 'capa' | 'pms' | 'inspection' | 'intelligence' | 'vault' | 'ana-biostats'
                      > = {
                        'ectd-navigator': 'ectd',
                        'protocol-designer': 'protocol',
                        'sop-management': 'sop',
                        'capa-management': 'capa',
                        'post-market': 'pms',
                        'inspection-readiness': 'inspection',
                        'document-vault': 'vault',
                      };

                      // Starter messages for apps that seed an AnA conversation.
                      const SEED_MESSAGE: Record<string, string> = {
                        'device-strategy': 'Help me plan the device pathway for my project — 510(k) vs De Novo vs PMA, Q-submission readiness, and predicate strategy.',
                        'ind-authoring': 'Help me author my IND application — Modules 1, 2, and 3 priorities, gap analysis, and next steps.',
                        'cmc': 'Walk me through a CMC Module 3 evaluation for my project — what we have, what\u2019s missing, and risks.',
                        'safety-narrative': 'Draft a safety narrative using the current project data and flag decisions that need to be made.',
                        'report-engine': 'Generate an intelligent regulatory report for my project — scope, template, and the data I need.',
                        'csr-intelligence': 'Analyse my Clinical Study Report draft — integrity, consistency, and auto-complete what you can.',
                        'device-engineering': 'Help me plan device engineering deliverables — risk management (ISO 14971), SaMD cybersecurity, human factors, biocompatibility.',
                        'dossier-navigator': 'Show me my submission dossier map — sections, status, gaps, and priorities.',
                        'compliance-monitor': 'Run continuous compliance checks across my project, SOPs, and artifacts. What\u2019s out of policy?',
                        'evidence-engine': 'Aggregate my evidence base and score defensibility — what\u2019s strong, what\u2019s weak, what else should I gather?',
                        'regulatory-intelligence': 'Run a full regulatory intelligence analysis on my project. I want: reviewer deficiency pattern signals (RIM), multi-expert synthesis (CORTEX), submission outcome prediction (Foresight), CSR analysis if applicable, and predicate comparison if device. Summarize the key risks, strengths, and recommended next actions.',
                        'cortex-prime': 'Run a full regulatory intelligence analysis on my project — multi-expert synthesis, risk signals, and recommended actions.',
                        'foresight-ai': 'Run a full regulatory intelligence analysis on my project — submission outcome prediction, deficiency risk, and approval probability.',
                        'predicate-intelligence': 'Run a full regulatory intelligence analysis on my project — predicate devices, substantial equivalence, and comparison analysis.',
                      };

                      // Explicit routes that already exist
                      switch (id) {
                        case 'deep-research':
                          requireActiveProject('deep-research');
                          return;
                        case 'precedent-intelligence':
                          requireActiveProject('precedent-intelligence');
                          return;
                        case 'biostatistics':
                          if (requireActiveProject('regulatory-workspace')) {
                            setActiveToolPanel('ana-biostats');
                          }
                          return;
                        case '510k-workspace':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/510k`);
                          else setLayoutMode('projects');
                          return;
                        case 'pma-workspace':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/pma`);
                          else setLayoutMode('projects');
                          return;
                        case 'cer-generator':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/cer`);
                          else setLayoutMode('projects');
                          return;
                        case 'device-diagnostics-workbench':
                          requireActiveProject('device-diagnostics-workbench');
                          return;
                      }

                      // Tool-panel apps: open project-home + set the active tool panel
                      const toolPanel = TOOL_PANEL_MAP[id];
                      if (toolPanel) {
                        if (requireActiveProject('regulatory-workspace')) {
                          setActiveToolPanel(toolPanel);
                        }
                        return;
                      }

                      // Seed-chat apps: route to project and queue an AnA starter
                      const seed = SEED_MESSAGE[id];
                      if (seed) {
                        if (requireActiveProject('regulatory-workspace')) {
                          setExternalChatMessage({ text: seed, ts: Date.now() });
                        }
                        return;
                      }

                      // Unknown app ID — fall back to projects
                      setLayoutMode('projects');
                    }}
                    activeProjectId={activeProjectId}
                    activeProjectName={activeProject?.name}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Global destination: Artifacts browser ── */}
          {!embeddedModule && layoutMode === 'artifacts-center' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-artifacts-center"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <ArtifactsPage
                    onOpenArtifact={(projectId, artifactId) => {
                      setActiveProjectId(projectId);
                      setLayoutMode('regulatory-workspace');
                      setOpenArtifactId(artifactId);
                      setRiViewMode('editor');
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Global destination: Setup ── */}
          {!embeddedModule && layoutMode === 'setup' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-setup"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <SetupPage
                    onOpenSettings={section => {
                      if (section) setSettingsSection(section);
                      setSettingsOpen(true);
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Project tab: Vault ── */}
          {!embeddedModule && layoutMode === 'vault' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-vault"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <VaultPage
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    onOpenDocument={docId => {
                      if (!requireActiveProject('regulatory-workspace')) return;
                      setOpenArtifactId(docId);
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    }}
                    onDraftFromSource={(sourceTitle, _sourceId) => {
                      if (!requireActiveProject('regulatory-workspace')) return;
                      setPendingEditorContent({
                        title: `Draft from: ${sourceTitle}`,
                        content: '',
                        ctdSection: undefined,
                      });
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* [CONSOLIDATED] review-readiness now redirects to 'review' via DEMOTED_REDIRECTS */}

          {/* ── Biostatistics Platform — power, endpoints, design ── */}
          {!embeddedModule && layoutMode === 'biostatistics' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-biostatistics">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-stone-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-stone-200">&middot;</span>
                <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-stone-800">Biostatistics</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <LoadingState size="sm" message="" />
                    </div>
                  }
                >
                  <BiostatPlatformDashboard />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Legal Center — IP, contracts, regulatory law ── */}

          {/* ── Intelligent Report Engine — immutable records, atom provenance, quasi-indemnification ── */}
          {!embeddedModule && layoutMode === 'report-engine' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-report-engine">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <IntelligentReportGenerator />
              </Suspense>
            </div>
          )}

          {/* ── Safety Narrative — ICH E3 §12 compliant narrative generation ── */}
          {!embeddedModule && layoutMode === 'safety-narrative' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-safety-narrative">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <SafetyNarrativePage projectId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {!embeddedModule && layoutMode === 'device-diagnostics-workbench' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" data-testid="workspace-device-diagnostics-workbench">
              <Suspense fallback={<ModuleLoadingFallback />}>
                <DeviceDiagnosticsWorkbenchPage
                  projectId={activeProjectId || undefined}
                  projectName={activeProject?.name}
                  submissionType={activeProject?.type}
                  artifacts={projectArtifacts.map((a: any) => ({
                    id: String(a.id),
                    title: a.title || 'Untitled',
                    ctdSection: a.ctdSection || a.ctd_section,
                    status: a.status || 'draft',
                    version: a.version || 1,
                  }))}
                  onOpen510kWorkspace={() => {
                    if (activeProjectId) navigate(`/concept2cure/project/${activeProjectId}/510k`);
                  }}
                  onOpenPmaWorkspace={() => {
                    if (activeProjectId) navigate(`/concept2cure/project/${activeProjectId}/pma`);
                  }}
                  onOpenCerWorkspace={() => {
                    if (activeProjectId) navigate(`/concept2cure/project/${activeProjectId}/cer`);
                  }}
                  onOpenProjectModule={() => requireActiveProject('project-home')}
                  onOpenCollaboration={() => requireActiveProject('review')}
                  onOpenSubmissionCenter={() => requireActiveProject('submissions')}
                />
              </Suspense>
            </div>
          )}

          {/* Precedent Intelligence Dashboard (standalone) */}
          {layoutMode === 'precedent-intelligence' && (
            <div
              className="flex-1 flex flex-col min-h-0"
              data-testid="workspace-precedent-intelligence"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <PrecedentIntelligenceDashboard
                  onNavigateToEditor={() => requireActiveProject('regulatory-workspace')}
                />
              </Suspense>
            </div>
          )}

          {/* Redirect deprecated routes to unified workspace */}
          {['workspace', 'medtech-dashboard', 'dossier'].includes(layoutMode) && (
            <RedirectToWorkspace onRedirect={() => requireActiveProject('regulatory-workspace')} />
          )}

          {/* ── Project Workspace (3-pane: tree | content | inspector) ───── */}
          {!embeddedModule &&
            layoutMode === 'regulatory-workspace' &&
            (riViewMode === 'intelligence' ? (
              <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ri-copilot">
                {/* Intelligence mode header */}
                <div className="flex items-center gap-2 px-3 h-9 border-b border-stone-100 bg-white flex-shrink-0">
                  <button
                    onClick={() => setLayoutMode('projects')}
                    className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Home</span>
                  </button>
                  <span className="text-stone-200">·</span>
                  <Brain className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-stone-800">Intelligence</span>
                  {activeProject && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
                      {activeProject.name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-md border border-stone-200 overflow-hidden">
                      <button
                        data-testid="view-toggle-intelligence"
                        onClick={() => setRiViewMode('intelligence')}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium transition-colors',
                          'bg-blue-100 text-stone-700'
                        )}
                      >
                        Intelligence
                      </button>
                      <button
                        data-testid="view-toggle-editor"
                        onClick={() => setRiViewMode('editor')}
                        className="px-2 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-stone-50 transition-colors"
                      >
                        Documents
                      </button>
                    </div>
                  </div>
                </div>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center">
                        <LoadingState size="sm" message="" />
                      </div>
                    }
                  >
                    <RICopilotHome
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      submissionType={activeProject?.type}
                      indication={activeProject?.description}
                      onAnalyzeEvidence={() => setRiViewMode('editor')}
                      onDraftFromPrecedent={(content, title, ctdSection) => {
                        setPendingEditorContent({ content, title, ctdSection });
                        setRiViewMode('editor');
                      }}
                      onOpenEditor={() => setRiViewMode('editor')}
                      onSelectProject={openProjectsDirectory}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            ) : (
              <ProjectWorkspaceShell
                projectId={activeProjectId}
                projectName={activeProject?.name}
                projectType={activeProject?.type}
                submissionType={activeProject?.type}
                industryMode={industryMode}
                onBackToProjects={() => setLayoutMode('projects')}
                onSelectProject={openProjectsDirectory}
                onSwitchToIntelligence={() => setRiViewMode('intelligence')}
                initialContent={pendingEditorContent?.content}
                initialTitle={pendingEditorContent?.title}
                initialCtdSection={pendingEditorContent?.ctdSection}
                initialTemplateId={pendingEditorContent?.templateId}
                onInitialContentConsumed={() => setPendingEditorContent(null)}
                openArtifactId={openArtifactId}
                onOpenArtifactConsumed={() => setOpenArtifactId(undefined)}
                onActiveDocumentChange={doc => {
                  if (doc) {
                    setActiveArtifactId(doc.id);
                    setActiveArtifactVersion(doc.version != null ? String(doc.version) : undefined);
                    setActiveArtifactStatus(doc.status);
                    if (doc.ctdSection) setActiveSectionCode(doc.ctdSection);
                  } else {
                    setActiveArtifactId(undefined);
                    setActiveArtifactVersion(undefined);
                    setActiveArtifactStatus(undefined);
                  }
                }}
                onNavigate={mode => {
                  if (mode === 'haq') {
                    requireActiveProject('documents');
                    setToolsSubView('haq');
                    return;
                  }
                  const nextMode = mode as LayoutMode;
                  if (isProjectScopedLayout(nextMode)) {
                    requireActiveProject(nextMode);
                    return;
                  }
                  setLayoutMode(nextMode);
                }}
                onSuggestedPrompt={prompt => {
                  setExternalChatMessage({ text: prompt, ts: Date.now() });
                }}
                guidedStageCommand={guidedStageRequest}
              />
            ))}

          {/* ── Project Home: AnA-first with light context strip ── */}
          {/* Strip is flex-shrink-0; AnA (rendered separately below) takes flex-1 */}
          {!embeddedModule && layoutMode === 'project-home' && activeProject && (
            <div className="flex-shrink-0" data-testid="workspace-overview">
              <ProjectHomeDashboard
                project={{
                  id: Number(activeProjectId) || 0,
                  name: activeProject.name,
                  type: activeProject.type,
                  description: activeProject.description ?? null,
                  sponsor: ((activeProject as Record<string, unknown>).sponsor as string) || null,
                  product: ((activeProject as Record<string, unknown>).product as string) || null,
                  region: ((activeProject as Record<string, unknown>).region as string) || null,
                }}
                onNavigate={mode => {
                  const mapped = SIDEBAR_NAV_TO_LAYOUT[mode];
                  if (mapped) {
                    if (isProjectScopedLayout(mapped)) {
                      requireActiveProject(mapped);
                    } else {
                      setLayoutMode(mapped);
                    }
                  } else {
                    console.warn(`[ProjectHomeDashboard] Unknown nav mode: ${mode}`);
                  }
                }}
                onOpenConfig={() => setEditProjectOpen(true)}
                onOpenSearch={() => setCommandPaletteOpen(true)}
                onSuggestedPrompt={prompt => {
                  setExternalChatMessage({ text: prompt, ts: Date.now() });
                }}
                onOpenArtifact={artifactId => {
                  if (!requireActiveProject('regulatory-workspace')) return;
                  setOpenArtifactId(artifactId);
                  setRiViewMode('editor');
                }}
              />
            </div>
          )}

          {/* ── Unified Workflow: Dossier Map ────────────────────────────── */}
          {!embeddedModule && layoutMode === 'dossier-map' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <DossierMap
                projectId={activeProjectId}
                projectName={activeProject?.name}
                projectType={activeProject?.type}
                onSectionClick={sectionCode => {
                  if (!requireActiveProject('regulatory-workspace')) return;
                  // Smart routing: if artifact exists, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                  }
                }}
                onCreateForSection={(sectionCode, sectionTitle) => {
                  if (!requireActiveProject('regulatory-workspace')) return;
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                }}
                onNavigateSubmit={() => requireActiveProject('submissions')}
                onBack={() => requireActiveProject('project-home')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: Tools (curated workbench — builder is one tool inside) */}
          {!embeddedModule && layoutMode === 'documents' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-tools">
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  {toolsSubView === 'builder' ? (
                    <FullDocumentBuilder
                      onOpenInEditor={(content, title, ctdSection) => {
                        if (!requireActiveProject('regulatory-workspace')) return;
                        setPendingEditorContent({ content, title, ctdSection });
                        setRiViewMode('editor');
                        setToolsSubView('landing');
                      }}
                    />
                  ) : toolsSubView === 'haq' ? (
                    <HAQManagerView
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      onOpenInEditor={(content, title) => {
                        if (!requireActiveProject('regulatory-workspace')) return;
                        setPendingEditorContent({ content, title });
                        setRiViewMode('editor');
                        setToolsSubView('landing');
                      }}
                    />
                  ) : (
                    <ToolsLanding
                      projectName={activeProject?.name}
                      recentArtifacts={workspaceSummary?.recent?.documents?.slice(0, 3)?.map(d => ({
                        id: d.id,
                        title: d.name,
                        updatedAt: d.uploadedAt,
                      }))}
                      onResumeArtifact={artifactId => {
                        if (!requireActiveProject('regulatory-workspace')) return;
                        setOpenArtifactId(artifactId);
                        setRiViewMode('editor');
                      }}
                      onAction={toolId => {
                        switch (toolId) {
                          case 'recent':
                            // Open workspace in document studio mode — shows recent documents list
                            if (!requireActiveProject('regulatory-workspace')) return;
                            setRiViewMode('editor');
                            break;
                          case 'create':
                            // Create a new blank document — lands in EditorPanel with new artifact
                            if (!requireActiveProject('regulatory-workspace')) return;
                            setPendingEditorContent({ content: '', title: 'Untitled Document' });
                            setRiViewMode('editor');
                            break;
                          case 'builder':
                            // Open Document Builder wizard (multi-step CSR/CTD generation)
                            setToolsSubView('builder');
                            break;
                          case 'templates':
                            // Open workspace — user selects templates from left rail
                            if (!requireActiveProject('regulatory-workspace')) return;
                            setRiViewMode('editor');
                            break;
                          case 'dossier':
                            requireActiveProject('dossier-map');
                            break;
                          case 'vault':
                            requireActiveProject('vault');
                            break;
                          case 'review':
                            requireActiveProject('review');
                            break;
                          case 'submit':
                            requireActiveProject('submissions');
                            break;
                          case 'haq':
                            setToolsSubView('haq');
                            break;
                        }
                      }}
                    />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* [CONSOLIDATED] vault-workspace now redirects to 'vault' via DEMOTED_REDIRECTS */}

          {/* ── Unified Workflow: Review (governance & approvals) ─────────── */}
          {!embeddedModule && layoutMode === 'review' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-review">
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <ReviewReadiness
                    projectId={activeProjectId}
                    onClose={() => requireActiveProject('project-home')}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Unified Workflow: Submissions (readiness, builder & export) ── */}
          {!embeddedModule && layoutMode === 'submissions' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0">
                {/* Submission sub-nav tabs */}
                <div className="flex items-center gap-1 border-b border-stone-200 bg-white px-4">
                  {(['readiness', 'builder'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSubmissionTab(tab)}
                      className={cn(
                        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                        submissionTab === tab
                          ? 'border-stone-900 text-stone-900'
                          : 'border-transparent text-stone-500 hover:text-stone-700'
                      )}
                    >
                      {tab === 'readiness' ? 'Readiness' : 'Package Manifest'}
                    </button>
                  ))}
                </div>
                <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
                  Beta note: package generation currently exports a submission manifest JSON for
                  internal review and handoff.
                </div>

                {submissionTab === 'readiness' ? (
                  <SubmissionReadinessView
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    projectType={activeProject?.type}
                    onSectionClick={(sectionCode, sectionTitle) => {
                      const moduleNum = sectionCode.charAt(0);
                      const match = projectArtifacts.find(
                        (a: any) =>
                          a.ctdSection === sectionCode ||
                          a.ctdSection === `csr-${sectionCode}` ||
                          a.ctdSection === `m${moduleNum}-${sectionCode}`
                      );
                      if (match) {
                        setOpenArtifactId(match.id);
                        setRiViewMode('editor');
                      } else {
                        setPendingEditorContent({
                          title: sectionTitle || `Section ${sectionCode}`,
                          content: '',
                          ctdSection: sectionCode,
                        });
                        setRiViewMode('editor');
                      }
                    }}
                    onBack={() => requireActiveProject('project-home')}
                    onExport={async () => {
                      if (!activeProjectId) return;
                      try {
                        const res = await apiRequest(
                          'POST',
                          `/api/concept2cure/projects/${activeProjectId}/submission-package`
                        );
                        const payload = await res.json();
                        const manifest = payload?.data ?? payload;
                        if (manifest) {
                          const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${
                            manifest.projectName || 'submission'
                          }-package-manifest.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error('[Export] Package generation failed:', err);
                      }
                    }}
                  />
                ) : (
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <SubmissionBuilderView
                      projectId={String(activeProjectId || '')}
                      projectName={activeProject?.name}
                      submissionType={(activeProject?.type as 'IND' | 'NDA' | 'BLA') || 'IND'}
                      artifacts={projectArtifacts.map((a: any) => ({
                        id: String(a.id),
                        title: a.title || 'Untitled',
                        ctdSection: a.ctdSection || a.ctd_section,
                        status: a.status || 'draft',
                        version: a.version || 1,
                      }))}
                      onOpenArtifact={(artifactId: any) => {
                        setOpenArtifactId(artifactId);
                        setRiViewMode('editor');
                      }}
                      onCreateArtifact={(sectionId: any, sectionLabel: any) => {
                        setPendingEditorContent({
                          title: sectionLabel,
                          content: '',
                          ctdSection: sectionId,
                        });
                        setRiViewMode('editor');
                      }}
                      onGeneratePackage={async () => {
                        if (!activeProjectId) return;
                        try {
                          const res = await apiRequest(
                            'POST',
                            `/api/concept2cure/projects/${activeProjectId}/submission-package`
                          );
                          const payload = await res.json();
                          const manifest = payload?.data ?? payload;
                          const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `submission-package-manifest-${activeProjectId}-${Date.now()}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('[SubmissionBuilder] Package generation failed:', err);
                        }
                      }}
                      onClose={() => setSubmissionTab('readiness')}
                    />
                  </Suspense>
                )}
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: Task Board (full Kanban view) ──────────── */}
          {!embeddedModule && layoutMode === 'task-board' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
                <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => requireActiveProject('project-home')}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h1 className="text-lg font-semibold text-stone-900">Tasks & Milestones</h1>
                      <p className="text-xs text-stone-500">{activeProject?.name || 'Project'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-6">
                  <ProjectTaskBoardView
                    projectId={activeProjectId}
                    projectType={activeProject?.type}
                  />
                </div>
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: CSR Authoring (ICH E3) ──────────────── */}
          {!embeddedModule && layoutMode === 'csr-workflow' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <CSRWorkflowView
                projectId={activeProjectId}
                projectName={activeProject?.name}
                onSectionClick={sectionCode => {
                  // Smart routing: if artifact exists for this section, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                  }
                }}
                onAIDraft={async (sectionCode, sectionTitle) => {
                  // Create a new draft and open in editor
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                }}
                onBack={() => requireActiveProject('project-home')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: IND Checklist (21 CFR 312.23) ────────── */}
          {!embeddedModule && layoutMode === 'ind-checklist' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <INDChecklistView
                projectId={activeProjectId}
                projectName={activeProject?.name}
                onSectionClick={sectionCode => {
                  // Smart routing: if artifact exists for this section, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                  }
                }}
                onAIDraft={async (sectionCode, sectionTitle) => {
                  // Create a new draft and open in editor
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                }}
                onBack={() => requireActiveProject('project-home')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: Template Library ──────────────────────── */}
          {!embeddedModule && (layoutMode === 'template-library' || layoutMode === 'templates') && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
                <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => requireActiveProject('project-home')}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h1 className="text-lg font-semibold text-stone-900">Template Library</h1>
                      <p className="text-xs text-stone-500">Regulatory document templates</p>
                    </div>
                  </div>
                </div>
                <TemplateLibraryView
                  onSelectTemplate={template => {
                    const templateScaffold = [
                      `<h1>${template.name}</h1>`,
                      ...template.sections.map((section, index) => {
                        const heading = `<h2>${index + 1}. ${section.title}</h2>`;
                        const guidance = section.guidance
                          ? `<p><em>${section.guidance}</em></p>`
                          : '<p>[Add section content]</p>';
                        return `${heading}\n${guidance}`;
                      }),
                    ].join('\n');
                    const sectionCode = template.ctdSection;
                    if (sectionCode) {
                      setActiveSectionCode(sectionCode);
                      const moduleNum = sectionCode.charAt(0);
                      const match = projectArtifacts.find(
                        (a: any) =>
                          a.ctdSection === sectionCode ||
                          a.ctdSection === `csr-${sectionCode}` ||
                          a.ctdSection === `m${moduleNum}-${sectionCode}`
                      );
                      if (match) {
                        setOpenArtifactId(match.id);
                      } else {
                        setPendingEditorContent({
                          title: template.name,
                          content: templateScaffold,
                          ctdSection: sectionCode,
                          templateId: template.id,
                        });
                      }
                    } else {
                      setPendingEditorContent({
                        title: template.name,
                        content: templateScaffold,
                        templateId: template.id,
                      });
                    }
                    setRiViewMode('editor');
                  }}
                  onClose={() => requireActiveProject('project-home')}
                />
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: Section Workspace ──────────────────────── */}
          {!embeddedModule && layoutMode === 'section-workspace' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <SectionWorkspace
                section={(() => {
                  // Resolve section metadata from real project artifacts + CTD hierarchy
                  const code = activeSectionCode || '2.5';

                  // Module name from the section code prefix
                  const moduleNum = code.charAt(0);
                  const MODULE_NAMES: Record<string, string> = {
                    '1': 'Module 1 — Administrative',
                    '2': 'Module 2 — CTD Summaries',
                    '3': 'Module 3 — Quality',
                    '4': 'Module 4 — Nonclinical',
                    '5': 'Module 5 — Clinical',
                  };

                  // Find matching artifact by CTD section
                  const matchingArtifact = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === code ||
                      a.ctdSection === `csr-${code}` ||
                      a.ctdSection === `m${moduleNum}-${code}`
                  );

                  // Derive status from real artifact if found
                  let status:
                    | 'not-started'
                    | 'drafting'
                    | 'in-review'
                    | 'approved'
                    | 'blocked'
                    | 'locked' = 'not-started';
                  if (matchingArtifact) {
                    const s = matchingArtifact.status;
                    if (s === 'approved') status = 'approved';
                    else if (s === 'locked' || s === 'published') status = 'locked';
                    else if (s === 'review' || s === 'in_review') status = 'in-review';
                    else if (s === 'blocked') status = 'blocked';
                    else status = 'drafting';
                  }

                  // Title: prefer artifact title, fall back to section code
                  const title = matchingArtifact?.title || `Section ${code}`;

                  return {
                    code,
                    title,
                    status,
                    module: MODULE_NAMES[moduleNum] || 'Unknown Module',
                    version: matchingArtifact?.version,
                    lastEditedAt: matchingArtifact?.updatedAt,
                  };
                })()}
                projectName={activeProject?.name}
                projectId={activeProjectId}
                readiness={sectionReadiness}
                contradictions={sectionContradictions}
                onContextChange={handleAuthoringContextChange}
                onBack={() => setLayoutMode('dossier-map')}
                onOpenInEditor={(() => {
                  // If there's a matching artifact, provide a way to open it in the full editor
                  const code = activeSectionCode || '2.5';
                  const moduleNum = code.charAt(0);
                  const matchingArtifact = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === code ||
                      a.ctdSection === `csr-${code}` ||
                      a.ctdSection === `m${moduleNum}-${code}`
                  );
                  if (matchingArtifact) {
                    return () => {
                      setOpenArtifactId(matchingArtifact.id);
                      setRiViewMode('editor');
                    };
                  }
                  return undefined;
                })()}
                onCreateDraft={
                  activeProjectId
                    ? () => {
                        const code = activeSectionCode || '2.5';
                        const moduleNum = code.charAt(0);
                        const MODULE_NAMES: Record<string, string> = {
                          '1': 'Administrative',
                          '2': 'CTD Summaries',
                          '3': 'Quality',
                          '4': 'Nonclinical',
                          '5': 'Clinical',
                        };
                        setPendingEditorContent({
                          title: `Section ${code} — ${MODULE_NAMES[moduleNum] || 'Document'}`,
                          content: '',
                          ctdSection: code,
                        });
                        setRiViewMode('editor');
                      }
                    : undefined
                }
              />
            </Suspense>
          )}

          {/* ── Projects Index: AnA is the full-screen interface (ChatGPT/Claude style) ── */}
          {/* PlatformHome removed — AnA handles everything via chat */}

          {/* ── Project Workspace — Claude.ai-style project view ──────── */}
          {!embeddedModule && layoutMode === 'workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ── Project Header — Claude.ai style: breadcrumb + title + star ── */}
              {/* Claude.ai-style project header bar */}
              <ProjectHeaderBar
                projectName={activeProject?.name || 'Untitled Project'}
                submissionType={activeProject?.type || 'IND'}
                projectColor={activeProject?.color}
                productName={activeProject?.product}
                targetAgency={activeProject?.targetAgency}
                readinessScore={projectReadinessScore}
                onOpenConfig={() => setEditProjectOpen(true)}
                onSwitchProject={openProjectsDirectory}
              />

              {/* ── Workspace body: AnA chat + right panel ───────────── */}
              <div className="flex-1 flex min-h-0">
                {/* Center: AnA (the ONE chat — Claude.ai style) */}
                <Ana
                  mode="full"
                  authoringContext={authoringContext}
                  navContext={activeNavId}
                  contextProfile={{
                    productType: activeProject?.type,
                    userRole: userRole,
                    screenName: 'regulatory-workspace',
                    activeProject: activeProject?.name,
                    projectId: activeProjectId,
                  }}
                  projectIntelligence={projectIntelligenceStats}
                  greeting={
                    platformGreeting?.text ||
                    `How can I help with ${activeProject?.name || 'your project'}?`
                  }
                  suggestedActions={workspaceSuggestedActions}
                  onActionRun={handleActionRun}
                  onNavigate={handleAnaPanelNavigate}
                  onDraftInsert={handleDraftInsert}
                  onNavigateToSection={handleNavigateToSection}
                  onOpenArtifact={handleOpenArtifact}
                  onRequestPromotion={handleRequestPromotion}
                  onRefreshIntelligence={authoringIntelligence.refetch}
                  initialMessage={
                    pendingDraftSection
                      ? `Draft CTD section ${pendingDraftSection.code}: ${pendingDraftSection.title}. Generate a compliant first draft following ICH M4 guidelines and 21 CFR 312.23(a) requirements.`
                      : null
                  }
                />

                {/* Right sidebar: Claude.ai-style project knowledge */}
                {/* Desktop: static panel */}
                <div className="w-72 xl:w-80 border-l border-stone-150 bg-white flex-shrink-0 hidden lg:flex">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12 w-full">
                        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                      </div>
                    }
                  >
                    <ProjectKnowledgePanel projectId={activeProjectId ?? null} className="w-full" />
                  </Suspense>
                </div>
                {/* Mobile/Tablet: floating toggle + slide-over drawer */}
                {workspacePanelOpen && (
                  <>
                    <div
                      className="fixed inset-0 bg-black/30 z-40 lg:hidden"
                      onClick={() => setWorkspacePanelOpen(false)}
                    />
                    <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-stone-200 shadow z-50 lg:hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                        <span className="text-sm font-medium text-stone-700">Project Context</span>
                        <button
                          onClick={() => setWorkspacePanelOpen(false)}
                          className="p-1 hover:bg-stone-100 rounded"
                        >
                          <X className="w-4 h-4 text-stone-400" />
                        </button>
                      </div>
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center py-12 w-full">
                            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                          </div>
                        }
                      >
                        <ProjectKnowledgePanel
                          projectId={activeProjectId ?? null}
                          className="w-full"
                        />
                      </Suspense>
                    </div>
                  </>
                )}
                {/* Mobile toggle button */}
                <button
                  onClick={() => setWorkspacePanelOpen(true)}
                  className="fixed right-4 bottom-4 z-30 lg:hidden w-10 h-10 bg-stone-900 text-white rounded-full shadow-sm flex items-center justify-center hover:bg-stone-800 transition-colors"
                  title="Project context"
                >
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {!embeddedModule && layoutMode === 'editor' && (
            <div className="flex-1 flex min-w-0 min-h-0" data-testid="workspace-editor">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center">
                      <LoadingState size="sm" message="" />
                    </div>
                  }
                >
                  <EditorPanel
                    projectId={activeProjectId}
                    submissionType={activeProject?.type}
                    initialContent={pendingEditorContent?.content}
                    initialTitle={pendingEditorContent?.title}
                    initialCtdSection={pendingEditorContent?.ctdSection}
                    initialTemplateId={pendingEditorContent?.templateId}
                    onInitialContentConsumed={() => setPendingEditorContent(null)}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Phase 3 — eCTD co-authoring workbench (Claude Design bundle).
              Three-pane shell: tree · intelligence · artifact. The Intelligence
              pane streams real responses through the same useAnaChat hook
              Phase 2 uses; bundle fixtures still drive the tree + artifact
              content until step 2 of the wiring (authoring.router.ts) lands. */}
          {!embeddedModule && layoutMode === 'ectd-coauthor' && (
            <div className="flex-1 flex min-w-0 min-h-0" data-testid="workspace-ectd-coauthor">
              <ErrorBoundary>
                <ClaudeEctdCoauthor
                  applicationLabel={activeProject?.name}
                  chat={ectdChat}
                  tree={
                    ectdAuthoring.tree && ectdAuthoring.tree.some(m => m.children.length > 0)
                      ? ectdAuthoring.tree
                      : undefined
                  }
                  artifacts={
                    ectdAuthoring.artifacts && Object.keys(ectdAuthoring.artifacts).length > 0
                      ? ectdAuthoring.artifacts
                      : undefined
                  }
                  readinessPct={ectdReadiness.readinessPct ?? undefined}
                  blockingCount={ectdReadiness.blockingCount ?? undefined}
                  lastRimSync={ectdReadiness.lastRimSync ?? undefined}
                  onSubmitForReview={async ({ docId, sectionPath }) => {
                    if (!docId) {
                      toast({
                        title: 'No document linked',
                        description: `Section ${sectionPath} is from a fixture; submit-for-review needs a real authoring document.`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    try {
                      const res = await apiRequest(
                        'POST',
                        `/api/authoring/docs/${docId}/submit`,
                        {},
                      );
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      toast({
                        title: 'Submitted for review',
                        description: `Section ${sectionPath} is now in the review workflow.`,
                      });
                    } catch (err) {
                      toast({
                        title: 'Submit failed',
                        description: err instanceof Error ? err.message : 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  }}
                  onExport={async ({ docId, sectionPath }) => {
                    if (!docId) {
                      toast({
                        title: 'No document linked',
                        description: `Section ${sectionPath} is from a fixture; export needs a real authoring document.`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    try {
                      const res = await apiRequest(
                        'POST',
                        `/api/authoring/docs/${docId}/export`,
                        { format: 'docx' },
                      );
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      toast({
                        title: 'Export started',
                        description: `Document export is being prepared. Check the export history.`,
                      });
                    } catch (err) {
                      toast({
                        title: 'Export failed',
                        description: err instanceof Error ? err.message : 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  }}
                  onShare={({ docId, sectionPath }) => {
                    // No backend share endpoint today — copy a deep link to the
                    // active section so collaborators can paste it into chat or
                    // email. Falls back to the project URL when no docId.
                    const url = new URL(window.location.href);
                    if (docId) {
                      url.searchParams.set('doc', docId);
                      url.searchParams.set('section', sectionPath);
                    }
                    void navigator.clipboard?.writeText(url.toString()).catch(() => {});
                    toast({
                      title: 'Link copied',
                      description: docId
                        ? `Shareable link to section ${sectionPath} is on your clipboard.`
                        : 'Section is from a fixture; only the page link was copied.',
                    });
                  }}
                  onRevert={async ({ sectionId, sectionPath }) => {
                    if (!sectionId) {
                      toast({
                        title: 'No section linked',
                        description: `Section ${sectionPath} is from a fixture; revert needs a real authoring section.`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    try {
                      const res = await apiRequest(
                        'POST',
                        `/api/authoring/sections/${sectionId}/revert`,
                        {},
                      );
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      toast({
                        title: 'Section reverted',
                        description: `Section ${sectionPath} restored to the previous revision.`,
                      });
                    } catch (err) {
                      toast({
                        title: 'Revert failed',
                        description: err instanceof Error ? err.message : 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
              </ErrorBoundary>
            </div>
          )}
          {/* assistant/ctd mode → redirect to workspace (ONE chat via AnA) */}
          {!embeddedModule && (layoutMode === 'assistant' || layoutMode === 'ctd') && (
            <RedirectToWorkspace
              onRedirect={() =>
                setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects')
              }
            />
          )}
        </div>

        {/* ── Project Home: AnA chat + Knowledge sidebar (Claude.ai layout) ── */}
        {layoutMode === 'project-home' && (
          <div className="flex-1 flex min-h-0">
            {/* Center: AnA chat */}
            <Ana
              mode="full"
              authoringContext={authoringContext}
              navContext="project-home"
              contextProfile={{
                productType: activeProject?.type,
                userRole: userRole,
                screenName: 'project-home',
                activeProject: activeProject?.name,
                projectId: activeProjectId,
                threadId: activeThreadId || activeConversationId,
                moduleContext,
              }}
              projectIntelligence={projectIntelligenceStats}
              greeting={
                activeProject
                  ? `Working on ${activeProject.name}. What would you like to do?`
                  : platformGreeting?.text
              }
              externalMessage={externalChatMessage?.text ?? null}
              suggestedActions={workspaceSuggestedActions}
              onActionRun={handleActionRun}
              onNavigate={handleAnaPanelNavigate}
              onDraftInsert={handleDraftInsert}
              onNavigateToSection={handleNavigateToSection}
              onOpenArtifact={handleOpenArtifact}
              onRequestPromotion={handleRequestPromotion}
              onRefreshIntelligence={authoringIntelligence.refetch}
              onThreadChange={threadId => {
                setActiveThreadId(threadId);
                setActiveConversationId(threadId);
              }}
            />

            {/* Right sidebar: Project Knowledge (Claude.ai style — always visible) */}
            {!activeArtifactId && (
              <div className="w-72 xl:w-80 border-l border-stone-150 bg-white flex-shrink-0 hidden lg:flex">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-12 w-full">
                      <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                    </div>
                  }
                >
                  <ProjectKnowledgePanel projectId={activeProjectId ?? null} className="w-full" />
                </Suspense>
              </div>
            )}

            {/* Document Canvas: replaces knowledge panel when an artifact is active */}
            {activeArtifactId && (
              <div className="w-[45%] xl:w-[50%] flex-shrink-0 hidden lg:block">
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <DocumentCanvasPanel
                      artifactId={activeArtifactId}
                      projectId={activeProjectId}
                      onClose={() => setActiveArtifactId(undefined)}
                      onOpenFullEditor={id => {
                        setOpenArtifactId(id);
                        setRiViewMode('editor');
                      }}
                      onSaveToVault={_id => {
                        setActiveArtifactId(undefined);
                        setLayoutMode('vault');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}

        {/* Home (layoutMode='projects' && !embeddedModule) is handled by the
            Concept2CureHome early return above; this branch intentionally has
            no rendering for that combination. */}

        {layoutMode !== 'workspace' &&
          layoutMode !== 'regulatory-workspace' &&
          layoutMode !== 'project-home' &&
          layoutMode !== 'projects' && (
            <Ana
              mode={layoutMode === 'deep-research' ? 'full' : 'compact'}
              defaultChatMode={layoutMode === 'deep-research' ? 'deep-research' : 'standard'}
              authoringContext={authoringContext}
              navContext={activeNavId}
              contextProfile={{
                productType: activeProject?.type,
                userRole: userRole,
                screenName: layoutMode,
                activeProject: activeProject?.name,
                projectId: activeProjectId,
                threadId: activeThreadId || activeConversationId,
                moduleContext,
              }}
              projectIntelligence={projectIntelligenceStats}
              greeting={
                layoutMode === 'deep-research'
                  ? "What would you like to research? I'll search across ClinicalTrials.gov, PubMed, FDA, EMA, and more."
                  : platformGreeting?.text
              }
              suggestedActions={undefined}
              onActionRun={handleActionRun}
              onNavigate={handleAnaPanelNavigate}
              onDraftInsert={handleDraftInsert}
              onNavigateToSection={handleNavigateToSection}
              onOpenArtifact={handleOpenArtifact}
              onRequestPromotion={handleRequestPromotion}
              onRefreshIntelligence={authoringIntelligence.refetch}
              onThreadChange={threadId => {
                setActiveThreadId(threadId);
                setActiveConversationId(threadId);
              }}
            />
          )}
      </GlobalOperatingShell>

      {/* Global right-drawer Vault tab — REMOVED 2026-04-07
          Vault is reachable from the left sidebar Vault nav item. */}

      {!embeddedModule && activeToolPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 lg:w-[620px] shadow-sm">
          <ToolPanelWrapper
            panel={activeToolPanel}
            onClose={() => {
              setActiveToolPanel(null);
              setToolPanelFullscreen(false);
            }}
            isFullscreen={toolPanelFullscreen}
            onToggleFullscreen={() => setToolPanelFullscreen(prev => !prev)}
          />
        </div>
      )}

      {/* [Phase A] Dr. Sage removed — AnA is the single guide identity */}

      {/* AnA — moved to inline bottom bar (see below) */}

      {canViewRouteDebugPanel && (
        <div className="fixed bottom-3 left-3 z-50 flex flex-col gap-2">
          <button
            className="rounded-md border border-stone-300 bg-white/95 px-3 py-1 text-xs font-medium text-stone-700 shadow"
            onClick={() => {
              const next = !externalTestingMode;
              setExternalTestingMode(next);
              try {
                localStorage.setItem('concept2cure_external_testing_mode', String(next));
              } catch {
                // no-op
              }
            }}
          >
            External testing: {externalTestingMode ? 'ON' : 'OFF'}
          </button>
          {externalTestingMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow">
              <div className="font-semibold">External Testing Route Panel</div>
              <div>Route: {approvedRouteDecision.normalizedPath}</div>
              <div>Status: {approvedRouteDecision.disposition}</div>
              <div>Reason: {approvedRouteDecision.reason}</div>
              <div>Rule: {approvedRouteDecision.ruleId ?? 'n/a'}</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium"
                  onClick={async () => {
                    const report = JSON.stringify(
                      {
                        route: approvedRouteDecision.normalizedPath,
                        status: approvedRouteDecision.disposition,
                        reason: approvedRouteDecision.reason,
                        projectId: activeProjectId,
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    );
                    try {
                      await navigator.clipboard.writeText(report);
                      toast({ title: 'Issue snapshot copied', description: 'Paste into your tracker/ticket.' });
                    } catch {
                      toast({ title: 'Copy failed', description: 'Unable to access clipboard in this browser.', variant: 'destructive' });
                    }
                  }}
                >
                  Capture issue
                </button>
                <button
                  className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem(`runlog:${activeProjectId}`);
                    } catch {
                      // no-op
                    }
                    setLayoutMode(activeProjectId ? 'project-home' : 'projects');
                    navigate(activeProjectId ? `/concept2cure/project/${activeProjectId}` : '/concept2cure');
                    toast({ title: 'Workspace reset', description: 'Returned to a known-good entry route.' });
                  }}
                >
                  Reset route
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Command palette */}
      <ZenCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* Settings — lazy loaded */}
      {settingsOpen && (
        <React.Suspense fallback={null}>
          <ZenSettings
            isOpen={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsSection(undefined);
            }}
            activeProjectId={activeProjectId}
            activeProjectName={activeProject?.name}
            initialSection={settingsSection as any}
          />
        </React.Suspense>
      )}

      {/* New project modal */}
      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* Project config flyout (replaces EditProjectModal) */}
      <ProjectConfigPanel
        isOpen={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        project={
          activeProject
            ? {
                id: activeProject.id,
                name: activeProject.name,
                description: activeProject.description,
                submissionType: activeProject.type,
                sponsor: activeProject.sponsor,
                product: activeProject.product,
                region: activeProject.region,
                targetAgency: activeProject.targetAgency,
                targetSubmissionDate: activeProject.targetSubmissionDate,
                status: activeProject.status,
                customInstructions: customInstructions,
                teamMembers: (activeProject as any).teamMembers || [],
              }
            : null
        }
        onSave={handleEditProject}
      />

      {/* First-run onboarding experience */}
      {showFirstRun && (
        <Suspense fallback={null}>
          <FirstRunExperience
            userName={userName}
            existingProjects={projects}
            onComplete={(selectedRole, options) => {
              setShowFirstRun(false);
              try {
                localStorage.setItem('concept2cure_first_run_complete', 'true');
              } catch {
                /* localStorage unavailable */
              }
              if (selectedRole) {
                try {
                  const profile = JSON.parse(
                    localStorage.getItem('concept2cure_user_profile') || '{}'
                  );
                  profile.role = selectedRole;
                  localStorage.setItem('concept2cure_user_profile', JSON.stringify(profile));
                  setUserProfile(profile);
                } catch {
                  /* localStorage unavailable */
                }
              }
              // Auto-select the project created during onboarding and navigate
              if (options?.projectId) {
                setActiveProjectId(options.projectId);
                const action = options.action || '';
                // 510(k) workspace has its own embedded route
                if (action === '510k-workspace') {
                  navigate(`/concept2cure/project/${options.projectId}/510k`);
                } else {
                  const actionToMode: Record<string, LayoutMode> = {
                    work: 'documents',
                    vault: 'vault',
                    apps: 'apps',
                  };
                  setLayoutMode(actionToMode[action] || 'project-home');
                }
              }
            }}
            onSkip={() => {
              setShowFirstRun(false);
              try {
                localStorage.setItem('concept2cure_first_run_complete', 'true');
              } catch {
                /* localStorage unavailable */
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ZenApp;

const SIDEBAR_NAV_TO_LAYOUT = SIDEBAR_NAV_TO_LAYOUT_EXTRACTED;
