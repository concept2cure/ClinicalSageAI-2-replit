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
 * - Lumen Cortex (AI chat)
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
import { useLocation, useRoute } from 'wouter';
import { cn } from '@/lib/utils';
import { ZenSidebar } from './components/sidebar/ZenSidebar';
import { ZenChat } from './components/chat/ZenChat';
import { ZenCommandPalette } from './components/command/ZenCommandPalette';
import { ZenSettings } from './components/settings/ZenSettings';
import {
  ProjectSwitcher,
  NewProjectModal,
  EditProjectModal,
} from './components/projects/ProjectSwitcher';
import { WorkflowTimeline } from './components/workflow';
import { ProjectFilesCompact } from './components/workspace/ProjectFilesCompact';
import { CustomInstructions } from './components/knowledge/CustomInstructions';
import { useProjectKnowledge } from './hooks/useProjectKnowledge';
import { useProjects } from './hooks/useProjects';
import { useCortexThreads, useCortexHealth } from './hooks/useCortex';
import { usePlatformContext } from './hooks/useLicense';
import { useWorkspaceSummary } from './hooks/useWorkspaceSummary';

import { WorkspaceReadinessStrip } from './components/workspace/WorkspaceReadinessStrip';
import { ProjectWorkspaceShell } from './components/workspace/ProjectWorkspaceShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { IndustryMode } from './types/workspace';
import ProductAuditQuestionnaire from '../components/ProductAuditQuestionnaire';
import { isFeatureEnabled } from '@/flags/featureFlags';

// Lazy-load CERV2Page for embedded module rendering inside the shell
const EmbeddedCERV2Page = lazy(() => import('@/pages/csr/CERV2Page'));
import {
  X,
  ChevronLeft,
  Maximize2,
  Minimize2,
  ClipboardList,
  BookOpen,
  BarChart2,
  AlertTriangle,
  CheckSquare,
  Globe,
  Folder,
  ShieldCheck,
  WifiOff,
  Loader2,
  FileText,
  Plus,
  ArrowLeft,
  CircleDot,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Zap,
  ListTodo,
  Calendar,
  TrendingUp,
  Beaker,
  GitBranch,
  Shield,
  Eye,
  FlaskConical,
  Scale,
  Building2,
  Fingerprint,
  Bell,
  Star,
  MessageSquare,
  FolderOpen,
  Upload,
  Sparkles,
  PenLine,
  Layers,
  Download,
  Brain,
  Snowflake,
} from 'lucide-react';

// Utility: instantly redirect dead layout modes to regulatory-workspace
const RedirectToWorkspace: React.FC<{ onRedirect: () => void }> = ({ onRedirect }) => {
  React.useEffect(() => {
    onRedirect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

// Lazy load the Convergent Canvas for the Sherpa System
const ConvergentCanvas = lazy(() =>
  import('./components/canvas/ConvergentCanvas').then(m => ({ default: m.ConvergentCanvas }))
);

// Enablement Center — Dr. Sage + AnA 1.0 dual-AI enablement hub
const EnablementCenter = lazy(() =>
  import('./components/enablement/EnablementCenter')
);

// Dr. Sage Global Layer — persistent help/guide/copilot presence
import DrSageGlobalLayer from './components/dr-sage/DrSagePanel';

// AnA Persistent Panel — always-available AI conversation on every page
import AnaPersistentPanel from './components/chat/AnaPersistentPanel';

// First-run onboarding experience
const FirstRunExperience = lazy(() =>
  import('./components/enablement/FirstRunExperience')
);

// Snow Globe — Cross-platform prediction & intelligence
const SnowGlobeHome = lazy(() =>
  import('./pages/SnowGlobe/SnowGlobeHome')
);
const SnowGlobeChambers = lazy(() =>
  import('./pages/SnowGlobe/SnowGlobeChambers')
);

// Lazy load Phase 7 Mission Control components
const MissionControl = lazy(() =>
  import('./pages/MissionControl').then(m => ({ default: m.MissionControl }))
);
const RulesManager = lazy(() =>
  import('./pages/MissionControl/RulesManager').then(m => ({ default: m.RulesManager }))
);

// Lazy load IND Workspace (eCTD filing hub)
const INDWorkspace = lazy(() =>
  import('./pages/INDWorkspace').then(m => ({ default: m.INDWorkspace }))
);

// IND Workspace Right Rail (section-specific CTD context)
const INDRightRail = lazy(() =>
  import('./components/workspace/INDRightRail').then(m => ({ default: m.INDRightRail }))
);

// Lazy load Phase 15 Submission Operations Command Center
const SubmissionOpsCommandCenter = lazy(() =>
  import('./pages/SubmissionOpsCommandCenter').then(m => ({
    default: m.SubmissionOpsCommandCenter,
  }))
);

// ─── Regulatory module standalones ────────────────────────────────────────────
// Document Editor panel (bridge to UnifiedDocumentEditor + live APIs)
const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then(m => ({ default: m.default }))
);
// eCTD Co-Author (IND / NDA / BLA / 510k document authoring)
const ECTDCoAuthorStandalone = lazy(() =>
  import('./components/coauthor/eCTDCoAuthor').then(m => ({ default: m.ECTDCoAuthorStandalone }))
);

// RI Copilot Intelligence Home (evidence-first landing surface)
const RICopilotHome = lazy(() =>
  import('./components/intelligence/RICopilotHome').then(m => ({
    default: m.RICopilotHome,
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
const RegulatoryIntelligenceFullPanel = lazy(() =>
  import('./components/regulatory/RegulatoryIntelligence').then(m => ({ default: m.default }))
);

// ─── Biotech module standalones (in-shell rendering) ─────────────────────────
// Canonical CMC: ComprehensiveCMCPlatformClean (25k LOC, 102 API endpoints)
// Replaces the thin CMCModule wrapper (735 LOC, 3 API calls) – regression fix
const CMCModuleStandalone = lazy(() => import('@/components/cmc/ComprehensiveCMCPlatformClean'));
const VaultPageStandalone = lazy(() =>
  import('@/pages/vault/VaultPage').then(m => ({ default: m.default }))
);
const StudyArchitectModuleStandalone = lazy(() =>
  import('@/components/studyArchitect/StudyArchitectModule').then(m => ({
    default: m.default,
  }))
);

const TemplateLibraryInline = lazy(() =>
  import('./components/templates/TemplateLibraryInline').then(m => ({ default: m.TemplateLibraryInline }))
);

const ProjectKnowledgePanel = lazy(() =>
  import('./components/workspace/ProjectKnowledgePanel').then(m => ({ default: m.ProjectKnowledgePanel }))
);

// ─── New intent-organized workspace lazy loads ──────────────────────────────
const IntelligenceHub = lazy(() =>
  import('./pages/IntelligenceHub').then(m => ({ default: m.IntelligenceHub }))
);
const ReviewReadiness = lazy(() =>
  import('./pages/ReviewReadiness').then(m => ({ default: m.ReviewReadiness }))
);
const CommandCenterHub = lazy(() =>
  import('./pages/CommandCenterHub').then(m => ({ default: m.CommandCenterHub }))
);

const ClientIntelligencePage = lazy(() => import('./pages/ClientIntelligencePage'));

// Collaboration Hub — threaded collaboration workspace
const CollaborationHubPage = lazy(() =>
  import('./pages/MissionControl/CollaborationHub').then(m => ({ default: m.default }))
);

// Biostatistics Platform — statistical analysis, power calculations, endpoints
const BiostatPlatformDashboard = lazy(() =>
  import('@/components/biostat/BiostatPlatformDashboard')
);

// Training Center — client onboarding, courses, certifications
const TrainingManagementPage = lazy(() =>
  import('@/portal-v2/components/admin/TrainingManagement')
);

// Map panel keys to lazy components
const PANEL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  capa: CAPAManagementPanel,
  pms: PostMarketSurveillancePanel,
  inspection: InspectionReadinessPanel,
  ectd: ECTDNavigatorPanel,
  intelligence: RegulatoryIntelligenceFullPanel,
  'doc-editor': EditorPanel,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ToolPanel =
  | 'ectd'
  | 'protocol'
  | 'sop'
  | 'capa'
  | 'pms'
  | 'inspection'
  | 'intelligence'
  | 'vault'
  | 'doc-editor'
  | null;

type LayoutMode =
  | 'projects'
  | 'workspace'
  | 'assistant'
  | 'sherpa'
  | 'editor'
  | 'analytics'
  | 'timeline'
  | 'audit'
  | 'ctd'
  | 'mission-control'
  | 'rules'
  | 'ind-workspace'
  | 'submission-workspace'
  | 'intelligence-feed'
  | 'gap-analysis'
  | 'change-impact'
  | 'ana-memory'
  | 'artifact-graph'
  | 'review-center'
  | 'dossier-view'
  | 'risk-cockpit'
  | 'route-planner'
  | 'evidence-manager'
  | 'decision-log'
  | 'authority-tracker'
  | 'provenance-trail'
  | 'notifications'
  | 'collaboration-hub'
  | 'program-wizard'
  | 'task-board'
  | 'team-workspace'
  | 'program-analytics'
  | 'medtech-dashboard'
  | 'ectd-coauthor'
  | 'cmc'
  | 'dossier'
  | 'precedent-intelligence'
  | 'regulatory-workspace'
  | 'document-vault'
  | 'clinical-trial'
  | 'snowglobe'
  | 'snowglobe-chambers'
  | 'enablement-center'
  // ── New intent-organized workspaces ──
  | 'author'
  | 'intelligence-hub'
  | 'review-readiness'
  | 'command-center'
  | 'client-intelligence'
  | 'templates'
  | 'biostatistics'
  | 'training-center';

const INDUSTRY_MODES: IndustryMode[] = [
  'biotech',
  'pharma',
  'cro',
  'medtech',
  'academic',
  'regulatory',
  'medical_writing',
];

const normalizeIndustryMode = (value?: string): IndustryMode => {
  if (!value) {
    return 'biotech';
  }

  const normalized = value.toLowerCase().trim() as IndustryMode;
  return INDUSTRY_MODES.includes(normalized) ? normalized : 'biotech';
};

interface UserProfile {
  role?: string;
  objectives?: string[];
  criteria?: string[];
  preferences?: Record<string, string | number | boolean>;
  updatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PANEL CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_PANELS: Record<
  Exclude<ToolPanel, null>,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    component: string; // Component name to lazy load
  }
> = {
  ectd: { title: 'eCTD Navigator', icon: Folder, component: 'ECTDNavigator' },
  protocol: { title: 'Protocol Designer', icon: ClipboardList, component: 'StudyProtocolDesigner' },
  sop: { title: 'SOP Management', icon: BookOpen, component: 'SOPManagement' },
  capa: { title: 'CAPA Management', icon: AlertTriangle, component: 'CAPAManagement' },
  pms: { title: 'Post-Market Surveillance', icon: BarChart2, component: 'PostMarketSurveillance' },
  inspection: {
    title: 'Inspection Readiness',
    icon: CheckSquare,
    component: 'InspectionReadiness',
  },
  intelligence: {
    title: 'Regulatory Intelligence',
    icon: Globe,
    component: 'RegulatoryIntelligence',
  },
  vault: {
    title: 'Document Vault',
    icon: FileText,
    component: 'VaultBrowser',
  },
  'doc-editor': {
    title: 'Document Editor',
    icon: PenLine,
    component: 'EditorPanel',
  },
};

// Helper to get project color by type
function getProjectColor(type: string): string {
  const colors: Record<string, string> = {
    '510K': 'blue',
    IND: 'purple',
    NDA: 'green',
    BLA: 'orange',
    PMA: 'red',
    MAA: 'pink',
    DE_NOVO: 'amber',
    EUA: 'cyan',
  };
  return colors[type] || 'gray';
}

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

  // In a real implementation, we'd lazy-load the actual components
  // For now, render a placeholder that shows the component is ready
  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white border-l border-zinc-200 transition-all duration-200',
        isFullscreen ? 'w-full' : 'w-full sm:w-80 md:w-96 lg:w-[600px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-zinc-600" />
            <span className="font-medium text-zinc-900">{config.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
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
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
              </div>
            }
          >
            {PANEL_COMPONENTS[panel] ? (
              (() => {
                const PanelComponent = PANEL_COMPONENTS[panel];
                return <PanelComponent />;
              })()
            ) : (
              <div className="flex items-center justify-center h-full text-center p-8">
                <div>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 flex items-center justify-center">
                    <Icon className="w-8 h-8 text-zinc-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">{config.title}</h3>
                  <p className="text-sm text-zinc-500 max-w-sm">{config.title} module loading...</p>
                </div>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN APP
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenApp: React.FC = () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // URL-DRIVEN PROJECT IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  const [, navigate] = useLocation();
  const [, routeParams] = useRoute('/concept2cure/project/:projectId/:rest*');
  const [, routeParamsExact] = useRoute('/concept2cure/project/:projectId');
  const urlProjectId = routeParams?.projectId ?? routeParamsExact?.projectId ?? null;

  // ─────────────────────────────────────────────────────────────────────────────
  // EMBEDDED MODULE DETECTION
  // When EMBED_MODULES_IN_SHELL is enabled and URL has /project/:id/510k,
  // render CERV2Page inside the shell frame instead of as a standalone page.
  // ─────────────────────────────────────────────────────────────────────────────
  const urlModuleSegment = (routeParams as Record<string, string> | null)?.['rest*'] ?? null; // e.g. '510k'
  const embedModulesEnabled = isFeatureEnabled('EMBED_MODULES_IN_SHELL');
  const embeddedModule = embedModulesEnabled && urlModuleSegment === '510k' ? '510k' : null;

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
    lastWorkSummary,
    nextTask,
  } = usePlatformContext();

  // Workspace summary — real counts, org, recent activity, next actions
  const { data: workspaceSummary, isLoading: summaryLoading } = useWorkspaceSummary();

  // Projects from database
  const {
    projects: rawProjects,
    createProject: createProjectMutation,
    updateProject: updateProjectMutation,
    deleteProject: deleteProjectMutation,
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
      lastUpdated: p.updatedAt,
      conversationCount: p.conversations?.length ?? 0,
      starred: p.starred ?? false,
      archived: p.archived ?? false,
    }));
  }, [rawProjects]);

  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  // Sidebar — auto-collapse on small screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Modals
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return !localStorage.getItem('concept2cure_first_run_complete');
    } catch { return false; }
  });

  // Tool panels
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
  const [toolPanelFullscreen, setToolPanelFullscreen] = useState(false);

  // Layout mode — initialize from URL when deep-linked into a project
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    urlProjectId ? 'regulatory-workspace' : 'projects'
  );

  // Guard: prevents URL-sync from reverting a navigation that's in-flight
  const navInProgressRef = useRef(false);

  // Right panel tab in workspace mode
  const [workspacePanelTab, setWorkspacePanelTab] = useState<'files' | 'outputs' | 'instructions'>(
    'files'
  );
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);

  const [moduleAssistantOpen, setModuleAssistantOpen] = useState(false);

  // Pending editor content — when a module wants to open the editor with pre-populated content
  const [pendingEditorContent, setPendingEditorContent] = useState<{
    title: string;
    content: string;
    ctdSection?: string;
  } | null>(null);

  // Direct artifact open — when a module has already saved an artifact and wants to open it
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();

  // RI Copilot view: 'intelligence' = evidence-first home, 'editor' = document editing
  const [riViewMode, setRiViewMode] = useState<'intelligence' | 'editor'>(
    urlProjectId ? 'editor' : 'intelligence'
  );

  // Active selection — URL projectId takes precedence
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(
    urlProjectId ?? projects[0]?.id
  );
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

  // Sherpa project detail view state
  const [sherpaDetailProjectId, setSherpaDetailProjectId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string>('all');

  // Task management for the selected project in sherpa mode
  const {
    tasks: projectTasks,
    isLoadingTasks,
    summary: taskSummary,
    createTask,
    updateTask,
    generateMilestones,
    isGenerating: isGeneratingMilestones,
  } = useProjectTasks(sherpaDetailProjectId || activeProjectId);

  // Run log — lightweight action execution transparency
  // NOTE: declared after activeProjectId to avoid TDZ in deps arrays
  const [runLog, setRunLog] = useState<
    Array<{
      id: string;
      intent: string;
      label: string;
      status: 'running' | 'done' | 'failed';
      ts: number;
    }>
  >([]);

  // Load persisted run log from sessionStorage when the active project changes
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

  // Pending draft request from IND Workspace → passed to ZenChat when switching to assistant mode
  const [pendingDraftSection, setPendingDraftSection] = useState<{
    code: string;
    title: string;
  } | null>(null);

  // Project-scoped artifacts for the Outputs tab (must come after activeProjectId is declared)
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
      return Array.isArray(data) ? data : (data?.data ?? data?.artifacts ?? []);
    },
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  // Instructions + knowledge for Instructions tab (lifted so it doesn't remount per tab)
  const workspaceKnowledge = useProjectKnowledge(activeProjectId ?? null);

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
  useEffect(() => {
    if (!activeProjectId) {
      const summaryProject = workspaceSummary?.active?.projectId;
      if (summaryProject) {
        setActiveProjectId(summaryProject);
      } else if (projects.length > 0) {
        setActiveProjectId(projects[0].id);
      }
    }
  }, [projects, activeProjectId, workspaceSummary]);

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

  const handleNewChat = useCallback(() => {
    // Clear active conversation/thread and enter workspace/assistant
    setActiveConversationId(undefined);
    setActiveThreadId(undefined);
    setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'assistant');
    setActiveToolPanel(null);
  }, [activeProjectId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command palette: ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // New chat: ⌘N or Ctrl+N
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }

      // Settings: ⌘,
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }

      // Edit project: ⌘E or Ctrl+E (workspace mode only)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'e' &&
        layoutMode === 'workspace' &&
        activeProjectId
      ) {
        e.preventDefault();
        setEditProjectOpen(true);
      }

      // Close tool panel: Escape
      if (e.key === 'Escape' && activeToolPanel && !commandPaletteOpen && !settingsOpen) {
        setActiveToolPanel(null);
        setToolPanelFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Listen for Mission Control inter-page navigation events
    const handleMcNavigate = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as LayoutMode;
      if (mode) {
        setLayoutMode(mode);
        setActiveToolPanel(null);
      }
    };
    window.addEventListener('mc-navigate', handleMcNavigate);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mc-navigate', handleMcNavigate);
    };
  }, [
    activeToolPanel,
    commandPaletteOpen,
    settingsOpen,
    handleNewChat,
    layoutMode,
    activeProjectId,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(
    (id: string) => {
      // Threads are managed by Cortex - would call deleteThread mutation
      if (activeConversationId === id) {
        setActiveConversationId(undefined);
        setActiveThreadId(undefined);
      }
    },
    [activeConversationId]
  );

  const handleToggleConversationStar = useCallback((id: string) => {
    // Would update thread metadata via Cortex
    console.log('Toggle star for conversation:', id);
  }, []);

  const handleToggleConversationPin = useCallback((id: string) => {
    // Would update thread metadata via Cortex
    console.log('Toggle pin for conversation:', id);
  }, []);

  const handleThreadChange = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setActiveConversationId(threadId);
  }, []);

  const handleCommandAction = useCallback(
    (actionId: string) => {
      console.log('Command action:', actionId);

      // Handle tool panel opens
      if (actionId.startsWith('tool-')) {
        const panel = actionId.replace('tool-', '') as ToolPanel;
        setActiveToolPanel(panel);
        setLayoutMode(panel === 'ectd' ? 'ctd' : 'editor');
        setCommandPaletteOpen(false);
        return;
      }

      // Handle other actions
      switch (actionId) {
        case 'new-chat':
          handleNewChat();
          setCommandPaletteOpen(false);
          break;
        case 'new-510k':
        case 'new-ind':
        case 'new-nda':
        case 'new-bla':
        case 'new-pma':
          setNewProjectOpen(true);
          setCommandPaletteOpen(false);
          break;
        case 'settings-account':
        case 'settings-org':
        case 'settings':
          setSettingsOpen(true);
          setCommandPaletteOpen(false);
          break;
        case 'projects':
          setProjectSwitcherOpen(true);
          setCommandPaletteOpen(false);
          break;
      }
    },
    [handleNewChat]
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
    }) => {
      try {
        await createProjectMutation({
          name: data.name,
          submissionType: data.type as any,
          description: data.description,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
          goal: data.goal,
          conversations: [],
        });
        setNewProjectOpen(false);
      } catch (error) {
        console.error('Failed to create project:', error);
      }
    },
    [createProjectMutation]
  );

  const handleArchiveProject = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        await updateProjectMutation({
          ...project,
          archived: true,
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
        await updateProjectMutation({
          ...project,
          starred: !project.starred,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleEditProject = useCallback(
    async (data: {
      name: string;
      description?: string;
      sponsor?: string;
      product?: string;
      region?: string;
    }) => {
      const project = rawProjects.find(p => p.id === activeProjectId);
      if (project) {
        try {
          await updateProjectMutation({
            ...project,
            name: data.name,
            description: data.description,
            sponsor: data.sponsor,
            product: data.product,
            region: data.region,
          });
        } catch (error) {
          console.error('Failed to update project:', error);
        }
      }
    },
    [activeProjectId, rawProjects, updateProjectMutation]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Dynamic workspace label based on active project's submission type
  const submissionWorkspaceLabel = useMemo(() => {
    const subType = activeProject?.type?.toUpperCase();
    switch (subType) {
      case '510K':
      case '510(K)':
        return '510(k) Filing';
      case 'NDA':
        return 'NDA Filing';
      case 'BLA':
        return 'BLA Filing';
      case 'PMA':
        return 'PMA Filing';
      case 'IND':
      default:
        return 'IND Filing';
    }
  }, [activeProject?.type]);

  const workflowRunId = activeProjectId ? `workflow-run-${activeProjectId}` : 'workflow-run-demo';
  const timelineSteps = useMemo(
    () => [
      {
        id: 'step-intake',
        name: 'Project Intake',
        description: 'Capture submission scope, device metadata, and milestones.',
        status: 'COMPLETED' as const,
        stepType: 'TASK' as const,
        order: 1,
        phaseId: 'phase-intake',
        phaseName: 'Intake',
        assigneeRole: 'RA Lead',
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-authoring',
        name: 'Draft Core Sections',
        description: 'Generate and refine core submission sections.',
        status: 'IN_PROGRESS' as const,
        stepType: 'TASK' as const,
        order: 2,
        phaseId: 'phase-authoring',
        phaseName: 'Authoring',
        assigneeRole: 'Medical Writer',
        startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        slaDueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-review',
        name: 'Regulatory Review',
        description: 'QA and regulatory approval of drafted sections.',
        status: 'READY' as const,
        stepType: 'APPROVAL' as const,
        order: 3,
        phaseId: 'phase-review',
        phaseName: 'Review',
        assigneeRole: 'QA Manager',
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-export',
        name: 'Submission Export',
        description: 'Generate finalized eCTD package for submission.',
        status: 'PENDING' as const,
        stepType: 'EXPORT' as const,
        order: 4,
        phaseId: 'phase-export',
        phaseName: 'Submission',
        assigneeRole: 'Project Manager',
        isRequired: true,
      },
    ],
    []
  );

  const userRole = userProfile?.role || 'Regulatory Lead';
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

  useEffect(() => {
    const loadProfile = () => {
      try {
        const savedProfile = localStorage.getItem('concept2cure_user_profile');
        if (savedProfile) {
          setUserProfile(JSON.parse(savedProfile));
        }
      } catch (error) {
        console.warn('Unable to load user profile', error);
      }
    };

    loadProfile();

    const onStorage = (event: Event) => {
      const storageEvent = event as { key?: string };
      if (storageEvent.key === 'concept2cure_user_profile') {
        loadProfile();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Workspace header — shared nav bar for non-chat modules ─────────────────
  const WorkspaceHeader = ({
    title,
    subtitle,
    icon,
    onBack,
    backLabel,
  }: {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onBack: () => void;
    backLabel?: string;
  }) => (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>{backLabel || 'Back'}</span>
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {icon && <span className="text-zinc-400">{icon}</span>}
      <span className="text-sm font-medium text-zinc-900">{title}</span>
      {subtitle && <span className="text-xs text-zinc-400 ml-1 hidden sm:inline">{subtitle}</span>}
    </div>
  );

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
          --zen-accent: #2563EB;
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
          (
            {
              'regulatory-workspace': 'ai-copilot',
              'ind-workspace': 'author',
              'ectd-coauthor': 'author',
              cmc: 'author',
              'clinical-trial': 'author',
              author: 'author',
              'intelligence-hub': 'intelligence-hub',
              'review-readiness': 'review-readiness',
              snowglobe: 'review-readiness',
              'snowglobe-chambers': 'review-readiness',
              'command-center': 'command-center',
              'mission-control': 'command-center',
              'submission-workspace': 'command-center',
              'document-vault': 'command-center',
              'enablement-center': 'enablement-center',
              'client-intelligence': 'client-intelligence',
              'collaboration-hub': 'collaboration-hub',
              'biostatistics': 'biostatistics',
              'training-center': 'training-center',
            } as Record<string, string>
          )[layoutMode] ?? undefined
        }
        onSelectConversation={id => {
          setActiveConversationId(id);
          setActiveThreadId(id);
        }}
        onNewChat={handleNewChat}
        onOpenProjects={() => setProjectSwitcherOpen(true)}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onDeleteConversation={handleDeleteConversation}
        onToggleStar={handleToggleConversationStar}
        onTogglePin={handleToggleConversationPin}
        industryMode={industryMode}
        onNavigate={id => {
          switch (id) {
            case 'home':
              setLayoutMode('projects');
              break;
            case 'projects':
              setLayoutMode('projects');
              break;
            case 'tools':
              setActiveToolPanel('intelligence');
              break;
            case 'agents':
              setLayoutMode('assistant');
              break;
            case 'tasks':
              setLayoutMode('timeline');
              break;
            case 'templates':
              setActiveToolPanel('protocol');
              break;
            case 'analytics':
              setLayoutMode('analytics');
              break;
            // ── Product routes ──────────────────────────────────
            case 'ai-copilot':
              setRiViewMode('intelligence');
              setLayoutMode('regulatory-workspace');
              break;
            case '510k-workspace':
              if (embeddedModule !== null || !isFeatureEnabled('EMBED_MODULES_IN_SHELL')) {
                window.location.href = '/cerv2';
              } else if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/510k`);
              } else {
                // No project selected — go to projects list
                setLayoutMode('projects');
              }
              break;
            case 'cer-generator':
              window.location.href = '/cerv2?mode=cer';
              break;
            case 'document-vault':
              setLayoutMode('document-vault');
              break;
            case 'evidence-search':
              setCommandPaletteOpen(true);
              break;
            case 'ectd-coauthor':
              setLayoutMode('ectd-coauthor');
              break;
            case 'ind-workspace':
              setLayoutMode('ind-workspace');
              break;
            case 'cmc':
              setLayoutMode('cmc');
              break;
            case 'clinical-trial':
              setLayoutMode('clinical-trial');
              break;
            case 'regulatory-workspace':
              setLayoutMode('regulatory-workspace');
              break;
            case 'mission-control':
              setLayoutMode('mission-control');
              break;
            case 'submission-workspace':
              setLayoutMode('submission-workspace');
              break;
            case 'enablement-center':
              setLayoutMode('enablement-center');
              break;
            // ── New intent-organized workspaces ──
            case 'author':
              setLayoutMode('author');
              break;
            case 'intelligence-hub':
              setLayoutMode('intelligence-hub');
              break;
            case 'review-readiness':
              setLayoutMode('review-readiness');
              break;
            case 'command-center':
              setLayoutMode('command-center');
              break;
            case 'client-intelligence':
              setLayoutMode('client-intelligence');
              break;
            case 'collaboration-hub':
              setLayoutMode('collaboration-hub');
              break;
            case 'biostatistics':
              setLayoutMode('biostatistics');
              break;
            case 'training-center':
              setLayoutMode('training-center');
              break;
            default:
              break;
          }
        }}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Main area — no top bar, exactly like Claude.ai */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Content Area */}
        <div className="flex-1 flex min-w-0 min-h-0">
          {/* ── Embedded Module Host ── */}
          {embeddedModule === '510k' && urlProjectId && (
            <>
              {/* Module content area */}
              <div
                className={cn(
                  'flex-1 flex flex-col min-h-0 overflow-hidden transition-all duration-200',
                  moduleAssistantOpen && 'mr-0'
                )}
              >
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                          <p className="text-zinc-500">Loading 510(k) Module...</p>
                        </div>
                      </div>
                    }
                  >
                    <EmbeddedCERV2Page
                      embedded={true}
                      projectId={urlProjectId}
                      onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>

              {/* Assistant toggle button (fixed right edge) */}
              {!moduleAssistantOpen && (
                <button
                  onClick={() => setModuleAssistantOpen(true)}
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-zinc-50 hover:bg-zinc-100 border-l border-zinc-200 transition-colors"
                  title="Open AI Assistant"
                  data-testid="module-assistant-toggle"
                >
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  <span
                    className="text-[10px] text-zinc-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {/* Collapsible assistant drawer */}
              {moduleAssistantOpen && (
                <div
                  className="flex-shrink-0 w-[380px] flex flex-col border-l border-zinc-200 bg-white"
                  data-testid="module-assistant-panel"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50">
                    <span className="text-sm font-medium text-zinc-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ZenChat
                      projectId={activeProjectId || urlProjectId}
                      projectName={activeProject?.name}
                      submissionType={activeProject?.type || '510K'}
                      threadId={activeThreadId}
                      greeting="How can I help with your 510(k) submission?"
                      onNavigate={() => {}}
                      onNewProject={() => {}}
                      onThreadChange={handleThreadChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Sherpa Mode - Convergent Canvas */}
          {!embeddedModule && layoutMode === 'sherpa' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-sherpa"
            >
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Sherpa System...</p>
                      </div>
                    </div>
                  }
                >
                  <ConvergentCanvas
                    userId={activeProjectId || 'anonymous'}
                    userName={userName}
                    userRole={userRole}
                    industry={industryMode}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {!embeddedModule && layoutMode === 'analytics' && (
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-8 bg-white">
              <div className="max-w-md text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center">
                  <BarChart2 className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900">Analytics</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-6">
                  Portfolio analytics and risk dashboards are being built. Check back soon.
                </p>
                <button
                  onClick={() => setLayoutMode('assistant')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Chat
                </button>
              </div>
            </div>
          )}

          {!embeddedModule && layoutMode === 'timeline' && (
            <div className="flex-1 p-8 bg-white overflow-y-auto">
              <div className="max-w-3xl mx-auto">
                <WorkflowTimeline
                  steps={timelineSteps}
                  currentStepId="step-authoring"
                  progressPercent={50}
                  assetState="REVIEW"
                  workflowRunId={workflowRunId}
                  showPhases
                />
              </div>
            </div>
          )}

          {!embeddedModule && layoutMode === 'audit' && (
            <div className="flex-1 overflow-y-auto bg-zinc-50" data-testid="workspace-audit">
              <ProductAuditQuestionnaire />
            </div>
          )}

          {/* Phase 7: Mission Control Dashboard */}
          {!embeddedModule && layoutMode === 'mission-control' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-mission-control"
            >
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Mission Control...</p>
                      </div>
                    </div>
                  }
                >
                  <MissionControl />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Snow Globe — Prediction & Intelligence Engine */}
          {!embeddedModule && layoutMode === 'snowglobe' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" data-testid="workspace-snowglobe">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-white"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" /></div>}>
                <SnowGlobeHome programId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {/* Snow Globe — Chamber Detail View */}
          {!embeddedModule && layoutMode === 'snowglobe-chambers' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" data-testid="workspace-snowglobe-chambers">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-white"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" /></div>}>
                <SnowGlobeChambers programId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {/* ── IND Workspace (eCTD filing hub — dossier construction) ──────────── */}
          {!embeddedModule && layoutMode === 'ind-workspace' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ind">
              <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('assistant')}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Chat</span>
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                <ShieldCheck className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium text-zinc-900">
                  {submissionWorkspaceLabel} — Dossier Construction
                </span>
                <span className="text-xs text-zinc-400 ml-1 hidden sm:inline">
                  CTD sections · Status tracking · eCTD compile
                </span>
              </div>
              {/* No-project guard */}
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-violet-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">IND Workspace</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to open its dossier and begin drafting CTD sections.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex min-h-0">
                  {/* Main area: IND section tree */}
                  <div className="flex-1 overflow-auto">
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <div className="flex-1 flex items-center justify-center bg-white h-full">
                            <div className="text-center">
                              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                              <p className="text-zinc-500">Loading IND Workspace...</p>
                            </div>
                          </div>
                        }
                      >
                        <INDWorkspace
                          projectId={activeProjectId}
                          projectName={activeProject?.name || 'Untitled Project'}
                          submissionType={activeProject?.type || 'IND'}
                          onOpenSection={sectionCode => {
                            const ctd = sectionCode.replace(/^m/, '');
                            setPendingEditorContent({
                              content: `<h1>${sectionCode.toUpperCase()} — Draft</h1><p>Section content for ${activeProject?.name || 'IND Application'}.</p>`,
                              title: `${sectionCode.toUpperCase()} — ${activeProject?.name || 'IND Application'}`,
                              ctdSection: ctd,
                            });
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                          onDraftWithAI={(sectionCode, sectionTitle) => {
                            const ctd = sectionCode.replace(/^m/, '');
                            setPendingEditorContent({
                              content: `<h1>${sectionTitle}</h1>\n<h2>Project: ${activeProject?.name || 'Untitled'} (${activeProject?.type || 'IND'})</h2>\n<p><strong>CTD Section:</strong> ${ctd}</p>\n<p><strong>Generated:</strong> ${new Date().toISOString().split('T')[0]}</p>\n<hr/>\n<h2>Section Content</h2>\n<p>[AI-assisted draft for ${sectionTitle}. This section should comply with ICH M4 guidelines and 21 CFR 312.23(a) requirements.]</p>`,
                              title: `${sectionTitle} — ${activeProject?.name || 'IND Application'}`,
                              ctdSection: ctd,
                            });
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                          onNavigateToCoAuthor={() => setLayoutMode('ectd-coauthor')}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                  {/* Right rail: Section context tabs */}
                  <INDRightRail
                    projectName={activeProject?.name}
                    submissionType={activeProject?.type}
                    indication={activeProject?.description}
                  />
                </div>
              )}
            </div>
          )}

          {/* Medical Device Dashboard — disabled (consolidated into RI Copilot workspace) */}

          {/* ── eCTD Co-Author (IND / NDA / BLA / 510k authoring) ─────────── */}
          {!embeddedModule && layoutMode === 'ectd-coauthor' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ectd-coauthor">
              <WorkspaceHeader
                title="eCTD Co-Author"
                subtitle="IND · NDA · BLA · 510(k) · CTD section-by-section drafting"
                onBack={() => setLayoutMode('assistant')}
              />
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <FolderOpen className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">eCTD Co-Author</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to begin authoring CTD sections.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div className="flex-1 flex items-center justify-center bg-white">
                          <div className="text-center">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                            <p className="text-zinc-500">Loading eCTD Co-Author...</p>
                          </div>
                        </div>
                      }
                    >
                      <ECTDCoAuthorStandalone
                        onOpenInEditor={section => {
                          console.log(
                            `[eCTD] Opening section ${section.number} "${section.title}" in Document Editor`
                          );
                          // Build populated content from the section
                          const sectionContent =
                            section.content && section.content.trim()
                              ? section.content
                              : `<h1>${section.number} ${section.title}</h1>
<p>This section covers the regulatory requirements for <strong>${section.title}</strong> as part of the CTD submission.</p>
<h2>Scope</h2>
<p>[Section content to be drafted. Use the RI Edit tools above to generate regulatory-compliant language.]</p>
<h2>References</h2>
<p>[Cross-references and source citations will be added here.]</p>`;
                          setPendingEditorContent({
                            title: `${section.number} ${section.title}`,
                            content: sectionContent,
                            ctdSection: section.number,
                          });
                          setRiViewMode('editor');
                          setLayoutMode('regulatory-workspace');
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          )}

          {/* ── CMC Platform (in-shell) ────────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'cmc' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-cmc">
              <WorkspaceHeader
                title="CMC Platform"
                subtitle="Chemistry, Manufacturing & Controls · Drug Substance · Drug Product · Analytical Methods"
                onBack={() => setLayoutMode('assistant')}
              />
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-teal-50 flex items-center justify-center">
                      <FolderOpen className="w-8 h-8 text-teal-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">CMC Platform</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to access Chemistry, Manufacturing & Controls modules.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Module 3 traceability bar */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 bg-zinc-50 flex-shrink-0">
                    <span className="text-xs text-zinc-500 mr-2">Module 3 Actions:</span>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.S — Drug Substance</h1>
<p>CTD Section 3.2.S for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.S.1 General Information</h2><p></p>
<h2>3.2.S.2 Manufacture</h2><p></p>
<h2>3.2.S.3 Characterisation</h2><p></p>
<h2>3.2.S.4 Control of Drug Substance</h2><p></p>
<h2>3.2.S.5 Reference Standards</h2><p></p>
<h2>3.2.S.6 Container Closure System</h2><p></p>
<h2>3.2.S.7 Stability</h2><p></p>`,
                          title: `Module 3.2.S — ${activeProject?.name || 'Drug Substance'}`,
                          ctdSection: '3.2.S',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                    >
                      Draft 3.2.S (Drug Substance)
                    </button>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.P — Drug Product</h1>
<p>CTD Section 3.2.P for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.P.1 Description and Composition</h2><p></p>
<h2>3.2.P.2 Pharmaceutical Development</h2><p></p>
<h2>3.2.P.3 Manufacture</h2><p></p>
<h2>3.2.P.4 Control of Excipients</h2><p></p>
<h2>3.2.P.5 Control of Drug Product</h2><p></p>
<h2>3.2.P.6 Reference Standards</h2><p></p>
<h2>3.2.P.7 Container Closure System</h2><p></p>
<h2>3.2.P.8 Stability</h2><p></p>`,
                          title: `Module 3.2.P — ${activeProject?.name || 'Drug Product'}`,
                          ctdSection: '3.2.P',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                    >
                      Draft 3.2.P (Drug Product)
                    </button>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.A — Appendices</h1>
<p>CTD Appendices for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.A.1 Facilities and Equipment</h2><p></p>
<h2>3.2.A.2 Adventitious Agents Safety Evaluation</h2><p></p>
<h2>3.2.A.3 Novel Excipients</h2><p></p>`,
                          title: `Module 3.2.A — ${activeProject?.name || 'Appendices'}`,
                          ctdSection: '3.2.A',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                    >
                      Draft 3.2.A (Appendices)
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <div className="flex-1 flex items-center justify-center bg-white h-full">
                            <div className="text-center">
                              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                              <p className="text-zinc-500">Loading CMC Platform...</p>
                            </div>
                          </div>
                        }
                      >
                        <CMCModuleStandalone
                          onDocumentCreated={({ artifactId }: { artifactId: string }) => {
                            setOpenArtifactId(artifactId);
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Document Vault (in-shell) ──────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'document-vault' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-document-vault">
              <WorkspaceHeader
                title="Document Vault"
                subtitle="Field-ready document control · Compliance · Audit trails"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white h-full">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                          <p className="text-zinc-500">Loading Document Vault...</p>
                        </div>
                      </div>
                    }
                  >
                    <VaultPageStandalone />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Clinical Trial Hub (in-shell) ──────────────────────────────── */}
          {!embeddedModule && layoutMode === 'clinical-trial' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-clinical-trial">
              <WorkspaceHeader
                title="Clinical Trial Hub"
                subtitle="Study design · Protocol optimization · CSR intelligence · Trial management"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white h-full">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                          <p className="text-zinc-500">Loading Clinical Trial Hub...</p>
                        </div>
                      </div>
                    }
                  >
                    <StudyArchitectModuleStandalone />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Templates Library — browse and use regulatory templates ── */}
          {!embeddedModule && layoutMode === 'templates' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-templates">
              <WorkspaceHeader
                title="Template Library"
                subtitle="Browse, search, and use regulatory document templates for your submission type"
                onBack={() => setLayoutMode('author')}
              />
              <div className="flex-1 overflow-auto p-6">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                      </div>
                    }
                  >
                    <TemplateLibraryInline
                      projectId={activeProjectId}
                      onUseTemplate={(ctdSection) => {
                        if (ctdSection) {
                          setPendingEditorContent({
                            content: `<h1>${ctdSection.toUpperCase()} — Draft</h1><p>Template content for ${activeProject?.name || 'Application'}.</p>`,
                            title: `${ctdSection.toUpperCase()} — ${activeProject?.name || 'Application'}`,
                            ctdSection: ctdSection.replace(/^m/, ''),
                          });
                        }
                        setLayoutMode('ectd-coauthor');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* Dossier Navigator — disabled (consolidated into IND Workspace) */}

          {/* ── Submission Operations Workspace (split-pane: list | inspector) ── */}
          {!embeddedModule && layoutMode === 'submission-workspace' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-submission-ops">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('regulatory-workspace')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Workspace</span>
                </button>
                <span className="text-zinc-200">·</span>
                <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-800">
                  {submissionWorkspaceLabel} — Submission Ops
                </span>
              </div>
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/30 p-8">
                  <div className="max-w-md text-center">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-violet-400" />
                    <h2 className="text-lg font-semibold text-zinc-900 mb-2">
                      Submission Operations
                    </h2>
                    <p className="text-sm text-zinc-500 mb-4">
                      Select a project to view its submission readiness and blockers.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                    >
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                      </div>
                    }
                  >
                    <SubmissionOpsCommandCenter
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      onNavigateToArtifact={artifactId => {
                        setLayoutMode('regulatory-workspace');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          )}

          {/* ── Enablement Center — Dr. Sage + AnA 1.0 dual-AI hub ── */}
          {!embeddedModule && layoutMode === 'enablement-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-enablement-center">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                        <p className="text-sm text-zinc-500">Loading Enablement Center...</p>
                      </div>
                    </div>
                  }
                >
                  <EnablementCenter
                    onClose={() => setLayoutMode('regulatory-workspace')}
                    contextProfile={{
                      productType: activeProject?.type,
                      userRole: userRole,
                      clientType: industryMode,
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Author Workspace — unified submission authoring ── */}
          {!embeddedModule && layoutMode === 'author' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-author">
              {/* Author workspace routes to IND/eCTD/CMC/Clinical based on context */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Projects</span>
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                <PenLine className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-900">Author</span>
                {activeProject && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <div className="flex items-center rounded-md border border-zinc-200 overflow-hidden">
                    {[
                      { key: 'ind-workspace', label: 'Dossier' },
                      { key: 'ectd-coauthor', label: 'Co-Author' },
                      { key: 'cmc', label: 'CMC' },
                      { key: 'clinical-trial', label: 'Clinical' },
                      { key: 'templates', label: 'Templates' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setLayoutMode(tab.key as LayoutMode)}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-medium transition-colors',
                          layoutMode === tab.key
                            ? 'bg-zinc-100 text-zinc-900'
                            : 'text-zinc-500 hover:bg-zinc-50'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Default: show IND workspace */}
              <div className="flex-1 flex min-h-0 overflow-auto">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                      </div>
                    }
                  >
                    <INDWorkspace
                      projectId={activeProjectId}
                      projectName={activeProject?.name || 'Untitled Project'}
                      submissionType={activeProject?.type || 'IND'}
                      onOpenSection={sectionCode => {
                        setPendingEditorContent({
                          content: `<h1>${sectionCode.toUpperCase()} — Draft</h1><p>Section content for ${activeProject?.name || 'Application'}.</p>`,
                          title: `${sectionCode.toUpperCase()} — ${activeProject?.name || 'Application'}`,
                          ctdSection: sectionCode.replace(/^m/, ''),
                        });
                        setLayoutMode('ectd-coauthor');
                      }}
                      onDraftWithAI={sectionCode => {
                        setLayoutMode('ectd-coauthor');
                      }}
                      onNavigateToCoAuthor={() => setLayoutMode('ectd-coauthor')}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Intelligence Hub — research, evidence, predictions ── */}
          {!embeddedModule && layoutMode === 'intelligence-hub' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-intelligence-hub">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <IntelligenceHub onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Review & Readiness — quality, compliance, stress-testing ── */}
          {!embeddedModule && layoutMode === 'review-readiness' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-review-readiness">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <ReviewReadiness onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Command Center — operations, submissions, governance ── */}
          {!embeddedModule && layoutMode === 'command-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-command-center">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <CommandCenterHub onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Client Intelligence — company persona, document ingestion, memory ── */}
          {!embeddedModule && layoutMode === 'client-intelligence' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-client-intelligence">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <ClientIntelligencePage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Collaboration Hub — threaded collaboration, reviews, decisions ── */}
          {!embeddedModule && layoutMode === 'collaboration-hub' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-collaboration-hub">
              {/* Workspace header — breadcrumb pattern */}
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Projects</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Collaboration</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <CollaborationHubPage programId={activeProjectId ? Number(activeProjectId) : null} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Biostatistics Platform — power, endpoints, design ── */}
          {!embeddedModule && layoutMode === 'biostatistics' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-biostatistics">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Projects</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-zinc-800">Biostatistics</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <BiostatPlatformDashboard />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Training Center — onboarding, courses, guides ── */}
          {!embeddedModule && layoutMode === 'training-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-training-center">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Projects</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-800">Training Center</span>
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <TrainingManagementPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Precedent Intelligence — disabled (consolidated into Intelligence Hub) */}

          {/* Redirect deprecated routes to unified workspace */}
          {['workspace', 'medtech-dashboard', 'dossier', 'precedent-intelligence'].includes(
            layoutMode
          ) && <RedirectToWorkspace onRedirect={() => setLayoutMode('regulatory-workspace')} />}

          {/* ── Project Workspace (3-pane: tree | content | inspector) ───── */}
          {!embeddedModule &&
            layoutMode === 'regulatory-workspace' &&
            (riViewMode === 'intelligence' ? (
              <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ri-copilot">
                {/* Intelligence mode header */}
                <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                  <button
                    onClick={() => setLayoutMode('projects')}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Projects</span>
                  </button>
                  <span className="text-zinc-200">·</span>
                  <Brain className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-zinc-800">RI Copilot</span>
                  {activeProject && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                      {activeProject.name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-md border border-zinc-200 overflow-hidden">
                      <button
                        data-testid="view-toggle-intelligence"
                        onClick={() => setRiViewMode('intelligence')}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium transition-colors',
                          'bg-blue-100 text-blue-700'
                        )}
                      >
                        Intelligence
                      </button>
                      <button
                        data-testid="view-toggle-editor"
                        onClick={() => setRiViewMode('editor')}
                        className="px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors"
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
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
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
                      onSelectProject={() => setProjectSwitcherOpen(true)}
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
                onSelectProject={() => setProjectSwitcherOpen(true)}
                onSwitchToIntelligence={() => setRiViewMode('intelligence')}
                initialContent={pendingEditorContent?.content}
                initialTitle={pendingEditorContent?.title}
                initialCtdSection={pendingEditorContent?.ctdSection}
                onInitialContentConsumed={() => setPendingEditorContent(null)}
                openArtifactId={openArtifactId}
                onOpenArtifactConsumed={() => setOpenArtifactId(undefined)}
              />
            ))}
          {/* Rules Engine Manager */}
          {!embeddedModule && layoutMode === 'rules' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-rules"
            >
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Rules Engine...</p>
                      </div>
                    </div>
                  }
                >
                  <RulesManager onBack={() => setLayoutMode('mission-control')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Projects Index ─────────────────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'projects' && (
            <div className="flex-1 overflow-y-auto zen-scroll bg-zinc-50/30">
              <div className="max-w-4xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h1 className="text-2xl font-semibold text-zinc-900">
                      {workspaceSummary?.org?.name || 'Projects'}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                      {projects.filter(p => !p.archived).length} active project
                      {projects.filter(p => !p.archived).length !== 1 ? 's' : ''}
                      {workspaceSummary?.counts?.documents
                        ? ` · ${workspaceSummary.counts.documents} documents`
                        : ''}
                      {workspaceSummary?.counts?.threads
                        ? ` · ${workspaceSummary.counts.threads} conversations`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setNewProjectOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Project
                  </button>
                </div>

                {/* Project list */}
                {projects.filter(p => !p.archived).length > 0 ? (
                  <div className="border border-zinc-200 rounded-lg overflow-hidden mb-10 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50/60">
                          <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider">
                            Project
                          </th>
                          <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                            Chats
                          </th>
                          <th className="px-4 py-2 font-medium text-zinc-500 text-xs uppercase tracking-wider hidden sm:table-cell text-right">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {projects
                          .filter(p => !p.archived)
                          .map(project => {
                            const dotColor: Record<string, string> = {
                              '510K': 'bg-blue-500',
                              IND: 'bg-violet-500',
                              NDA: 'bg-emerald-500',
                              BLA: 'bg-teal-500',
                              PMA: 'bg-orange-500',
                              CER: 'bg-pink-500',
                              MAA: 'bg-indigo-500',
                            };
                            return (
                              <tr
                                key={project.id}
                                data-testid={`project-row-${project.id}`}
                                onClick={() => {
                                  navInProgressRef.current = true;
                                  setActiveProjectId(project.id);
                                  setRiViewMode('editor');
                                  setLayoutMode('regulatory-workspace');
                                  navigate(`/concept2cure/project/${project.id}`);
                                }}
                                className="cursor-pointer hover:bg-zinc-50 transition-colors"
                              >
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                                    <span
                                      className={cn(
                                        'w-1.5 h-1.5 rounded-full',
                                        dotColor[project.type] ?? 'bg-zinc-400'
                                      )}
                                    />
                                    {project.type}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="font-medium text-zinc-900">{project.name}</span>
                                  {project.starred && (
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400 inline ml-1.5 -mt-0.5" />
                                  )}
                                  {project.description && (
                                    <span className="block text-xs text-zinc-400 truncate max-w-md">
                                      {project.description}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-400 hidden sm:table-cell">
                                  {project.conversationCount}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-400 text-right hidden sm:table-cell">
                                  {project.lastUpdated
                                    ? new Date(project.lastUpdated).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : '—'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="border border-dashed border-zinc-300 bg-white px-6 py-8 text-center mb-10 rounded-lg">
                    <FolderOpen className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
                    <p className="text-sm text-zinc-600 mb-3">No projects yet</p>
                    <button
                      onClick={() => setNewProjectOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create first project
                    </button>
                  </div>
                )}

                {/* Recent activity row */}
                {(workspaceSummary?.recent?.artifacts?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Recent Artifacts
                    </h2>
                    <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden bg-white">
                      {workspaceSummary!.recent.artifacts!.slice(0, 4).map((a: any) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-zinc-900 truncate flex-1">
                            {a.title || a.type}
                          </span>
                          <span className="text-xs text-zinc-400 flex-shrink-0">
                            {a.type} · {a.status} ·{' '}
                            {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent threads */}
                {(workspaceSummary?.recent?.threads?.length ?? 0) > 0 && (
                  <div className="mt-8">
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Recent Conversations
                    </h2>
                    <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden bg-white">
                      {workspaceSummary!.recent.threads!.slice(0, 5).map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setActiveThreadId(t.id);
                            setLayoutMode('regulatory-workspace');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-50 transition-colors"
                        >
                          <MessageSquare className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                          <span className="text-sm text-zinc-700 truncate">{t.title}</span>
                          <span className="ml-auto text-xs text-zinc-400 flex-shrink-0">
                            {t.updatedAt
                              ? new Date(t.updatedAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Project Workspace — entered by clicking a project card ──────── */}
          {!embeddedModule && layoutMode === 'workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ── Project Header Strip (two-line) ────────────────────── */}
              <div className="flex-shrink-0 border-b border-zinc-100 bg-white px-4 py-2">
                {/* Row 1: nav + name + type + panel toggles */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLayoutMode('projects')}
                    className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition-colors text-xs mr-1 flex-shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Projects</span>
                  </button>
                  <div className="w-px h-4 bg-zinc-200 flex-shrink-0" />

                  {/* Type badge */}
                  {activeProject &&
                    (() => {
                      const typeColors: Record<string, { bg: string; text: string }> = {
                        '510K': { bg: 'bg-blue-50', text: 'text-blue-700' },
                        IND: { bg: 'bg-violet-50', text: 'text-violet-700' },
                        NDA: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
                        BLA: { bg: 'bg-teal-50', text: 'text-teal-700' },
                        PMA: { bg: 'bg-orange-50', text: 'text-orange-700' },
                        CER: { bg: 'bg-pink-50', text: 'text-pink-700' },
                        MAA: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
                      };
                      const tc = typeColors[activeProject.type] ?? {
                        bg: 'bg-zinc-50',
                        text: 'text-zinc-600',
                      };
                      return (
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex-shrink-0',
                            tc.bg,
                            tc.text
                          )}
                        >
                          {activeProject.type}
                        </span>
                      );
                    })()}

                  {/* Project name */}
                  <h2 className="font-semibold text-zinc-900 text-sm truncate min-w-0 flex-1">
                    {activeProject?.name || 'Untitled Project'}
                  </h2>

                  {/* Edit project button */}
                  {activeProject && (
                    <button
                      onClick={() => setEditProjectOpen(true)}
                      title="Edit project metadata"
                      className="flex-shrink-0 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                    {(['files', 'outputs', 'instructions'] as const).map(tab => {
                      const cfg = {
                        files: { icon: Upload, label: 'Files', active: 'bg-blue-50 text-blue-700' },
                        outputs: {
                          icon: Layers,
                          label: 'Outputs',
                          active: 'bg-violet-50 text-violet-700',
                        },
                        instructions: {
                          icon: PenLine,
                          label: 'Instructions',
                          active: 'bg-amber-50 text-amber-700',
                        },
                      }[tab];
                      const Icon = cfg.icon;
                      const isActive = workspacePanelOpen && workspacePanelTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => {
                            if (isActive) {
                              setWorkspacePanelOpen(false);
                            } else {
                              setWorkspacePanelTab(tab);
                              setWorkspacePanelOpen(true);
                            }
                          }}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                            isActive
                              ? cfg.active
                              : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          <span className="hidden sm:inline">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 2: sponsor · product · region (only when present) */}
                {(activeProject?.sponsor || activeProject?.product || activeProject?.region) && (
                  <div className="flex items-center gap-1.5 mt-0.5 pl-[calc(3.5rem)] text-xs text-zinc-400">
                    {[activeProject?.sponsor, activeProject?.product]
                      .filter(Boolean)
                      .map((v, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-zinc-200">·</span>}
                          <span className="truncate max-w-[140px]">{v}</span>
                        </React.Fragment>
                      ))}
                    {activeProject?.region && (
                      <span className="ml-0.5 inline-flex items-center px-1.5 py-0 rounded border border-zinc-200 text-zinc-400 bg-zinc-50 text-[10px]">
                        {activeProject.region}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Workspace body: chat center + right panel ───────────── */}
              <div className="flex-1 flex min-h-0">
                {/* Center: ZenChat */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                  <ZenChat
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    submissionType={activeProject?.type}
                    threadId={activeThreadId}
                    greeting={platformGreeting}
                    lastWork={lastWorkSummary}
                    nextTask={
                      nextTask
                        ? {
                            taskTitle: nextTask.taskTitle,
                            taskDescription: nextTask.taskDescription,
                          }
                        : null
                    }
                    suggestedActions={(() => {
                      const t = (activeProject?.type || 'IND').toUpperCase();
                      const base = workspaceSummary?.nextActions ?? [];
                      if (base.length > 0) return base.slice(0, 4);

                      // Determine project state for smart ordering
                      const hasFiles = (workspaceKnowledge.knowledge?.documents?.length ?? 0) > 0;
                      const hasOutputs =
                        projectArtifacts.length > 0 ||
                        (workspaceSummary?.recent?.artifacts?.length ?? 0) > 0;

                      const starters: Record<
                        string,
                        Array<{ id: string; label: string; intent: string; description: string }>
                      > = {
                        '510K': [
                          {
                            id: 'upload-device-docs',
                            label: 'Upload device documents',
                            intent: 'upload-source-documents',
                            description: 'Add device specs, test results, and labeling.',
                          },
                          {
                            id: 'find-predicates',
                            label: 'Find likely predicates',
                            intent: 'find-likely-510k-predicates',
                            description: 'Search FDA for substantially equivalent devices.',
                          },
                          {
                            id: 'draft-device-desc',
                            label: 'Draft device description',
                            intent: 'draft-510k-device-description',
                            description: 'Generate Section 3 device description.',
                          },
                          {
                            id: 'check-estar',
                            label: 'Check eSTAR readiness',
                            intent: 'check-estar-readiness',
                            description: 'Review eSTAR template requirements.',
                          },
                        ],
                        IND: [
                          {
                            id: 'upload-source',
                            label: 'Upload source documents',
                            intent: 'upload-source-documents',
                            description: 'Add CSRs, CMC data, and preclinical files.',
                          },
                          {
                            id: 'draft-ind-outline',
                            label: 'Draft IND outline',
                            intent: 'draft-ind-outline',
                            description: 'Generate IND outline per 21 CFR 312.23.',
                          },
                          {
                            id: 'missing-sections',
                            label: 'Identify missing sections',
                            intent: 'identify-missing-ind-sections',
                            description: 'Audit your IND for incomplete sections.',
                          },
                          {
                            id: 'gen-cmc-workplan',
                            label: 'Generate CMC workplan',
                            intent: 'generate-cmc-workplan',
                            description: 'Build Module 3 CMC workplan and timeline.',
                          },
                        ],
                        CER: [
                          {
                            id: 'upload-evidence',
                            label: 'Upload evidence & literature',
                            intent: 'upload-source-documents',
                            description: 'Add clinical literature and PMS data.',
                          },
                          {
                            id: 'build-cer-outline',
                            label: 'Build CER outline',
                            intent: 'build-cer-outline',
                            description: 'Structure CER sections per MEDDEV 2.7/1 Rev 4.',
                          },
                          {
                            id: 'draft-benefit-risk',
                            label: 'Draft benefit-risk section',
                            intent: 'draft-cer-benefit-risk',
                            description: 'Generate the benefit-risk analysis.',
                          },
                          {
                            id: 'review-pms-pmcf',
                            label: 'Review PMS / PMCF gaps',
                            intent: 'review-pms-pmcf-gaps',
                            description: 'Identify post-market surveillance gaps.',
                          },
                        ],
                        NDA: [
                          {
                            id: 'upload-source',
                            label: 'Upload source documents',
                            intent: 'upload-source-documents',
                            description: 'Add CSRs, CMC data, and prior filings.',
                          },
                          {
                            id: 'draft-nda-outline',
                            label: 'Draft NDA outline',
                            intent: 'draft-nda-outline',
                            description: 'Generate NDA outline per 21 CFR 314.',
                          },
                          {
                            id: 'nda-missing',
                            label: 'Identify missing sections',
                            intent: 'identify-missing-nda-sections',
                            description: 'Audit NDA for gaps and missing modules.',
                          },
                          {
                            id: 'gen-summary',
                            label: 'Generate ISS/ISE outline',
                            intent: 'generate-iss-ise-outline',
                            description: 'Outline Integrated Summary of Safety/Efficacy.',
                          },
                        ],
                      };

                      const all = starters[t] ?? starters['IND'];
                      // State-aware ordering: no files → upload first; has files no outputs → generate first
                      if (!hasFiles) return [all[0], ...all.slice(1, 4)]; // upload first
                      if (!hasOutputs) return [all[1], all[2], all[3], all[0]].slice(0, 3); // generate first
                      return all.slice(1, 4); // skip upload, show generate/audit
                    })()}
                    onActionRun={handleActionRun}
                    onNavigate={(path: string) => {
                      try {
                        const params = new URLSearchParams(
                          new URL(path, window.location.origin).search
                        );
                        const p = params.get('panel') as ToolPanel | null;
                        if (p && p in TOOL_PANELS) {
                          setActiveToolPanel(p);
                          return;
                        }
                      } catch (_) {
                        /* fallback */
                      }
                      setLayoutMode('workspace');
                    }}
                    onNewProject={() => setNewProjectOpen(true)}
                    onThreadChange={tid => {
                      handleThreadChange(tid);
                      if (pendingDraftSection) setPendingDraftSection(null);
                    }}
                  />
                </div>

                {/* Right panel: Files / Outputs / Instructions */}
                {workspacePanelOpen && (
                  <div className="w-72 xl:w-80 border-l border-zinc-100 bg-zinc-50/30 flex flex-col flex-shrink-0">
                    {/* Tab bar */}
                    <div className="flex items-center border-b border-zinc-100 flex-shrink-0 bg-white">
                      {(['files', 'outputs', 'instructions'] as const).map(tab => {
                        const cfg = {
                          files: {
                            icon: Upload,
                            label: 'Files',
                            active: 'border-blue-500 text-blue-700',
                          },
                          outputs: {
                            icon: Layers,
                            label: 'Outputs',
                            active: 'border-violet-500 text-violet-700',
                          },
                          instructions: {
                            icon: PenLine,
                            label: 'Instructions',
                            active: 'border-amber-500 text-amber-700',
                          },
                        }[tab];
                        const Icon = cfg.icon;
                        return (
                          <button
                            key={tab}
                            onClick={() => setWorkspacePanelTab(tab)}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors border-b-2',
                              workspacePanelTab === tab
                                ? cfg.active
                                : 'border-transparent text-zinc-400 hover:text-zinc-600'
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Files tab ── */}
                    {workspacePanelTab === 'files' && (
                      <div className="flex-1 flex flex-col min-h-0">
                        <ProjectFilesCompact projectId={activeProjectId ?? null} />
                      </div>
                    )}

                    {/* ── Outputs + Run Log tab ── */}
                    {workspacePanelTab === 'outputs' && (
                      <div className="flex-1 overflow-y-auto zen-scroll">
                        {/* Run log — in-flight and recent actions */}
                        {runLog.length > 0 && (
                          <div className="p-3 border-b border-zinc-100">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                              Activity
                            </p>
                            <div className="space-y-1.5">
                              {runLog.slice(0, 8).map(entry => (
                                <div
                                  key={entry.id}
                                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-zinc-100"
                                >
                                  {entry.status === 'running' ? (
                                    <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
                                  ) : entry.status === 'done' ? (
                                    <div className="w-3 h-3 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </div>
                                  ) : (
                                    <div className="w-3 h-3 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-zinc-700 truncate">
                                      {entry.label}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 capitalize">
                                      {entry.status}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Artifacts */}
                        {projectArtifacts.length === 0 &&
                        (workspaceSummary?.recent?.artifacts?.length ?? 0) === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                            <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
                              <Layers className="w-4 h-4 text-zinc-400" />
                            </div>
                            <p className="text-xs font-medium text-zinc-600 mb-1">No outputs yet</p>
                            <p className="text-[11px] text-zinc-400 max-w-[160px] leading-relaxed">
                              Run a workflow or ask RI to draft a document.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 space-y-1.5">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-2">
                              Generated
                            </p>
                            {[...projectArtifacts, ...(workspaceSummary?.recent?.artifacts ?? [])]
                              .filter(
                                (a: any, i: number, arr: any[]) =>
                                  arr.findIndex((x: any) => x.id === a.id) === i
                              )
                              .slice(0, 15)
                              .map((a: any) => (
                                <div
                                  key={a.id}
                                  className="flex items-start gap-2 p-2.5 rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 transition-all cursor-default"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <FileText className="w-3 h-3 text-violet-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-zinc-900 truncate leading-tight">
                                      {a.title || a.type}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 truncate">
                                      {a.type}
                                      {a.status ? ` · ${a.status}` : ''}
                                    </p>
                                  </div>
                                  <a
                                    href={a.downloadUrl || a.url || '#'}
                                    download={a.title || a.type}
                                    onClick={e => {
                                      if (!a.downloadUrl && !a.url) e.preventDefault();
                                    }}
                                    className="flex-shrink-0 p-1 rounded text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                                    title="Download"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Instructions tab ── */}
                    {workspacePanelTab === 'instructions' && (
                      <div className="flex-1 overflow-y-auto zen-scroll">
                        {workspaceKnowledge.isLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-5 h-5 text-zinc-300 animate-spin" />
                          </div>
                        ) : (
                          <div className="p-3">
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <p className="text-xs font-semibold text-zinc-700">
                                  Project Instructions
                                </p>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-relaxed">
                                These instructions guide Regulatory Intelligence for every
                                conversation in this project.
                              </p>
                            </div>
                            <CustomInstructions
                              value={workspaceKnowledge.knowledge?.customInstructions || ''}
                              onChange={workspaceKnowledge.updateCustomInstructions}
                              projectType={activeProject?.type}
                              defaultOpen={!!workspaceKnowledge.knowledge?.customInstructions}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {!embeddedModule && layoutMode === 'editor' && (
            <div className="flex-1 flex min-w-0 min-h-0" data-testid="workspace-editor">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <EditorPanel
                    projectId={activeProjectId}
                    submissionType={activeProject?.type}
                    initialContent={pendingEditorContent?.content}
                    initialTitle={pendingEditorContent?.title}
                    initialCtdSection={pendingEditorContent?.ctdSection}
                    onInitialContentConsumed={() => setPendingEditorContent(null)}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {!embeddedModule && (layoutMode === 'assistant' || layoutMode === 'ctd') && (
            <>
              {/* Chat - Connected to Cortex */}
              <div
                className={cn(
                  'flex-1 flex flex-col min-w-0 min-h-0 transition-all duration-200',
                  activeToolPanel && !toolPanelFullscreen && 'flex-shrink-0'
                )}
                style={{
                  display: toolPanelFullscreen ? 'none' : 'flex',
                }}
              >
                {/* Workspace Readiness Strip — real counts from backend */}
                <div className="flex-shrink-0 px-4 sm:px-6 pt-2 pb-0 border-b border-zinc-100/60 bg-zinc-50/40">
                  <WorkspaceReadinessStrip
                    counts={workspaceSummary?.counts}
                    isLoading={summaryLoading}
                    orgName={workspaceSummary?.org?.name}
                  />
                </div>

                <ZenChat
                  projectId={activeProjectId}
                  projectName={activeProject?.name}
                  submissionType={activeProject?.type}
                  threadId={activeThreadId}
                  greeting={platformGreeting}
                  lastWork={lastWorkSummary}
                  nextTask={
                    nextTask
                      ? { taskTitle: nextTask.taskTitle, taskDescription: nextTask.taskDescription }
                      : null
                  }
                  suggestedActions={workspaceSummary?.nextActions}
                  onNavigate={(path: string) => {
                    // If path opens a panel, do it inline
                    try {
                      const params = new URLSearchParams(
                        new URL(path, window.location.origin).search
                      );
                      const p = params.get('panel') as ToolPanel | null;
                      if (p && p in TOOL_PANELS) {
                        setActiveToolPanel(p);
                        return;
                      }
                    } catch (_) {
                      /* fallback */
                    }
                    setLayoutMode('assistant');
                  }}
                  onNewProject={() => setNewProjectOpen(true)}
                  initialMessage={
                    pendingDraftSection
                      ? `Draft CTD section ${pendingDraftSection.code}: ${pendingDraftSection.title}. Generate a compliant first draft following ICH M4 guidelines and 21 CFR 312.23(a) requirements.`
                      : null
                  }
                  onThreadChange={tid => {
                    handleThreadChange(tid);
                    // Clear pending draft after it's been sent
                    if (pendingDraftSection) setPendingDraftSection(null);
                  }}
                />
              </div>

              {/* Project Knowledge Panel — Claude.ai-style project sidebar */}
              {!activeToolPanel && activeProjectId && (
                <div className="w-64 flex-shrink-0 border-l border-zinc-100 hidden xl:flex">
                  <ErrorBoundary>
                    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>}>
                      <ProjectKnowledgePanel projectId={activeProjectId} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Tool panel */}
              {activeToolPanel && (
                <ToolPanelWrapper
                  panel={activeToolPanel}
                  onClose={() => {
                    setActiveToolPanel(null);
                    setToolPanelFullscreen(false);
                  }}
                  isFullscreen={toolPanelFullscreen}
                  onToggleFullscreen={() => setToolPanelFullscreen(!toolPanelFullscreen)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Dr. Sage — Persistent global help/guide/copilot layer */}
      <DrSageGlobalLayer
        onOpenEnablementCenter={() => setLayoutMode('enablement-center')}
        contextProfile={{
          productType: activeProject?.type,
          userRole: userRole,
          screenName: layoutMode,
          activeProject: activeProject?.name,
        }}
      />

      {/* AnA — Persistent AI conversation panel available on every page */}
      <AnaPersistentPanel
        contextProfile={{
          productType: activeProject?.type,
          userRole: userRole,
          screenName: layoutMode,
          activeProject: activeProject?.name,
          projectId: activeProjectId,
        }}
      />

      {/* Command palette */}
      <ZenCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* Settings */}
      <ZenSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Project switcher - Connected to data layer */}
      <ProjectSwitcher
        isOpen={projectSwitcherOpen}
        onClose={() => setProjectSwitcherOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={id => {
          setActiveProjectId(id);
          setProjectSwitcherOpen(false);
          setRiViewMode('editor');
          setLayoutMode('regulatory-workspace');
          navigate(`/concept2cure/project/${id}`);
          // Clear conversation when switching projects
          setActiveConversationId(undefined);
          setActiveThreadId(undefined);
        }}
        onCreateProject={() => {
          setProjectSwitcherOpen(false);
          setNewProjectOpen(true);
        }}
        onArchiveProject={handleArchiveProject}
        onDeleteProject={handleDeleteProject}
        onToggleStar={handleToggleProjectStar}
      />

      {/* New project modal */}
      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* Edit project modal */}
      <EditProjectModal
        isOpen={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        initialData={{
          name: activeProject?.name ?? '',
          description: activeProject?.description,
          sponsor: activeProject?.sponsor,
          product: activeProject?.product,
          region: activeProject?.region,
        }}
        onSave={handleEditProject}
      />

      {/* First-run onboarding experience */}
      {showFirstRun && (
        <Suspense fallback={null}>
          <FirstRunExperience
            onComplete={(selectedRole) => {
              setShowFirstRun(false);
              try { localStorage.setItem('concept2cure_first_run_complete', 'true'); } catch {}
              if (selectedRole) {
                try {
                  const profile = JSON.parse(localStorage.getItem('concept2cure_user_profile') || '{}');
                  profile.role = selectedRole;
                  localStorage.setItem('concept2cure_user_profile', JSON.stringify(profile));
                  setUserProfile(profile);
                } catch {}
              }
            }}
            onSkip={() => {
              setShowFirstRun(false);
              try { localStorage.setItem('concept2cure_first_run_complete', 'true'); } catch {}
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ZenApp;
