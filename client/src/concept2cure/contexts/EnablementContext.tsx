import React from 'react';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
// Enablement data registry was removed during the Phase 1/2 design-system
// port. Local stubs keep this provider compiling until a new source ships.
type ContextProfile = any;
const LEARNING_PATHS: any[] = [];
const LEARNING_MODULES: any[] = [];
const CERTIFICATIONS: any[] = [];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleProgress {
  started: boolean;
  completed: boolean;
  completedAt: string | null;
}

export interface PathProgress {
  started: boolean;
  modulesCompleted: number;
  totalModules: number;
}

export interface CertificationProgress {
  earned: boolean;
  modulesCompleted: number;
  requiredModules: number;
}

export type DrSageTab =
  | 'help'
  | 'guide'
  | 'guide-me'
  | 'do-it'
  | 'ask-ana'
  | 'fix'
  | 'learn'
  | 'discover';

export interface EnablementState {
  userProgress: Record<string, ModuleProgress>;
  pathProgress: Record<string, PathProgress>;
  certificationProgress: Record<string, CertificationProgress>;
  activePath: string | null;
  drSagePanelOpen: boolean;
  drSageActiveTab: DrSageTab;
  enablementCenterOpen: boolean;
  contextProfile: ContextProfile;
  currentLayoutMode: string;
}

export interface EnablementContextValue extends EnablementState {
  openDrSagePanel: (tab?: DrSageTab) => void;
  closeDrSagePanel: () => void;
  openEnablementCenter: () => void;
  closeEnablementCenter: () => void;
  setActiveTab: (tab: DrSageTab) => void;
  completeModule: (moduleId: string) => void;
  startPath: (pathId: string) => void;
  updateContextProfile: (partial: Partial<ContextProfile>) => void;
  setLayoutMode: (mode: string) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT_PROFILE: ContextProfile = {
  productType: '',
  userRole: '',
  clientType: '',
  activeProject: undefined,
  activeModule: undefined,
  workflowStage: undefined,
};

const STORAGE_KEY = 'concept2cure-enablement';

function buildInitialModuleProgress(): Record<string, ModuleProgress> {
  const map: Record<string, ModuleProgress> = {};
  for (const mod of LEARNING_MODULES) {
    map[mod.id] = { started: false, completed: false, completedAt: null };
  }
  return map;
}

function buildInitialPathProgress(): Record<string, PathProgress> {
  const map: Record<string, PathProgress> = {};
  for (const path of LEARNING_PATHS) {
    map[path.id] = {
      started: false,
      modulesCompleted: 0,
      totalModules: path.moduleIds.length,
    };
  }
  return map;
}

function buildInitialCertProgress(): Record<string, CertificationProgress> {
  const map: Record<string, CertificationProgress> = {};
  for (const cert of CERTIFICATIONS) {
    map[cert.id] = {
      earned: false,
      modulesCompleted: 0,
      requiredModules: cert.requiredModuleIds.length,
    };
  }
  return map;
}

function getInitialState(): EnablementState {
  return {
    userProgress: buildInitialModuleProgress(),
    pathProgress: buildInitialPathProgress(),
    certificationProgress: buildInitialCertProgress(),
    activePath: null,
    drSagePanelOpen: false,
    drSageActiveTab: 'help',
    enablementCenterOpen: false,
    contextProfile: DEFAULT_CONTEXT_PROFILE,
    currentLayoutMode: 'default',
  };
}

function loadState(): EnablementState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EnablementState>;
      const initial = getInitialState();
      return {
        ...initial,
        ...parsed,
        // Merge maps so new modules/paths/certs added after storage are included
        userProgress: { ...initial.userProgress, ...(parsed.userProgress ?? {}) },
        pathProgress: { ...initial.pathProgress, ...(parsed.pathProgress ?? {}) },
        certificationProgress: {
          ...initial.certificationProgress,
          ...(parsed.certificationProgress ?? {}),
        },
        contextProfile: { ...initial.contextProfile, ...(parsed.contextProfile ?? {}) },
      };
    }
  } catch {
    // Ignore parse errors; fall through to defaults.
  }
  return getInitialState();
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EnablementContext = createContext<EnablementContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EnablementProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EnablementState>(loadState);

  // Persist to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable; silently ignore.
    }
  }, [state]);

  // -- Dr. Sage Panel --

  const openDrSagePanel = useCallback((tab?: DrSageTab) => {
    setState((prev) => ({
      ...prev,
      drSagePanelOpen: true,
      drSageActiveTab: tab ?? prev.drSageActiveTab,
    }));
  }, []);

  const closeDrSagePanel = useCallback(() => {
    setState((prev) => ({ ...prev, drSagePanelOpen: false }));
  }, []);

  const setActiveTab = useCallback((tab: DrSageTab) => {
    setState((prev) => ({ ...prev, drSageActiveTab: tab }));
  }, []);

  // -- Enablement Center --

  const openEnablementCenter = useCallback(() => {
    setState((prev) => ({ ...prev, enablementCenterOpen: true }));
  }, []);

  const closeEnablementCenter = useCallback(() => {
    setState((prev) => ({ ...prev, enablementCenterOpen: false }));
  }, []);

  // -- Module Completion --

  const completeModule = useCallback((moduleId: string) => {
    setState((prev) => {
      const userProgress = {
        ...prev.userProgress,
        [moduleId]: {
          started: true,
          completed: true,
          completedAt: new Date().toISOString(),
        },
      };

      // Recalculate path progress
      const pathProgress = { ...prev.pathProgress };
      for (const path of LEARNING_PATHS) {
        const completed = path.moduleIds.filter(
          (mid) => userProgress[mid]?.completed,
        ).length;
        pathProgress[path.id] = {
          ...pathProgress[path.id],
          modulesCompleted: completed,
          totalModules: path.moduleIds.length,
        };
      }

      // Recalculate certification progress
      const certificationProgress = { ...prev.certificationProgress };
      for (const cert of CERTIFICATIONS) {
        const completed = cert.requiredModuleIds.filter(
          (mid) => userProgress[mid]?.completed,
        ).length;
        certificationProgress[cert.id] = {
          earned: completed >= cert.requiredModuleIds.length,
          modulesCompleted: completed,
          requiredModules: cert.requiredModuleIds.length,
        };
      }

      return { ...prev, userProgress, pathProgress, certificationProgress };
    });
  }, []);

  // -- Start Path --

  const startPath = useCallback((pathId: string) => {
    setState((prev) => {
      const path = LEARNING_PATHS.find((p) => p.id === pathId);
      if (!path) return prev;

      // Mark path as started
      const pathProgress = {
        ...prev.pathProgress,
        [pathId]: { ...prev.pathProgress[pathId], started: true },
      };

      // Mark first module as started (if not already)
      const firstModuleId = path.moduleIds[0];
      const userProgress = { ...prev.userProgress };
      if (firstModuleId && userProgress[firstModuleId] && !userProgress[firstModuleId].started) {
        userProgress[firstModuleId] = { ...userProgress[firstModuleId], started: true };
      }

      return { ...prev, activePath: pathId, pathProgress, userProgress };
    });
  }, []);

  // -- Context Profile --

  const updateContextProfile = useCallback((partial: Partial<ContextProfile>) => {
    setState((prev) => ({
      ...prev,
      contextProfile: { ...prev.contextProfile, ...partial },
    }));
  }, []);

  // -- Layout Mode --

  const setLayoutMode = useCallback((mode: string) => {
    setState((prev) => ({ ...prev, currentLayoutMode: mode }));
  }, []);

  // -- Assemble Value --

  const value: EnablementContextValue = {
    ...state,
    openDrSagePanel,
    closeDrSagePanel,
    openEnablementCenter,
    closeEnablementCenter,
    setActiveTab,
    completeModule,
    startPath,
    updateContextProfile,
    setLayoutMode,
  };

  return (
    <EnablementContext.Provider value={value}>
      {children}
    </EnablementContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEnablement(): EnablementContextValue {
  const ctx = useContext(EnablementContext);
  if (!ctx) {
    throw new Error('useEnablement must be used within an EnablementProvider');
  }
  return ctx;
}
