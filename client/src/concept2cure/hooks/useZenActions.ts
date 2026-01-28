/**
 * Zen Actions Hook
 * 
 * Orchestrates all Zen UI actions and connects them to backends.
 * Single source of truth for navigation, project management, and AI interactions.
 * 
 * @module concept2cure/hooks/useZenActions
 * @version 3.0.0
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'wouter';
import { useProjects } from './useProjects';
import { useCortexChat } from './useCortex';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ZenActionId = 
  // Chat actions
  | 'new-chat'
  | 'search-conversations'
  // Submission actions
  | 'new-510k'
  | 'new-ind'
  | 'new-nda'
  | 'new-bla'
  | 'new-pma'
  | 'new-maa'
  | 'new-denovo'
  | 'new-eua'
  // Tool actions
  | 'tool-ectd'
  | 'tool-protocol'
  | 'tool-sop'
  | 'tool-capa'
  | 'tool-pms'
  | 'tool-inspection'
  | 'tool-intelligence'
  // AI actions
  | 'ai-analyze'
  | 'ai-draft'
  | 'ai-compare'
  | 'ai-predict'
  // Settings
  | 'settings'
  | 'profile'
  | 'organization'
  // Navigation
  | 'dashboard'
  | 'projects'
  | 'help';

export interface ZenActionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface UseZenActionsReturn {
  // State
  activePanel: string | null;
  activeTool: string | null;
  isCommandPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isProjectSwitcherOpen: boolean;
  isNewProjectModalOpen: boolean;
  
  // Actions
  executeAction: (actionId: ZenActionId) => Promise<ZenActionResult>;
  
  // Panel controls
  openPanel: (panelId: string) => void;
  closePanel: () => void;
  togglePanel: (panelId: string) => void;
  
  // Tool controls
  openTool: (toolId: string) => void;
  closeTool: () => void;
  
  // Modal controls
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openProjectSwitcher: () => void;
  closeProjectSwitcher: () => void;
  openNewProjectModal: () => void;
  closeNewProjectModal: () => void;
  
  // Project actions
  createProject: (data: { name: string; type: string; description?: string }) => Promise<string>;
  selectProject: (projectId: string) => void;
  deleteProject: (projectId: string) => Promise<void>;
  
  // Chat actions
  startNewChat: () => void;
  clearCurrentChat: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useZenActions(): UseZenActionsReturn {
  // State
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  
  // Project management
  const { 
    createProject: createProjectMutation,
    deleteProject: deleteProjectMutation,
    setActiveProject,
  } = useProjects();

  // Chat
  const { clearMessages } = useCortexChat();

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────

  const openPanel = useCallback((panelId: string) => {
    setActivePanel(panelId);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const togglePanel = useCallback((panelId: string) => {
    setActivePanel((prev) => (prev === panelId ? null : panelId));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // TOOL CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────

  const openTool = useCallback((toolId: string) => {
    setActiveTool(toolId);
    setActivePanel(toolId);
  }, []);

  const closeTool = useCallback(() => {
    setActiveTool(null);
    setActivePanel(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────

  const openCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen((prev) => !prev);
  }, []);

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
    closeCommandPalette();
  }, [closeCommandPalette]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const openProjectSwitcher = useCallback(() => {
    setIsProjectSwitcherOpen(true);
    closeCommandPalette();
  }, [closeCommandPalette]);

  const closeProjectSwitcher = useCallback(() => {
    setIsProjectSwitcherOpen(false);
  }, []);

  const openNewProjectModal = useCallback(() => {
    setIsNewProjectModalOpen(true);
    closeProjectSwitcher();
  }, [closeProjectSwitcher]);

  const closeNewProjectModal = useCallback(() => {
    setIsNewProjectModalOpen(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // PROJECT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const createProject = useCallback(async (data: {
    name: string;
    type: string;
    description?: string;
  }): Promise<string> => {
    const project = await createProjectMutation({
      name: data.name,
      submissionType: data.type as any,
      description: data.description,
      conversations: [],
    });
    closeNewProjectModal();
    return project.id;
  }, [createProjectMutation, closeNewProjectModal]);

  const selectProject = useCallback((projectId: string) => {
    setActiveProject?.(projectId);
    closeProjectSwitcher();
  }, [setActiveProject, closeProjectSwitcher]);

  const deleteProject = useCallback(async (projectId: string) => {
    await deleteProjectMutation(projectId);
  }, [deleteProjectMutation]);

  // ─────────────────────────────────────────────────────────────────────────────
  // CHAT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const startNewChat = useCallback(() => {
    clearMessages();
    closeCommandPalette();
  }, [clearMessages, closeCommandPalette]);

  const clearCurrentChat = useCallback(() => {
    clearMessages();
  }, [clearMessages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EXECUTE ACTION (Main dispatcher)
  // ─────────────────────────────────────────────────────────────────────────────

  const executeAction = useCallback(async (actionId: ZenActionId): Promise<ZenActionResult> => {
    closeCommandPalette();

    try {
      switch (actionId) {
        // Chat
        case 'new-chat':
          startNewChat();
          return { success: true, message: 'New chat started' };

        case 'search-conversations':
          // Could open a search modal or sidebar
          return { success: true };

        // Submissions - open new project modal with type pre-selected
        case 'new-510k':
        case 'new-ind':
        case 'new-nda':
        case 'new-bla':
        case 'new-pma':
        case 'new-maa':
        case 'new-denovo':
        case 'new-eua':
          openNewProjectModal();
          // Type will be set in the modal based on the action
          return { success: true, data: { submissionType: actionId.replace('new-', '').toUpperCase() } };

        // Tools
        case 'tool-ectd':
          openTool('ectd');
          return { success: true, message: 'eCTD Navigator opened' };

        case 'tool-protocol':
          openTool('protocol');
          return { success: true, message: 'Protocol Designer opened' };

        case 'tool-sop':
          openTool('sop');
          return { success: true, message: 'SOP Management opened' };

        case 'tool-capa':
          openTool('capa');
          return { success: true, message: 'CAPA Management opened' };

        case 'tool-pms':
          openTool('pms');
          return { success: true, message: 'Post-Market Surveillance opened' };

        case 'tool-inspection':
          openTool('inspection');
          return { success: true, message: 'Inspection Readiness opened' };

        case 'tool-intelligence':
          openTool('intelligence');
          return { success: true, message: 'Regulatory Intelligence opened' };

        // AI actions
        case 'ai-analyze':
        case 'ai-draft':
        case 'ai-compare':
        case 'ai-predict':
          // These would typically prompt for document/input
          return { success: true, data: { action: actionId } };

        // Settings
        case 'settings':
          openSettings();
          return { success: true };

        case 'profile':
          openSettings();
          return { success: true, data: { section: 'profile' } };

        case 'organization':
          openSettings();
          return { success: true, data: { section: 'organization' } };

        // Navigation
        case 'dashboard':
          // Navigate to dashboard
          return { success: true };

        case 'projects':
          openProjectSwitcher();
          return { success: true };

        case 'help':
          // Open help
          return { success: true };

        default:
          console.warn(`Unknown action: ${actionId}`);
          return { success: false, message: `Unknown action: ${actionId}` };
      }
    } catch (error) {
      console.error(`Action ${actionId} failed:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Action failed',
      };
    }
  }, [
    closeCommandPalette,
    startNewChat,
    openNewProjectModal,
    openTool,
    openSettings,
    openProjectSwitcher,
  ]);

  return {
    // State
    activePanel,
    activeTool,
    isCommandPaletteOpen,
    isSettingsOpen,
    isProjectSwitcherOpen,
    isNewProjectModalOpen,

    // Actions
    executeAction,

    // Panel controls
    openPanel,
    closePanel,
    togglePanel,

    // Tool controls
    openTool,
    closeTool,

    // Modal controls
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    openSettings,
    closeSettings,
    openProjectSwitcher,
    closeProjectSwitcher,
    openNewProjectModal,
    closeNewProjectModal,

    // Project actions
    createProject,
    selectProject,
    deleteProject,

    // Chat actions
    startNewChat,
    clearCurrentChat,
  };
}

export default useZenActions;
