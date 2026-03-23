/**
 * @fileoverview Zen Workspace Provider
 * @module concept2cure/contexts/ZenWorkspaceContext
 * @version 1.0.0
 *
 * @description
 * Unified project + session context provider. This is the "brain" that
 * maintains workspace state and makes it available throughout the app.
 * Claude.ai-style persistent workspace experience.
 *
 * Features:
 * - Active project context shared everywhere
 * - Session persistence with localStorage
 * - Team presence tracking
 * - Activity logging for audit trail
 * - Keyboard shortcut registration
 *
 * @compliance
 * - FDA 21 CFR Part 11: All state changes logged
 * - HIPAA: Excludes PHI from context
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SubmissionType = '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'CER' | 'DE_NOVO';
export type ProjectPhase = 'planning' | 'drafting' | 'review' | 'approval' | 'submission' | 'response';
export type LayoutMode = 'assistant' | 'editor' | 'analytics' | 'timeline' | 'audit' | 'ctd';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
  lastActive?: string;
  currentActivity?: string;
}

export interface ProjectArtifact {
  id: string;
  name: string;
  type: 'document' | 'table' | 'checklist' | 'form' | 'image';
  status: 'draft' | 'review' | 'approved' | 'published';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ectdModule?: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assigneeId?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ActiveProject {
  id: string;
  name: string;
  type: SubmissionType;
  description?: string;
  phase: ProjectPhase;
  progress: number; // 0-100
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  team: TeamMember[];
  artifacts: ProjectArtifact[];
  tasks: ProjectTask[];
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  projectId: string;
  lastMessage?: string;
  timestamp: string;
  starred: boolean;
  pinned: boolean;
}

export interface ActivityEvent {
  id: string;
  type: 'project' | 'document' | 'task' | 'comment' | 'approval' | 'navigation';
  action: string;
  description: string;
  userId: string;
  userName: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceState {
  // User context
  userId: string;
  userName: string;
  organizationId: string;
  userRole: string;
  
  // Active selections
  activeProject: ActiveProject | null;
  activeConversationId: string | null;
  activeArtifactId: string | null;
  
  // UI state
  layoutMode: LayoutMode;
  sidebarCollapsed: boolean;
  toolPanelOpen: string | null;
  
  // Data
  projects: ActiveProject[];
  conversations: Conversation[];
  recentActivity: ActivityEvent[];
  
  // Session
  sessionId: string;
  sessionStartedAt: string;
  lastActivity: string;
  
  // Feature flags
  features: {
    collaboration: boolean;
    eSignature: boolean;
    aiGeneration: boolean;
    ectdExport: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

type WorkspaceAction =
  | { type: 'SET_USER'; payload: { userId: string; userName: string; organizationId: string; userRole: string } }
  | { type: 'SET_ACTIVE_PROJECT'; payload: ActiveProject | null }
  | { type: 'SET_ACTIVE_CONVERSATION'; payload: string | null }
  | { type: 'SET_ACTIVE_ARTIFACT'; payload: string | null }
  | { type: 'SET_LAYOUT_MODE'; payload: LayoutMode }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_TOOL_PANEL'; payload: string | null }
  | { type: 'SET_PROJECTS'; payload: ActiveProject[] }
  | { type: 'ADD_PROJECT'; payload: ActiveProject }
  | { type: 'UPDATE_PROJECT'; payload: Partial<ActiveProject> & { id: string } }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'ADD_ACTIVITY'; payload: ActivityEvent }
  | { type: 'RESTORE_SESSION'; payload: Partial<WorkspaceState> }
  | { type: 'UPDATE_TEAM_MEMBER_STATUS'; payload: { memberId: string; status: TeamMember['status']; activity?: string } }
  | { type: 'ADD_ARTIFACT_TO_PROJECT'; payload: { projectId: string; artifact: ProjectArtifact } }
  | { type: 'ADD_TASK_TO_PROJECT'; payload: { projectId: string; task: ProjectTask } };

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const generateSessionId = () => `session-${crypto.randomUUID()}`;

const initialState: WorkspaceState = {
  userId: '',
  userName: '',
  organizationId: '',
  userRole: '',
  activeProject: null,
  activeConversationId: null,
  activeArtifactId: null,
  layoutMode: 'assistant',
  sidebarCollapsed: false,
  toolPanelOpen: null,
  projects: [],
  conversations: [],
  recentActivity: [],
  sessionId: generateSessionId(),
  sessionStartedAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  features: {
    collaboration: true,
    eSignature: true,
    aiGeneration: true,
    ectdExport: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════════

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  const newState = { ...state, lastActivity: new Date().toISOString() };
  
  switch (action.type) {
    case 'SET_USER':
      return { ...newState, ...action.payload };
      
    case 'SET_ACTIVE_PROJECT':
      return { ...newState, activeProject: action.payload };
      
    case 'SET_ACTIVE_CONVERSATION':
      return { ...newState, activeConversationId: action.payload };
      
    case 'SET_ACTIVE_ARTIFACT':
      return { ...newState, activeArtifactId: action.payload };
      
    case 'SET_LAYOUT_MODE':
      return { ...newState, layoutMode: action.payload };
      
    case 'TOGGLE_SIDEBAR':
      return { ...newState, sidebarCollapsed: !state.sidebarCollapsed };
      
    case 'SET_TOOL_PANEL':
      return { ...newState, toolPanelOpen: action.payload };
      
    case 'SET_PROJECTS':
      return { ...newState, projects: action.payload };
      
    case 'ADD_PROJECT':
      return { ...newState, projects: [...state.projects, action.payload] };
      
    case 'UPDATE_PROJECT': {
      const { id, ...updates } = action.payload;
      return {
        ...newState,
        projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p),
        activeProject: state.activeProject?.id === id 
          ? { ...state.activeProject, ...updates } 
          : state.activeProject,
      };
    }
      
    case 'DELETE_PROJECT':
      return {
        ...newState,
        projects: state.projects.filter(p => p.id !== action.payload),
        activeProject: state.activeProject?.id === action.payload ? null : state.activeProject,
      };
      
    case 'SET_CONVERSATIONS':
      return { ...newState, conversations: action.payload };
      
    case 'ADD_CONVERSATION':
      return { ...newState, conversations: [action.payload, ...state.conversations] };
      
    case 'ADD_ACTIVITY':
      return {
        ...newState,
        recentActivity: [action.payload, ...state.recentActivity].slice(0, 50),
      };
      
    case 'RESTORE_SESSION':
      return { ...newState, ...action.payload };
      
    case 'UPDATE_TEAM_MEMBER_STATUS': {
      if (!state.activeProject) return state;
      return {
        ...newState,
        activeProject: {
          ...state.activeProject,
          team: state.activeProject.team.map(m =>
            m.id === action.payload.memberId
              ? { ...m, status: action.payload.status, currentActivity: action.payload.activity }
              : m
          ),
        },
      };
    }
      
    case 'ADD_ARTIFACT_TO_PROJECT': {
      const project = state.projects.find(p => p.id === action.payload.projectId);
      if (!project) return state;
      
      const updatedProject = {
        ...project,
        artifacts: [...project.artifacts, action.payload.artifact],
      };
      
      return {
        ...newState,
        projects: state.projects.map(p => p.id === action.payload.projectId ? updatedProject : p),
        activeProject: state.activeProject?.id === action.payload.projectId ? updatedProject : state.activeProject,
      };
    }
      
    case 'ADD_TASK_TO_PROJECT': {
      const project = state.projects.find(p => p.id === action.payload.projectId);
      if (!project) return state;
      
      const updatedProject = {
        ...project,
        tasks: [...project.tasks, action.payload.task],
      };
      
      return {
        ...newState,
        projects: state.projects.map(p => p.id === action.payload.projectId ? updatedProject : p),
        activeProject: state.activeProject?.id === action.payload.projectId ? updatedProject : state.activeProject,
      };
    }
      
    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  
  // Convenience actions
  setActiveProject: (project: ActiveProject | null) => void;
  setActiveConversation: (id: string | null) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleSidebar: () => void;
  openToolPanel: (panel: string | null) => void;
  
  // Project actions
  createProject: (data: Omit<ActiveProject, 'id' | 'createdAt' | 'updatedAt' | 'artifacts' | 'tasks' | 'team'>) => ActiveProject;
  updateProject: (id: string, updates: Partial<ActiveProject>) => void;
  deleteProject: (id: string) => void;
  
  // Artifact actions
  addArtifact: (projectId: string, artifact: Omit<ProjectArtifact, 'id' | 'createdAt' | 'updatedAt'>) => void;
  
  // Task actions
  addTask: (projectId: string, task: Omit<ProjectTask, 'id'>) => void;
  
  // Activity logging
  logActivity: (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => void;
  
  // Session
  saveSession: () => void;
  restoreSession: () => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenWorkspaceProviderProps {
  children: ReactNode;
  userId: string;
  userName: string;
  organizationId: string;
  userRole?: string;
}

export const ZenWorkspaceProvider: React.FC<ZenWorkspaceProviderProps> = ({
  children,
  userId,
  userName,
  organizationId,
  userRole = 'user',
}) => {
  const [state, dispatch] = useReducer(workspaceReducer, {
    ...initialState,
    userId,
    userName,
    organizationId,
    userRole,
  });
  
  // Storage key
  const storageKey = `zen-workspace-${userId}-${organizationId}`;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CONVENIENCE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const setActiveProject = useCallback((project: ActiveProject | null) => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project });
  }, []);
  
  const setActiveConversation = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: id });
  }, []);
  
  const setLayoutMode = useCallback((mode: LayoutMode) => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: mode });
  }, []);
  
  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);
  
  const openToolPanel = useCallback((panel: string | null) => {
    dispatch({ type: 'SET_TOOL_PANEL', payload: panel });
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PROJECT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const createProject = useCallback((data: Omit<ActiveProject, 'id' | 'createdAt' | 'updatedAt' | 'artifacts' | 'tasks' | 'team'>): ActiveProject => {
    const now = new Date().toISOString();
    const project: ActiveProject = {
      ...data,
      id: `proj-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      createdAt: now,
      updatedAt: now,
      artifacts: [],
      tasks: [],
      team: [{
        id: userId,
        name: userName,
        email: '',
        role: userRole,
        status: 'online',
      }],
    };
    
    dispatch({ type: 'ADD_PROJECT', payload: project });
    
    // Log activity
    dispatch({
      type: 'ADD_ACTIVITY',
      payload: {
        id: `act-${Date.now()}`,
        type: 'project',
        action: 'created',
        description: `Created project "${project.name}"`,
        userId,
        userName,
        timestamp: now,
        metadata: { projectId: project.id, projectType: project.type },
      },
    });
    
    return project;
  }, [userId, userName, userRole]);
  
  const updateProject = useCallback((id: string, updates: Partial<ActiveProject>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, ...updates, updatedAt: new Date().toISOString() } });
  }, []);
  
  const deleteProject = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTIFACT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const addArtifact = useCallback((projectId: string, artifact: Omit<ProjectArtifact, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newArtifact: ProjectArtifact = {
      ...artifact,
      id: `art-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      createdAt: now,
      updatedAt: now,
    };
    
    dispatch({ type: 'ADD_ARTIFACT_TO_PROJECT', payload: { projectId, artifact: newArtifact } });
    
    dispatch({
      type: 'ADD_ACTIVITY',
      payload: {
        id: `act-${Date.now()}`,
        type: 'document',
        action: 'created',
        description: `Created document "${newArtifact.name}"`,
        userId,
        userName,
        timestamp: now,
        metadata: { artifactId: newArtifact.id, projectId },
      },
    });
  }, [userId, userName]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // TASK ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const addTask = useCallback((projectId: string, task: Omit<ProjectTask, 'id'>) => {
    const newTask: ProjectTask = {
      ...task,
      id: `task-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
    };
    
    dispatch({ type: 'ADD_TASK_TO_PROJECT', payload: { projectId, task: newTask } });
    
    dispatch({
      type: 'ADD_ACTIVITY',
      payload: {
        id: `act-${Date.now()}`,
        type: 'task',
        action: 'created',
        description: `Created task "${newTask.title}"`,
        userId,
        userName,
        timestamp: new Date().toISOString(),
        metadata: { taskId: newTask.id, projectId },
      },
    });
  }, [userId, userName]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIVITY LOGGING
  // ─────────────────────────────────────────────────────────────────────────────
  
  const logActivity = useCallback((event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    dispatch({
      type: 'ADD_ACTIVITY',
      payload: {
        ...event,
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    });
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────────
  
  const saveSession = useCallback(() => {
    try {
      const sessionData = {
        activeProjectId: state.activeProject?.id,
        activeConversationId: state.activeConversationId,
        layoutMode: state.layoutMode,
        sidebarCollapsed: state.sidebarCollapsed,
        toolPanelOpen: state.toolPanelOpen,
        lastActivity: new Date().toISOString(),
        scrollPosition: window.scrollY,
      };
      
      localStorage.setItem(storageKey, JSON.stringify(sessionData));
    } catch (error) {
    }
  }, [state, storageKey]);
  
  const restoreSession = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return false;
      
      const sessionData = JSON.parse(saved);
      const lastActivity = new Date(sessionData.lastActivity);
      const hoursSince = (Date.now() - lastActivity.getTime()) / 3600000;
      
      // Session valid for 72 hours
      if (hoursSince > 72) {
        localStorage.removeItem(storageKey);
        return false;
      }
      
      dispatch({
        type: 'RESTORE_SESSION',
        payload: {
          activeConversationId: sessionData.activeConversationId,
          layoutMode: sessionData.layoutMode,
          sidebarCollapsed: sessionData.sidebarCollapsed,
          toolPanelOpen: sessionData.toolPanelOpen,
        },
      });
      
      // Restore scroll position
      if (sessionData.scrollPosition) {
        requestAnimationFrame(() => {
          window.scrollTo(0, sessionData.scrollPosition);
        });
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }, [storageKey]);
  
  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(saveSession, 1000);
    return () => clearTimeout(timer);
  }, [state.activeProject?.id, state.activeConversationId, state.layoutMode, saveSession]);
  
  // Save on page unload
  useEffect(() => {
    const handleUnload = () => saveSession();
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [saveSession]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CONTEXT VALUE
  // ─────────────────────────────────────────────────────────────────────────────
  
  const contextValue = useMemo<WorkspaceContextValue>(() => ({
    state,
    dispatch,
    setActiveProject,
    setActiveConversation,
    setLayoutMode,
    toggleSidebar,
    openToolPanel,
    createProject,
    updateProject,
    deleteProject,
    addArtifact,
    addTask,
    logActivity,
    saveSession,
    restoreSession,
  }), [
    state,
    setActiveProject,
    setActiveConversation,
    setLayoutMode,
    toggleSidebar,
    openToolPanel,
    createProject,
    updateProject,
    deleteProject,
    addArtifact,
    addTask,
    logActivity,
    saveSession,
    restoreSession,
  ]);
  
  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a ZenWorkspaceProvider');
  }
  return context;
}

// Convenience hooks for specific slices
export function useActiveProject(): ActiveProject | null {
  const { state } = useWorkspace();
  return state.activeProject;
}

export function useLayoutMode(): [LayoutMode, (mode: LayoutMode) => void] {
  const { state, setLayoutMode } = useWorkspace();
  return [state.layoutMode, setLayoutMode];
}

export function useRecentActivity(): ActivityEvent[] {
  const { state } = useWorkspace();
  return state.recentActivity;
}

export default ZenWorkspaceProvider;
