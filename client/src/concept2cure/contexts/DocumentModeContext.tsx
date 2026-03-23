/**
 * @fileoverview Document Mode Context
 * @module concept2cure/contexts/DocumentModeContext
 * @version 1.0.0
 *
 * @description
 * Stage-aware document mode system. Maps workflow stages to canonical document
 * modes so that the editor, toolbar, and AnA panel behave correctly per stage.
 *
 * This is the missing layer between workflow stage and editor behavior.
 * Previously, document mode was controlled only by artifact lock status
 * (binary: locked or not). Now it is driven by the workflow stage the user
 * is in, with artifact status as a secondary override.
 *
 * Mode definitions:
 *   none     — no document canvas visible (e.g. Project Home)
 *   preview  — lightweight read-only snapshot, reduced toolbar (e.g. Dossier)
 *   view     — full read-only canvas, all toolbar except edit actions (e.g. Documents default)
 *   edit     — full editor with all toolbar actions (e.g. Section Workspace)
 *   readonly — hard lock, no edit affordance, no unlock button (e.g. Submissions)
 *
 * @compliance
 * - FDA 21 CFR Part 11: Mode transitions are auditable via onModeChange callback
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Canonical document mode — the single source of truth for editor behavior. */
export type DocumentMode = 'none' | 'preview' | 'view' | 'edit' | 'readonly';

/** Workflow stages in the biotech IND/eCTD authoring flow. */
export type WorkflowStage =
  | 'project-home'
  | 'dossier'
  | 'documents'
  | 'section-workspace'
  | 'review'
  | 'submissions';

/** Artifact status values that can override the stage default. */
export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'locked';

/** Configuration for how a mode affects editor capabilities. */
export interface ModeCapabilities {
  /** Whether the TipTap editor is editable */
  editable: boolean;
  /** Whether the full formatting toolbar is shown */
  showToolbar: boolean;
  /** Whether AI actions (rewrite, expand, etc.) are available */
  showAIActions: boolean;
  /** Whether the save action is available */
  canSave: boolean;
  /** Whether the user can toggle lock/unlock */
  canToggleLock: boolean;
  /** Whether slash commands are enabled */
  slashCommands: boolean;
  /** Whether the "Edit" escalation button is shown (for view mode) */
  showEditButton: boolean;
  /** Whether change tracking / review overlay is available */
  showReviewToggle: boolean;
  /** Whether the document canvas is visible at all */
  canvasVisible: boolean;
}

/** Reasons why an edit escalation might be denied. */
export interface EscalationResult {
  allowed: boolean;
  reason?: string;
}

/** Callback for mode change auditing. */
export type ModeChangeCallback = (
  from: DocumentMode,
  to: DocumentMode,
  trigger: 'stage-change' | 'user-escalation' | 'artifact-override' | 'explicit',
  metadata?: Record<string, unknown>,
) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE → MODE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default document mode for each workflow stage.
 * This is the core of the stage-aware mode system.
 */
const STAGE_DEFAULT_MODE: Record<WorkflowStage, DocumentMode> = {
  'project-home': 'none',
  'dossier': 'preview',
  'documents': 'view',
  'section-workspace': 'edit',
  'review': 'view',
  'submissions': 'readonly',
};

/**
 * Whether a stage allows user-initiated escalation to edit mode.
 * Only stages where editing is contextually appropriate return true.
 */
const STAGE_ALLOWS_EDIT_ESCALATION: Record<WorkflowStage, boolean> = {
  'project-home': false,
  'dossier': false,
  'documents': true,       // user can click "Edit" to enter edit mode
  'section-workspace': true, // already in edit, but allows re-escalation from locked
  'review': true,           // gated: only authorized reviewers on appropriate artifact state
  'submissions': false,     // hard lock — no editing
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODE → CAPABILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Map each document mode to its concrete editor capabilities. */
const MODE_CAPABILITIES: Record<DocumentMode, ModeCapabilities> = {
  none: {
    editable: false,
    showToolbar: false,
    showAIActions: false,
    canSave: false,
    canToggleLock: false,
    slashCommands: false,
    showEditButton: false,
    showReviewToggle: false,
    canvasVisible: false,
  },
  preview: {
    editable: false,
    showToolbar: false,
    showAIActions: false,
    canSave: false,
    canToggleLock: false,
    slashCommands: false,
    showEditButton: false,
    showReviewToggle: false,
    canvasVisible: true,
  },
  view: {
    editable: false,
    showToolbar: true,
    showAIActions: false,
    canSave: false,
    canToggleLock: false,
    slashCommands: false,
    showEditButton: true,
    showReviewToggle: false,
    canvasVisible: true,
  },
  edit: {
    editable: true,
    showToolbar: true,
    showAIActions: true,
    canSave: true,
    canToggleLock: true,
    slashCommands: true,
    showEditButton: false,
    showReviewToggle: true,
    canvasVisible: true,
  },
  readonly: {
    editable: false,
    showToolbar: true,
    showAIActions: false,
    canSave: false,
    canToggleLock: false,
    slashCommands: false,
    showEditButton: false,
    showReviewToggle: false,
    canvasVisible: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the effective document mode given stage, artifact status, and any
 * user-initiated override. Artifact status can only restrict, never escalate.
 *
 * Priority order:
 *   1. Artifact locked → always readonly (highest priority)
 *   2. User override (if stage allows escalation)
 *   3. Stage default
 */
export function resolveDocumentMode(
  stage: WorkflowStage,
  artifactStatus?: ArtifactStatus | string | null,
  userOverride?: DocumentMode | null,
): DocumentMode {
  // Locked artifact always wins — hard override
  if (artifactStatus === 'locked') {
    return 'readonly';
  }

  // Submissions stage is always readonly regardless of artifact status
  if (stage === 'submissions') {
    return 'readonly';
  }

  // If user has escalated (e.g. clicked "Edit") and the stage allows it
  if (userOverride && STAGE_ALLOWS_EDIT_ESCALATION[stage]) {
    // User cannot escalate beyond edit
    if (userOverride === 'edit' || userOverride === 'view') {
      return userOverride;
    }
  }

  // Fall through to stage default
  return STAGE_DEFAULT_MODE[stage];
}

/**
 * Check whether a user can escalate to edit mode in the current context.
 * In review stage, this checks artifact status (must be 'review' or 'draft').
 */
export function canEscalateToEdit(
  stage: WorkflowStage,
  artifactStatus?: ArtifactStatus | string | null,
): EscalationResult {
  if (!STAGE_ALLOWS_EDIT_ESCALATION[stage]) {
    return {
      allowed: false,
      reason: stage === 'submissions'
        ? 'Documents are locked during submission. Return to Section Workspace to edit.'
        : stage === 'dossier'
          ? 'Open the document in Section Workspace to edit.'
          : 'Editing is not available in this view.',
    };
  }

  if (artifactStatus === 'locked') {
    return {
      allowed: false,
      reason: 'This document is locked. Request unlock from an authorized reviewer.',
    };
  }

  if (artifactStatus === 'approved') {
    return {
      allowed: true,
      reason: 'This document is approved. Editing will reset it to draft status.',
    };
  }

  if (stage === 'review' && artifactStatus !== 'review' && artifactStatus !== 'draft') {
    return {
      allowed: false,
      reason: 'Document must be in review or draft status to edit during review.',
    };
  }

  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentModeContextValue {
  /** Current resolved document mode */
  mode: DocumentMode;
  /** Current workflow stage */
  stage: WorkflowStage;
  /** Capabilities derived from current mode */
  capabilities: ModeCapabilities;
  /** Current artifact status (if any) */
  artifactStatus: ArtifactStatus | string | null;

  /** Set the workflow stage — triggers mode resolution */
  setStage: (stage: WorkflowStage) => void;
  /** Set the artifact status — triggers mode resolution */
  setArtifactStatus: (status: ArtifactStatus | string | null) => void;
  /** User-initiated escalation to edit mode (gated by stage rules) */
  requestEdit: () => EscalationResult;
  /** User-initiated de-escalation back to stage default */
  exitEdit: () => void;
  /** Check if escalation to edit is possible without performing it */
  canEdit: () => EscalationResult;
  /** Force a specific mode (for advanced use — bypasses stage mapping) */
  forceMode: (mode: DocumentMode) => void;
  /** Get the default mode for a stage (utility) */
  getStageDefault: (stage: WorkflowStage) => DocumentMode;
}

const DocumentModeContext = createContext<DocumentModeContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentModeProviderProps {
  children: ReactNode;
  /** Initial workflow stage */
  initialStage?: WorkflowStage;
  /** Initial artifact status */
  initialArtifactStatus?: ArtifactStatus | string | null;
  /** Callback for mode change auditing (21 CFR Part 11) */
  onModeChange?: ModeChangeCallback;
}

export const DocumentModeProvider: React.FC<DocumentModeProviderProps> = ({
  children,
  initialStage = 'project-home',
  initialArtifactStatus = null,
  onModeChange,
}) => {
  const [stage, setStageInternal] = useState<WorkflowStage>(initialStage);
  const [artifactStatus, setArtifactStatusInternal] = useState<ArtifactStatus | string | null>(
    initialArtifactStatus,
  );
  const [userOverride, setUserOverride] = useState<DocumentMode | null>(null);

  // Resolve the current mode
  const mode = useMemo(
    () => resolveDocumentMode(stage, artifactStatus, userOverride),
    [stage, artifactStatus, userOverride],
  );

  // Derive capabilities from mode
  const capabilities = useMemo(() => MODE_CAPABILITIES[mode], [mode]);

  // Audit trail helper
  const emitChange = useCallback(
    (from: DocumentMode, to: DocumentMode, trigger: Parameters<ModeChangeCallback>[2], meta?: Record<string, unknown>) => {
      if (from !== to) {
        onModeChange?.(from, to, trigger, { stage, artifactStatus, ...meta });
      }
    },
    [onModeChange, stage, artifactStatus],
  );

  const setStage = useCallback(
    (newStage: WorkflowStage) => {
      const prevMode = resolveDocumentMode(stage, artifactStatus, userOverride);
      setStageInternal(newStage);
      setUserOverride(null); // reset user override on stage change
      const nextMode = resolveDocumentMode(newStage, artifactStatus, null);
      emitChange(prevMode, nextMode, 'stage-change', { fromStage: stage, toStage: newStage });
    },
    [stage, artifactStatus, userOverride, emitChange],
  );

  const setArtifactStatus = useCallback(
    (status: ArtifactStatus | string | null) => {
      const prevMode = resolveDocumentMode(stage, artifactStatus, userOverride);
      setArtifactStatusInternal(status);
      const nextMode = resolveDocumentMode(stage, status, userOverride);
      emitChange(prevMode, nextMode, 'artifact-override', { artifactStatus: status });
    },
    [stage, artifactStatus, userOverride, emitChange],
  );

  const requestEdit = useCallback((): EscalationResult => {
    const check = canEscalateToEdit(stage, artifactStatus);
    if (check.allowed) {
      const prevMode = mode;
      setUserOverride('edit');
      emitChange(prevMode, 'edit', 'user-escalation');
    }
    return check;
  }, [stage, artifactStatus, mode, emitChange]);

  const exitEdit = useCallback(() => {
    const prevMode = mode;
    setUserOverride(null);
    const nextMode = resolveDocumentMode(stage, artifactStatus, null);
    emitChange(prevMode, nextMode, 'user-escalation', { action: 'exit-edit' });
  }, [stage, artifactStatus, mode, emitChange]);

  const canEdit = useCallback(
    () => canEscalateToEdit(stage, artifactStatus),
    [stage, artifactStatus],
  );

  const forceMode = useCallback(
    (forcedMode: DocumentMode) => {
      const prevMode = mode;
      setUserOverride(forcedMode);
      emitChange(prevMode, forcedMode, 'explicit');
    },
    [mode, emitChange],
  );

  const getStageDefault = useCallback(
    (s: WorkflowStage) => STAGE_DEFAULT_MODE[s],
    [],
  );

  const value = useMemo<DocumentModeContextValue>(
    () => ({
      mode,
      stage,
      capabilities,
      artifactStatus,
      setStage,
      setArtifactStatus,
      requestEdit,
      exitEdit,
      canEdit,
      forceMode,
      getStageDefault,
    }),
    [mode, stage, capabilities, artifactStatus, setStage, setArtifactStatus, requestEdit, exitEdit, canEdit, forceMode, getStageDefault],
  );

  return (
    <DocumentModeContext.Provider value={value}>
      {children}
    </DocumentModeContext.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Access the full document mode context.
 * Must be used within a DocumentModeProvider.
 */
export function useDocumentMode(): DocumentModeContextValue {
  const ctx = useContext(DocumentModeContext);
  if (!ctx) {
    throw new Error('useDocumentMode must be used within a DocumentModeProvider');
  }
  return ctx;
}

/**
 * Convenience hook — returns just the current mode and capabilities.
 * Safe for components that only need to read mode, not change it.
 */
export function useDocumentModeRead(): Pick<DocumentModeContextValue, 'mode' | 'capabilities' | 'stage'> {
  const ctx = useDocumentMode();
  return useMemo(
    () => ({ mode: ctx.mode, capabilities: ctx.capabilities, stage: ctx.stage }),
    [ctx.mode, ctx.capabilities, ctx.stage],
  );
}

/**
 * Standalone hook for components outside the provider tree.
 * Uses optional context — returns fallback values if no provider.
 */
export function useDocumentModeOptional(): DocumentModeContextValue | null {
  return useContext(DocumentModeContext);
}

// Re-export constants for testing and external use
export { STAGE_DEFAULT_MODE, STAGE_ALLOWS_EDIT_ESCALATION, MODE_CAPABILITIES };
