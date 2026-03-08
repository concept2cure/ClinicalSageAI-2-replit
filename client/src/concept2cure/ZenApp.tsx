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

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { WorkflowTimeline, NextActionsPanel } from './components/workflow';
import { ProjectFilesCompact } from './components/workspace/ProjectFilesCompact';
import { CustomInstructions } from './components/knowledge/CustomInstructions';
import { useProjectKnowledge } from './hooks/useProjectKnowledge';
import { useProjects } from './hooks/useProjects';
import { useCortexThreads, useCortexHealth } from './hooks/useCortex';
import { usePlatformContext } from './hooks/useLicense';
import { useWorkspaceSummary } from './hooks/useWorkspaceSummary';
import { WorkspaceReadinessStrip } from './components/workspace/WorkspaceReadinessStrip';
import type { IndustryMode } from './types/workspace';
import ProductAuditQuestionnaire from '../components/ProductAuditQuestionnaire';
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
  CalendarClock,
  ShieldCheck,
  Clock,
  Wifi,
  WifiOff,
  Users,
  ClipboardCheck,
  Compass,
  Loader2,
  Target,
  FileText,
  Plus,
  Star,
  MessageSquare,
  FolderOpen,
  Upload,
  Sparkles,
  PenLine,
  Layers,
  Download,
} from 'lucide-react';

// Lazy load the Convergent Canvas for the Sherpa System
const ConvergentCanvas = lazy(() =>
  import('./components/canvas/ConvergentCanvas').then(m => ({ default: m.ConvergentCanvas }))
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

// ─── Regulatory module standalones ────────────────────────────────────────────
// Document Editor panel (bridge to UnifiedDocumentEditor + live APIs)
const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then(m => ({ default: m.default }))
);
// Medical Device & Diagnostics
const MedicalDeviceDashboardStandalone = lazy(() =>
  import('./components/medtech/MedicalDeviceDashboard').then(m => ({
    default: m.MedicalDeviceDashboardStandalone,
  }))
);
// eCTD Co-Author (IND / NDA / BLA / 510k document authoring)
const ECTDCoAuthorStandalone = lazy(() =>
  import('./components/coauthor/eCTDCoAuthor').then(m => ({ default: m.ECTDCoAuthorStandalone }))
);
// CMC Wizard (Module 3 — Chemistry, Manufacturing & Controls)
const CMCWizardStandalone = lazy(() =>
  import('./components/cmc/CMCWizard').then(m => ({ default: m.CMCWizardStandalone }))
);
// Submission Dossier Navigator (eCTD module-by-module tracker)
const DossierNavigatorStandalone = lazy(() =>
  import('./components/submission/DossierNavigator').then(m => ({
    default: m.DossierNavigatorStandalone,
  }))
);

// Precedent Intelligence Dashboard (live Precedent Engine)
const PrecedentIntelligenceDashboard = lazy(() =>
  import('./components/precedent/PrecedentIntelligenceDashboard').then(m => ({
    default: m.PrecedentIntelligenceDashboard,
  }))
);

// Regulatory Intelligence Panel (Lumen + Foresight + CSR + Precedents)
const RegulatoryIntelligencePanel = lazy(() =>
  import('./components/intelligence/RegulatoryIntelligencePanel').then(m => ({
    default: m.RegulatoryIntelligencePanel,
  }))
);

// Regulatory Status Card (dashboard widget)
const RegulatoryStatusCard = lazy(() =>
  import('./components/intelligence/RegulatoryStatusCard').then(m => ({
    default: m.RegulatoryStatusCard,
  }))
);

// Document App Hub (tool launcher)
const DocumentAppHub = lazy(() =>
  import('./components/hub/DocumentAppHub').then(m => ({
    default: m.DocumentAppHub,
  }))
);

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
  | 'medtech-dashboard'
  | 'ectd-coauthor'
  | 'cmc'
  | 'dossier'
  | 'precedent-intelligence'
  | 'regulatory-workspace'
  | 'app-hub';

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
    return 'medtech';
  }

  const normalized = value.toLowerCase().trim() as IndustryMode;
  return INDUSTRY_MODES.includes(normalized) ? normalized : 'medtech';
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
        isFullscreen ? 'w-full' : 'w-[600px]'
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
        {/* Placeholder - in production, lazy-load the actual component */}
        <div className="flex items-center justify-center h-full text-center p-8">
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <Icon className="w-8 h-8 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">{config.title}</h3>
            <p className="text-sm text-zinc-500 max-w-sm">
              This module is ready. The {config.component} component will render here with full
              functionality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN APP
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenApp: React.FC = () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // DATA HOOKS (Connected to Cortex + Data Layer)
  // ─────────────────────────────────────────────────────────────────────────────

  // Cortex health check
  const { data: cortexHealth } = useCortexHealth({ refetchInterval: 30000 });
  const isConnected = cortexHealth?.status === 'healthy';

  // License gating + user intelligence (personalized context)
  const {
    canAccessLayoutMode,
    tier: orgTier,
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

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Modals
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);

  // Tool panels
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
  const [toolPanelFullscreen, setToolPanelFullscreen] = useState(false);

  // Layout mode — default to 'projects' index so returning users always land on their work
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('projects');

  // Right panel tab in workspace mode
  const [workspacePanelTab, setWorkspacePanelTab] = useState<'files' | 'outputs' | 'instructions'>(
    'files'
  );
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);

  // Active selection
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(projects[0]?.id);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

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

  // Deep-link: open workspace from ?projectId= on first load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlProjectId = params.get('projectId');
      if (urlProjectId) {
        setActiveProjectId(urlProjectId);
        setLayoutMode('workspace');
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL ?projectId= whenever the active workspace changes
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (layoutMode === 'workspace' && activeProjectId) {
        url.searchParams.set('projectId', activeProjectId);
      } else {
        url.searchParams.delete('projectId');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (_) {
      /* ignore */
    }
  }, [layoutMode, activeProjectId]);

  const handleNewChat = useCallback(() => {
    // Clear active conversation/thread and enter workspace/assistant
    setActiveConversationId(undefined);
    setActiveThreadId(undefined);
    setLayoutMode(activeProjectId ? 'workspace' : 'assistant');
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
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  const handleLayoutModeChange = useCallback(
    (mode: LayoutMode) => {
      setLayoutMode(mode);

      if (mode === 'assistant' || mode === 'sherpa') {
        setActiveToolPanel(null);
        setToolPanelFullscreen(false);
        return;
      }

      if (mode === 'ctd') {
        setActiveToolPanel('ectd');
        setToolPanelFullscreen(false);
        return;
      }

      if (mode === 'editor') {
        setActiveToolPanel(null);
        setToolPanelFullscreen(false);
        return;
      }

      // Analytics, timeline, audit modes are full-width content (hide tool panel)
      setActiveToolPanel(null);
      setToolPanelFullscreen(false);
    },
    [activeToolPanel]
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

  const contextMetrics = {
    deadlineDays: 47,
    complianceScore: 0.87,
    riskCount: 3,
    lastActivity: 'FDA response received 2h ago',
    auditStatus: 'Audit trail active',
  };

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

  const allLayoutModes: {
    id: LayoutMode;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'assistant', label: 'Assistant' },
    { id: 'sherpa', label: 'Sherpa', icon: Compass },
    { id: 'editor', label: 'Editor' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'audit', label: 'Audit' },
    { id: 'ctd', label: 'CTD' },
    { id: 'mission-control' as LayoutMode, label: 'Mission Control', icon: Target },
    { id: 'ind-workspace' as LayoutMode, label: submissionWorkspaceLabel, icon: FileText },
  ];

  // Filter layout modes by license — only show modes the org has access to
  const layoutModes = useMemo(
    () => allLayoutModes.filter(mode => canAccessLayoutMode(mode.id)),
    [allLayoutModes, canAccessLayoutMode]
  );

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

  const primaryObjective = userProfile?.objectives?.[0] || 'Submission readiness';
  const userRole = userProfile?.role || 'Regulatory Lead';
  const rawIndustry = userProfile?.preferences?.industryMode;
  const industryMode = normalizeIndustryMode(
    typeof rawIndustry === 'string' ? rawIndustry : undefined
  );
  const rawDisplayName = userProfile?.preferences?.displayName;
  const userName =
    (typeof rawDisplayName === 'string' && rawDisplayName) ||
    userIntelligence?.identity?.name ||
    'User';
  const userEmail = userIntelligence?.identity?.email ?? undefined;

  const agentRoster = useMemo(
    () => [
      {
        id: 'agent-compliance',
        name: `${userRole} Agent`,
        status: 'Active',
        focus: primaryObjective,
      },
      {
        id: 'agent-evidence',
        name: 'Evidence Agent',
        status: 'Reviewing',
        focus: userProfile?.criteria?.[0] || 'Clinical evidence map',
      },
      {
        id: 'agent-quality',
        name: 'Quality Agent',
        status: 'Queued',
        focus: userProfile?.criteria?.[1] || 'Section audit checks',
      },
    ],
    [primaryObjective, userProfile, userRole]
  );

  const nextActions = useMemo(
    () => [
      {
        id: 'action-compile-section',
        name: `Advance ${primaryObjective.toLowerCase()}`,
        description: `Progress ${primaryObjective.toLowerCase()} with evidence alignment.`,
        stepType: 'TASK' as const,
        status: 'READY' as const,
        workflowName: 'Priority Objectives',
        workflowId: 'workflow-reg-prep-01',
        workflowRunId,
        slaDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        assigneeRole: userRole,
        order: 1,
        priority: 'HIGH' as const,
      },
      {
        id: 'action-review-claims',
        name: userProfile?.criteria?.[0] || 'Review efficacy claims',
        description: 'Validate claims against source evidence.',
        stepType: 'REVIEW' as const,
        status: 'IN_PROGRESS' as const,
        workflowName: 'Evidence Validation',
        workflowId: 'workflow-evd-02',
        workflowRunId,
        slaDueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
        assigneeRole: userRole,
        order: 2,
        priority: 'MEDIUM' as const,
      },
      {
        id: 'action-approval-qa',
        name: userProfile?.criteria?.[1] || 'QA sign-off checklist',
        description: 'Approve final quality checklist for submission.',
        stepType: 'APPROVAL' as const,
        status: 'AWAITING_APPROVAL' as const,
        workflowName: 'Quality Governance',
        workflowId: 'workflow-qa-03',
        workflowRunId,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        assigneeRole: userRole,
        order: 3,
        priority: 'LOW' as const,
      },
    ],
    [primaryObjective, userProfile, userRole, workflowRunId]
  );

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
  }: {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onBack: () => void;
  }) => (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Chat</span>
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {icon && <span className="text-zinc-400">{icon}</span>}
      <span className="text-sm font-medium text-zinc-900">{title}</span>
      {subtitle && <span className="text-xs text-zinc-400 ml-1">{subtitle}</span>}
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
          <span>AI running in offline mode — chat still available</span>
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
            // ── Regulatory module routes ──────────────────────────────
            case 'ind-workspace':
              setLayoutMode('ind-workspace');
              break;
            case 'medtech-dashboard':
              setLayoutMode('medtech-dashboard');
              break;
            case 'ectd-coauthor':
              setLayoutMode('ectd-coauthor');
              break;
            case 'cmc':
              setLayoutMode('cmc');
              break;
            case 'dossier':
              setLayoutMode('dossier');
              break;
            case 'precedent-intelligence':
              setLayoutMode('precedent-intelligence');
              break;
            case 'regulatory-workspace':
              setLayoutMode('regulatory-workspace');
              break;
            case 'app-hub':
              setLayoutMode('app-hub');
              break;
            case 'mission-control':
              setLayoutMode('mission-control');
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
          {/* Sherpa Mode - Convergent Canvas */}
          {layoutMode === 'sherpa' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-stone-50">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
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
          )}

          {layoutMode === 'analytics' && (
            <div className="flex-1 flex items-center justify-center p-8 bg-white">
              <div className="max-w-md text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center">
                  <BarChart2 className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900">Analytics Mode</h3>
                <p className="text-sm text-zinc-500">
                  Portfolio analytics and risk trends will render here with full-width dashboards.
                </p>
              </div>
            </div>
          )}

          {layoutMode === 'timeline' && (
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

          {layoutMode === 'audit' && (
            <div className="flex-1 overflow-y-auto bg-zinc-50">
              <ProductAuditQuestionnaire />
            </div>
          )}

          {/* Phase 7: Mission Control Dashboard */}
          {layoutMode === 'mission-control' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-stone-50">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-zinc-500">Loading Mission Control...</p>
                  </div>
                </div>
              }
            >
              <MissionControl />
            </Suspense>
          )}

          {/* IND Filing Workspace */}
          {layoutMode === 'ind-workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title={submissionWorkspaceLabel}
                subtitle="IND · NDA · BLA · 21 CFR 312 · CTD-formatted sections"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
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
                      console.log(`[IND] Opening section ${sectionCode} in editor`);
                      setLayoutMode('editor');
                    }}
                    onDraftWithAI={(sectionCode, sectionTitle) => {
                      setPendingDraftSection({ code: sectionCode, title: sectionTitle });
                      setLayoutMode('assistant');
                    }}
                    onNavigateToCoAuthor={() => setLayoutMode('editor')}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── Medical Device & Diagnostics Dashboard ──────────────────────── */}
          {layoutMode === 'medtech-dashboard' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="Medical Device & Diagnostics"
                subtitle="510(k) · PMA · De Novo · IVD / CDx · CER authoring"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Medical Device Dashboard...</p>
                      </div>
                    </div>
                  }
                >
                  <MedicalDeviceDashboardStandalone />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── eCTD Co-Author (IND / NDA / BLA / 510k authoring) ─────────── */}
          {layoutMode === 'ectd-coauthor' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="eCTD Co-Author"
                subtitle="IND · NDA · BLA · 510(k) · CTD section-by-section drafting"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-violet-500 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading eCTD Co-Author...</p>
                      </div>
                    </div>
                  }
                >
                  <ECTDCoAuthorStandalone />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── CMC Wizard (Chemistry, Manufacturing & Controls — Module 3) ── */}
          {layoutMode === 'cmc' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="CMC Module 3"
                subtitle="Chemistry, Manufacturing & Controls · ICH Q3A / Q1A / Q6B"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-green-500 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading CMC Wizard...</p>
                      </div>
                    </div>
                  }
                >
                  <CMCWizardStandalone />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── Submission Dossier Navigator (eCTD module tracker) ───────────── */}
          {layoutMode === 'dossier' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="Dossier Navigator"
                subtitle="eCTD Module 1–5 tracker · NDA / BLA / IND · Target filing dashboard"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Dossier Navigator...</p>
                      </div>
                    </div>
                  }
                >
                  <DossierNavigatorStandalone />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── Precedent Intelligence (live Precedent Engine) ──────────────── */}
          {layoutMode === 'precedent-intelligence' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="Precedent Intelligence"
                subtitle="Search · Compare · Risk Analysis · Strategy — live FDA precedent data"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 overflow-auto">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white h-full">
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-violet-500 mx-auto mb-4" />
                        <p className="text-zinc-500">Loading Precedent Intelligence...</p>
                      </div>
                    </div>
                  }
                >
                  <PrecedentIntelligenceDashboard
                    projectSubmissionType={activeProject?.type}
                    projectDeviceName={activeProject?.name}
                    projectIndication={activeProject?.description}
                    onNavigateToEditor={() => setLayoutMode('editor')}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── Document App Hub (tool launcher) ───────────────────────── */}
          {layoutMode === 'app-hub' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="Document Tools"
                subtitle={`${activeProject?.name || 'Project'} · ${activeProject?.type || 'Submission'} · All roads lead to documents`}
                onBack={() => setLayoutMode('workspace')}
              />
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center bg-white h-full">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
                      <p className="text-zinc-500">Loading Apps...</p>
                    </div>
                  </div>
                }
              >
                <DocumentAppHub
                  submissionType={activeProject?.type}
                  projectName={activeProject?.name}
                  onNavigate={(mode: string) => setLayoutMode(mode as LayoutMode)}
                  onStartChat={() => setLayoutMode('workspace')}
                />
              </Suspense>
            </div>
          )}

          {/* ── Regulatory Intelligence Workspace (full IDE view) ──────────── */}
          {layoutMode === 'regulatory-workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              <WorkspaceHeader
                title="Regulatory Intelligence Workspace"
                subtitle="Document authoring with live precedent, risk, and strategy intelligence"
                onBack={() => setLayoutMode('assistant')}
              />
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Left: Status Card + Editor */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                  {/* Status Card */}
                  <div className="p-3 border-b border-zinc-100 bg-zinc-50/30 shrink-0">
                    <Suspense fallback={null}>
                      <RegulatoryStatusCard
                        submissionType={activeProject?.type}
                        indication={activeProject?.description}
                        deviceName={activeProject?.name}
                        onOpenIntelligence={() => setLayoutMode('precedent-intelligence')}
                      />
                    </Suspense>
                  </div>
                  {/* Editor */}
                  <div className="flex-1 min-h-0 overflow-hidden">
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
                      />
                    </Suspense>
                  </div>
                </div>
                {/* Right: Intelligence Panel */}
                <div className="w-80 shrink-0 border-l border-zinc-200">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                      </div>
                    }
                  >
                    <RegulatoryIntelligencePanel
                      submissionType={activeProject?.type}
                      indication={activeProject?.description}
                      deviceName={activeProject?.name}
                      phase="III"
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}

          {/* Rules Engine Manager */}
          {layoutMode === 'rules' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-stone-50">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-violet-500 mx-auto mb-4" />
                    <p className="text-zinc-500">Loading Rules Engine...</p>
                  </div>
                </div>
              }
            >
              <RulesManager onBack={() => setLayoutMode('mission-control')} />
            </Suspense>
          )}

          {/* ── Projects Index ─────────────────────────────────────────────── */}
          {layoutMode === 'projects' && (
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

                {/* Project cards */}
                {projects.filter(p => !p.archived).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                    {projects
                      .filter(p => !p.archived)
                      .map(project => {
                        const typeColors: Record<
                          string,
                          { bg: string; text: string; dot: string }
                        > = {
                          '510K': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
                          IND: {
                            bg: 'bg-violet-50',
                            text: 'text-violet-700',
                            dot: 'bg-violet-500',
                          },
                          NDA: {
                            bg: 'bg-emerald-50',
                            text: 'text-emerald-700',
                            dot: 'bg-emerald-500',
                          },
                          BLA: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
                          PMA: {
                            bg: 'bg-orange-50',
                            text: 'text-orange-700',
                            dot: 'bg-orange-500',
                          },
                          CER: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
                          MAA: {
                            bg: 'bg-indigo-50',
                            text: 'text-indigo-700',
                            dot: 'bg-indigo-500',
                          },
                        };
                        const tc = typeColors[project.type] ?? {
                          bg: 'bg-zinc-50',
                          text: 'text-zinc-600',
                          dot: 'bg-zinc-400',
                        };
                        return (
                          <button
                            key={project.id}
                            onClick={() => {
                              setActiveProjectId(project.id);
                              setLayoutMode('workspace');
                            }}
                            className="group text-left rounded-2xl border border-zinc-200 bg-white p-5 hover:border-blue-200 hover:shadow-md transition-all duration-150"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                                  tc.bg,
                                  tc.text
                                )}
                              >
                                <span className={cn('w-1.5 h-1.5 rounded-full', tc.dot)} />
                                {project.type}
                              </span>
                              {project.starred && (
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                              )}
                            </div>
                            <h3 className="text-sm font-semibold text-zinc-900 mb-1 line-clamp-2 group-hover:text-blue-700 transition-colors">
                              {project.name}
                            </h3>
                            {project.description && (
                              <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-auto pt-2 border-t border-zinc-100">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {project.conversationCount} chats
                              </span>
                              <span className="ml-auto">
                                {project.lastUpdated
                                  ? new Date(project.lastUpdated).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  /* Empty state */
                  <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white p-12 text-center mb-10">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-zinc-100 flex items-center justify-center">
                      <FolderOpen className="w-6 h-6 text-zinc-400" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 mb-1">No projects yet</h3>
                    <p className="text-sm text-zinc-500 mb-6 max-w-xs mx-auto">
                      Create a project to organize your regulatory work — submissions, documents,
                      and AI sessions all in one place.
                    </p>
                    <button
                      onClick={() => setNewProjectOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Create your first project
                    </button>
                  </div>
                )}

                {/* Recent activity row */}
                {(workspaceSummary?.recent?.artifacts?.length ?? 0) > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Recent Artifacts
                    </h2>
                    <div className="space-y-2">
                      {workspaceSummary!.recent.artifacts!.slice(0, 4).map((a: any) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 truncate">
                              {a.title || a.type}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {a.type} · {a.status} ·{' '}
                              {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                            </p>
                          </div>
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
                    <div className="space-y-1.5">
                      {workspaceSummary!.recent.threads!.slice(0, 5).map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setActiveThreadId(t.id);
                            setLayoutMode('workspace');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-zinc-100 transition-colors"
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
          {layoutMode === 'workspace' && (
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
                  {/* Document Tools launcher */}
                  <button
                    onClick={() => setLayoutMode('app-hub')}
                    title="Document Tools"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-zinc-500 hover:text-blue-700 hover:bg-blue-50 transition-colors flex-shrink-0"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span className="hidden sm:inline">Tools</span>
                  </button>
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
                              Run a workflow or ask the AI to draft a document.
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
                                These instructions guide the AI for every conversation in this
                                project.
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
          {layoutMode === 'editor' && (
            <div className="flex-1 flex min-w-0 min-h-0">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  </div>
                }
              >
                <EditorPanel projectId={activeProjectId} submissionType={activeProject?.type} />
              </Suspense>
            </div>
          )}
          {(layoutMode === 'assistant' || layoutMode === 'ctd') && (
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

              {/* Agent Workspace panel hidden by default - accessible via Tools */}

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
    </div>
  );
};

export default ZenApp;
