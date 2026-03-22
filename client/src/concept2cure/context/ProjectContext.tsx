/**
 * Concept2Cure - Project Context
 * 
 * Central state management for Projects following the Claude.ai pattern.
 * Provides project persistence, conversation management, and artifact tracking.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type {
  Project,
  Conversation,
  Artifact,
  SubmissionType,
  UIState,
  Message,
  ProjectKnowledge,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// STATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectState {
  projects: Project[];
  conversations: Conversation[];
  artifacts: Artifact[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  activeArtifactId: string | null;
  ui: UIState;
  userProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
}

interface UserProfile {
  role?: string;
  objectives?: string[];
  criteria?: string[];
  preferences?: Record<string, string | number | boolean>;
  updatedAt?: string;
}

type ProjectAction =
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> } }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_ACTIVE_PROJECT'; payload: string | null }
  | { type: 'SET_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_CONVERSATION'; payload: { id: string; updates: Partial<Conversation> } }
  | { type: 'SET_ACTIVE_CONVERSATION'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'EDIT_MESSAGE'; payload: { conversationId: string; messageId: string; content: string } }
  | { type: 'SET_ARTIFACTS'; payload: Artifact[] }
  | { type: 'ADD_ARTIFACT'; payload: Artifact }
  | { type: 'UPDATE_ARTIFACT'; payload: { id: string; updates: Partial<Artifact> } }
  | { type: 'SET_ACTIVE_ARTIFACT'; payload: string | null }
  | { type: 'TOGGLE_ARTIFACT_PANEL'; payload?: boolean }
  | { type: 'SET_ARTIFACT_PANEL_WIDTH'; payload: number }
  | { type: 'TOGGLE_SIDEBAR'; payload?: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' | 'system' }
  | { type: 'SET_USER_PROFILE'; payload: UserProfile | null }
  | { type: 'UPDATE_USER_PROFILE'; payload: Partial<UserProfile> };

const initialUIState: UIState = {
  sidebarCollapsed: false,
  activeProjectId: null,
  activeConversationId: null,
  activeArtifactId: null,
  artifactPanelVisible: false,
  artifactPanelWidth: 50,
  chatInputFocused: false,
  isTyping: false,
  theme: 'light',
};

const initialState: ProjectState = {
  projects: [],
  conversations: [],
  artifacts: [],
  activeProjectId: null,
  activeConversationId: null,
  activeArtifactId: null,
  ui: initialUIState,
  userProfile: null,
  isLoading: false,
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// REDUCER
// ─────────────────────────────────────────────────────────────────────────────

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
      };

    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload),
        activeProjectId: state.activeProjectId === action.payload ? null : state.activeProjectId,
      };

    case 'SET_ACTIVE_PROJECT':
      return {
        ...state,
        activeProjectId: action.payload,
        ui: { ...state.ui, activeProjectId: action.payload },
      };

    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload };

    case 'ADD_CONVERSATION':
      return { ...state, conversations: [...state.conversations, action.payload] };

    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
        ),
      };

    case 'SET_ACTIVE_CONVERSATION':
      return {
        ...state,
        activeConversationId: action.payload,
        ui: { ...state.ui, activeConversationId: action.payload },
      };

    case 'ADD_MESSAGE': {
      const { conversationId, message } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === conversationId
            ? { ...c, messages: [...c.messages, message], updatedAt: new Date() }
            : c
        ),
      };
    }

    case 'EDIT_MESSAGE': {
      const { conversationId, messageId, content } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === messageId
                    ? {
                        ...m,
                        content,
                        edited: true,
                        editedAt: new Date(),
                        originalContent: m.originalContent || m.content,
                      }
                    : m
                ),
              }
            : c
        ),
      };
    }

    case 'SET_ARTIFACTS':
      return { ...state, artifacts: action.payload };

    case 'ADD_ARTIFACT':
      return { ...state, artifacts: [...state.artifacts, action.payload] };

    case 'UPDATE_ARTIFACT':
      return {
        ...state,
        artifacts: state.artifacts.map(a =>
          a.id === action.payload.id ? { ...a, ...action.payload.updates } : a
        ),
      };

    case 'SET_ACTIVE_ARTIFACT':
      return {
        ...state,
        activeArtifactId: action.payload,
        ui: {
          ...state.ui,
          activeArtifactId: action.payload,
          artifactPanelVisible: action.payload !== null,
        },
      };

    case 'TOGGLE_ARTIFACT_PANEL':
      return {
        ...state,
        ui: {
          ...state.ui,
          artifactPanelVisible:
            action.payload !== undefined ? action.payload : !state.ui.artifactPanelVisible,
        },
      };

    case 'SET_ARTIFACT_PANEL_WIDTH':
      return {
        ...state,
        ui: { ...state.ui, artifactPanelWidth: action.payload },
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        ui: {
          ...state.ui,
          sidebarCollapsed:
            action.payload !== undefined ? action.payload : !state.ui.sidebarCollapsed,
        },
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_THEME':
      return { ...state, ui: { ...state.ui, theme: action.payload } };

    case 'SET_USER_PROFILE':
      return { ...state, userProfile: action.payload };

    case 'UPDATE_USER_PROFILE':
      return {
        ...state,
        userProfile: {
          ...state.userProfile,
          ...action.payload,
          updatedAt: new Date().toISOString(),
        },
      };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  state: ProjectState;
  
  // Project actions
  createProject: (name: string, type: SubmissionType, description?: string) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  updateProjectKnowledge: (projectId: string, knowledge: Partial<ProjectKnowledge>) => void;
  
  // Conversation actions
  createConversation: (projectId: string, title?: string) => Promise<Conversation>;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'conversationId' | 'timestamp'>) => Message;
  editMessage: (conversationId: string, messageId: string, content: string) => void;
  forkConversation: (conversationId: string, fromMessageId: string) => Promise<Conversation>;
  
  // Artifact actions
  createArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'versions'>) => Artifact;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
  setActiveArtifact: (id: string | null) => void;
  publishArtifact: (id: string, isPublic?: boolean) => Promise<string>;
  remixArtifact: (id: string, projectId: string) => Promise<Artifact>;
  
  // UI actions
  toggleSidebar: (collapsed?: boolean) => void;
  toggleArtifactPanel: (visible?: boolean) => void;
  setArtifactPanelWidth: (width: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setUserProfile: (profile: UserProfile | null) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  
  // Computed values
  activeProject: Project | null;
  activeConversation: Conversation | null;
  activeArtifact: Artifact | null;
  projectConversations: Conversation[];
  projectArtifacts: Artifact[];
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectProviderProps {
  children: React.ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(projectReducer, initialState);

  // Generate unique IDs
  const generateId = () => crypto.randomUUID();

  // ─────────────────────────────────────────────────────────────────────────
  // PROJECT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const createProject = useCallback(
    async (name: string, type: SubmissionType, description?: string): Promise<Project> => {
      const now = new Date();
      const project: Project = {
        id: generateId(),
        name,
        type,
        description,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
        conversationCount: 0,
        artifactCount: 0,
        knowledge: {
          documents: [],
          context: '',
        },
        status: 'active',
      };

      dispatch({ type: 'ADD_PROJECT', payload: project });
      dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });

      // Create initial conversation
      const conversation = await createConversation(project.id, 'Welcome');
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conversation.id });

      return project;
    },
    [createConversation]
  );

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: { ...updates, updatedAt: new Date() } } });
  }, []);

  const deleteProject = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, []);

  const setActiveProject = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: id });
    
    // Load conversations for this project
    if (id) {
      const projectConvos = state.conversations.filter(c => c.projectId === id);
      if (projectConvos.length > 0) {
        // Set most recent conversation as active
        const mostRecent = projectConvos.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: mostRecent.id });
      }
    }
  }, [state.conversations]);

  const updateProjectKnowledge = useCallback(
    (projectId: string, knowledge: Partial<ProjectKnowledge>) => {
      const project = state.projects.find(p => p.id === projectId);
      if (project) {
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: {
            id: projectId,
            updates: {
              knowledge: { ...project.knowledge, ...knowledge },
              updatedAt: new Date(),
            },
          },
        });
      }
    },
    [state.projects]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSATION ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const createConversation = useCallback(
    async (projectId: string, title?: string): Promise<Conversation> => {
      const now = new Date();
      const conversation: Conversation = {
        id: generateId(),
        projectId,
        title: title || 'New conversation',
        createdAt: now,
        updatedAt: now,
        messages: [],
        artifacts: [],
      };

      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });

      // Update project conversation count
      const project = state.projects.find(p => p.id === projectId);
      if (project) {
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: {
            id: projectId,
            updates: {
              conversationCount: project.conversationCount + 1,
              lastActiveAt: now,
            },
          },
        });
      }

      return conversation;
    },
    [state.projects]
  );

  const setActiveConversation = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: id });
  }, []);

  const addMessage = useCallback(
    (
      conversationId: string,
      messageData: Omit<Message, 'id' | 'conversationId' | 'timestamp'>
    ): Message => {
      const message: Message = {
        ...messageData,
        id: generateId(),
        conversationId,
        timestamp: new Date(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId, message } });
      return message;
    },
    []
  );

  const editMessage = useCallback(
    (conversationId: string, messageId: string, content: string) => {
      dispatch({ type: 'EDIT_MESSAGE', payload: { conversationId, messageId, content } });
    },
    []
  );

  const forkConversation = useCallback(
    async (conversationId: string, fromMessageId: string): Promise<Conversation> => {
      const originalConvo = state.conversations.find(c => c.id === conversationId);
      if (!originalConvo) {
        throw new Error('Conversation not found');
      }

      const messageIndex = originalConvo.messages.findIndex(m => m.id === fromMessageId);
      if (messageIndex === -1) {
        throw new Error('Message not found');
      }

      const now = new Date();
      const forkedConversation: Conversation = {
        id: generateId(),
        projectId: originalConvo.projectId,
        title: `${originalConvo.title} (forked)`,
        createdAt: now,
        updatedAt: now,
        messages: originalConvo.messages.slice(0, messageIndex + 1).map(m => ({
          ...m,
          id: generateId(),
        })),
        artifacts: [],
        parentConversationId: conversationId,
        forkPointMessageId: fromMessageId,
      };

      dispatch({ type: 'ADD_CONVERSATION', payload: forkedConversation });
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: forkedConversation.id });

      return forkedConversation;
    },
    [state.conversations]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ARTIFACT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const createArtifact = useCallback(
    (
      artifactData: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'versions'>
    ): Artifact => {
      const now = new Date();
      const artifact: Artifact = {
        ...artifactData,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        version: 1,
        versions: [
          {
            version: 1,
            content: artifactData.content,
            createdAt: now,
          },
        ],
      };

      dispatch({ type: 'ADD_ARTIFACT', payload: artifact });
      dispatch({ type: 'SET_ACTIVE_ARTIFACT', payload: artifact.id });

      // Update conversation artifacts list
      dispatch({
        type: 'UPDATE_CONVERSATION',
        payload: {
          id: artifactData.conversationId,
          updates: {
            artifacts: [
              ...(state.conversations.find(c => c.id === artifactData.conversationId)?.artifacts ||
                []),
              artifact.id,
            ],
          },
        },
      });

      // Update project artifact count
      const project = state.projects.find(p => p.id === artifactData.projectId);
      if (project) {
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: {
            id: artifactData.projectId,
            updates: { artifactCount: project.artifactCount + 1 },
          },
        });
      }

      return artifact;
    },
    [state.conversations, state.projects]
  );

  const updateArtifact = useCallback(
    (id: string, updates: Partial<Artifact>) => {
      const artifact = state.artifacts.find(a => a.id === id);
      if (artifact && updates.content && updates.content !== artifact.content) {
        // Create new version
        const newVersion = {
          version: artifact.version + 1,
          content: updates.content,
          createdAt: new Date(),
        };

        dispatch({
          type: 'UPDATE_ARTIFACT',
          payload: {
            id,
            updates: {
              ...updates,
              version: newVersion.version,
              versions: [...artifact.versions, newVersion],
              updatedAt: new Date(),
            },
          },
        });
      } else {
        dispatch({
          type: 'UPDATE_ARTIFACT',
          payload: { id, updates: { ...updates, updatedAt: new Date() } },
        });
      }
    },
    [state.artifacts]
  );

  const setActiveArtifact = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_ARTIFACT', payload: id });
  }, []);

  const publishArtifact = useCallback(async (id: string, isPublic = false): Promise<string> => {
    const shareLink = `${window.location.origin}/artifact/${id}`;
    dispatch({
      type: 'UPDATE_ARTIFACT',
      payload: {
        id,
        updates: {
          published: true,
          publishedAt: new Date(),
          shareLink,
          isPublic,
        },
      },
    });
    return shareLink;
  }, []);

  const remixArtifact = useCallback(
    async (id: string, targetProjectId: string): Promise<Artifact> => {
      const original = state.artifacts.find(a => a.id === id);
      if (!original) {
        throw new Error('Artifact not found');
      }

      // Get or create a conversation for the remix
      let targetConversation = state.conversations.find(
        c => c.projectId === targetProjectId && c.title === 'Remixed artifacts'
      );
      if (!targetConversation) {
        targetConversation = await createConversation(targetProjectId, 'Remixed artifacts');
      }

      const remixedArtifact = createArtifact({
        projectId: targetProjectId,
        conversationId: targetConversation.id,
        type: original.type,
        category: original.category,
        title: `${original.title} (remix)`,
        content: original.content,
        remixedFrom: id,
      });

      // Update original's remix count
      dispatch({
        type: 'UPDATE_ARTIFACT',
        payload: {
          id,
          updates: { remixCount: (original.remixCount || 0) + 1 },
        },
      });

      return remixedArtifact;
    },
    [state.artifacts, state.conversations, createConversation, createArtifact]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // UI ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const toggleSidebar = useCallback((collapsed?: boolean) => {
    dispatch({ type: 'TOGGLE_SIDEBAR', payload: collapsed });
  }, []);

  const toggleArtifactPanel = useCallback((visible?: boolean) => {
    dispatch({ type: 'TOGGLE_ARTIFACT_PANEL', payload: visible });
  }, []);

  const setArtifactPanelWidth = useCallback((width: number) => {
    dispatch({ type: 'SET_ARTIFACT_PANEL_WIDTH', payload: Math.max(20, Math.min(80, width)) });
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    dispatch({ type: 'SET_THEME', payload: theme });
  }, []);

  const setUserProfile = useCallback((profile: UserProfile | null) => {
    dispatch({ type: 'SET_USER_PROFILE', payload: profile });
  }, []);

  const updateUserProfile = useCallback((profile: Partial<UserProfile>) => {
    dispatch({ type: 'UPDATE_USER_PROFILE', payload: profile });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPUTED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  const activeProject = state.projects.find(p => p.id === state.activeProjectId) || null;
  const activeConversation =
    state.conversations.find(c => c.id === state.activeConversationId) || null;
  const activeArtifact = state.artifacts.find(a => a.id === state.activeArtifactId) || null;
  const projectConversations = state.conversations.filter(
    c => c.projectId === state.activeProjectId
  );
  const projectArtifacts = state.artifacts.filter(a => a.projectId === state.activeProjectId);

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE (localStorage for now, could be API later)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Load from localStorage on mount
    const savedState = localStorage.getItem('concept2cure_state');
    const savedProfile = localStorage.getItem('concept2cure_user_profile');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.projects) dispatch({ type: 'SET_PROJECTS', payload: parsed.projects });
        if (parsed.conversations)
          dispatch({ type: 'SET_CONVERSATIONS', payload: parsed.conversations });
        if (parsed.artifacts) dispatch({ type: 'SET_ARTIFACTS', payload: parsed.artifacts });
      } catch (e) {
        console.error('Failed to load saved state:', e);
      }
    }
    if (savedProfile) {
      try {
        dispatch({ type: 'SET_USER_PROFILE', payload: JSON.parse(savedProfile) });
      } catch (e) {
        console.error('Failed to load saved user profile:', e);
      }
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: Event) => {
      const storageEvent = event as { key?: string; newValue?: string | null };
      if (storageEvent.key === 'concept2cure_user_profile' && storageEvent.newValue) {
        try {
          dispatch({ type: 'SET_USER_PROFILE', payload: JSON.parse(storageEvent.newValue) });
        } catch (e) {
          console.error('Failed to sync user profile:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    // Save to localStorage on state change
    const toSave = {
      projects: state.projects,
      conversations: state.conversations,
      artifacts: state.artifacts,
    };
    localStorage.setItem('concept2cure_state', JSON.stringify(toSave));
    if (state.userProfile) {
      localStorage.setItem('concept2cure_user_profile', JSON.stringify(state.userProfile));
    }
  }, [state.projects, state.conversations, state.artifacts, state.userProfile]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT VALUE
  // ─────────────────────────────────────────────────────────────────────────

  const value: ProjectContextValue = {
    state,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject,
    updateProjectKnowledge,
    createConversation,
    setActiveConversation,
    addMessage,
    editMessage,
    forkConversation,
    createArtifact,
    updateArtifact,
    setActiveArtifact,
    publishArtifact,
    remixArtifact,
    toggleSidebar,
    toggleArtifactPanel,
    setArtifactPanelWidth,
    setTheme,
    setUserProfile,
    updateUserProfile,
    activeProject,
    activeConversation,
    activeArtifact,
    projectConversations,
    projectArtifacts,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

export { ProjectContext };
