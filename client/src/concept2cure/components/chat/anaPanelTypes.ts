/**
 * Type contracts for the AnA persistent chat panel.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split of
 * that 5K-line god component. Lives separately so subcomponents (and
 * future consumers) can share the same type vocabulary without having
 * to import from the monolithic file.
 *
 * NB: type-only — no runtime exports.
 *
 * @module client/src/concept2cure/components/chat/anaPanelTypes
 */

import type { AnaToolCallRecord } from '../../hooks/useAnaChatClient';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';

// Re-export so consumers have one place to import from for everything
// AnaPanel-related, rather than a mix of this file + the hook.
export type { AnaToolCallRecord } from '../../hooks/useAnaChatClient';

// ─── Conversation queue ──────────────────────────────────────────────────────

export type QueueWorkStatus =
  | 'queued'
  | 'working'
  | 'waiting_action'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface ConversationQueueItem {
  id: string;
  prompt: string;
  contextSnapshot: { projectId?: number | null; sectionCode?: string | null };
  status: QueueWorkStatus;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

// ─── Verdict & confidence signals (rendered as badges on assistant turns) ───

export interface VerdictSignal {
  type: 'verdict' | 'priority' | 'confidence' | 'action';
  label: string;
  color: string;
  bgColor: string;
}

export interface FollowUpChip {
  id: string;
  label: string;
  prompt: string;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Base64 images from Nano Banana */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Downloadable PPTX from Nano Banana */
  pptx?: { base64: string; filename: string; mimeType: string };
  /** Whether this message has been saved as an artifact */
  savedAsArtifact?: boolean;
  /** AI provider that generated this response */
  modelProvider?: string;
  /** AI model name that generated this response */
  modelName?: string;
  evidenceUsage?: {
    firecrawlRequested?: boolean;
    firecrawlUsed?: boolean;
    quotaConsumed?: number;
    quotaRemaining?: number;
  };
  /** Flag to highlight prompts restored for inline editing */
  recalledToInput?: boolean;
  /**
   * Tool invocations that fired while AnA produced this response. Each
   * card surfaces the tool name, arguments, and result inline so the
   * user can audit what the assistant actually did. Empty for text-only
   * responses or fallback-path (non-streaming) results.
   */
  toolCalls?: AnaToolCallRecord[];
}

// ─── Decision-status rail (top-of-panel summary) ────────────────────────────

export interface DecisionStatusRailState {
  loading: boolean;
  error: string | null;
  summary: string;
  pendingApprovals: number;
  pendingConfirmations: number;
  unresolvedContradictions: boolean;
  provisional: boolean;
  needsReapproval: boolean;
  needsEscalation: boolean;
  blockedCount: number;
  count: number;
  details: Array<{
    id: string;
    status: string;
    kind: string;
    summary: string;
  }>;
}

// ─── Suggested actions (empty-state quick-start chips) ──────────────────────

export interface SuggestedAction {
  id: string;
  label: string;
  intent?: string;
  description?: string;
}

// ─── AnA RI orchestration (server-emitted intent / workstream metadata) ────

export type IntentLens = 'auto' | 'audit' | 'improve' | 'risk' | 'strategy' | 'compare';

export type AIProviderChoice = 'auto' | 'anthropic' | 'openai' | 'moonshot';

export interface AIProviderOption {
  id: AIProviderChoice;
  label: string;
  description: string;
  color: string;
  activeColor: string;
}

export interface IntentLensOption {
  id: IntentLens;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export interface AnaRIOrchestration {
  detectedIntent: { lens: IntentLens; confidence: number; signals: string[] };
  detectedSubmissionType: string | null;
  appliedRole: string;
  activeWorkstream?: {
    stream: string;
    phase: string;
    objective: string;
    currentFocus?: string;
    blockers?: string[];
    nextStep?: string;
    collaborationMode?: 'drive' | 'coauthor' | 'advise';
  };
  workstreamHandoff?: {
    from: string;
    to: string;
    carryForward: string[];
    openLoops: string[];
    transitionReason: string;
  } | null;
  suggestedActions: string[];
  meta?: {
    workstreamContextInjected?: boolean;
    workstreamHandoffInjected?: boolean;
  };
}

// ─── Document actions (post-response one-click derived artifacts) ──────────

export type DocumentActionType =
  | 'risk_memo'
  | 'deficiency_preemption_memo'
  | 'evidence_memo'
  | 'strategy_note'
  | 'reviewer_question_brief'
  | 'rewritten_section'
  | 'revised_artifact'
  | 'attach_to_dossier';

export interface DocumentActionConfig {
  type: DocumentActionType;
  label: string;
  icon: React.ReactNode;
}

// ─── Slash-command palette ──────────────────────────────────────────────────

export interface SlashCommand {
  command: string;
  description: string;
  category: string;
}

// ─── Panel props ────────────────────────────────────────────────────────────

export interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    organizationId?: string | number;
    customInstructions?: string;
    /** Page-specific context for deeper awareness (active tab, filters, etc.) */
    moduleContext?: Record<string, unknown>;
    /** Optional thread to hydrate on mount/switch for deterministic resume */
    threadId?: string;
  };
  /** Canonical authoring context — section/artifact/workflow awareness for AnA */
  authoringContext?: AuthoringContextPack | null;
  /** Suggested actions shown as quick-start chips when conversation is empty */
  suggestedActions?: SuggestedAction[];
  /** Greeting text shown when no messages */
  greeting?: string;
  /** Initial message to auto-send on mount */
  initialMessage?: string | null;
  /** Callback when user triggers a suggested action */
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
    /** Failure detail, present when status is 'failed' */
    error?: string;
  }) => void;
  /** Navigate to a layout mode or path */
  onNavigate?: (path: string) => void;
  /** Open the new-project modal */
  onCreateProject?: () => void;
  /** Projects list for home display */
  projects?: Array<{ id: string; name: string; type: string; updatedAt?: string | Date }>;
  /** Navigate to a specific project */
  onSelectProject?: (projectId: string) => void;
  /** Insert draft content into the governed editor (P1) */
  onDraftInsert?: (content: string, title: string, ctdSection?: string) => void;
  /** Navigate to a specific section (P2) */
  onNavigateToSection?: (sectionCode: string) => void;
  /** Open a specific artifact in the editor (P2) */
  onOpenArtifact?: (artifactId: string) => void;
  /** Request governed promotion of current artifact (P5) */
  onRequestPromotion?: (artifactId: string) => Promise<{
    promoted: boolean;
    message: string;
    /** Approvals still required before the promotion is fully governed */
    pendingApprovals?: Array<{ requiredRole: string; reason: string }>;
    /** Governance decision identifier, when the promotion was recorded */
    decisionId?: string;
    /** Authority context attached to the governance decision */
    authority?: { level?: string };
  }>;
  /** Open the version compare inspector panel (P4) */
  onOpenCompareInspector?: () => void;
  /** Refresh authoring intelligence (readiness/contradictions) after actions */
  onRefreshIntelligence?: () => void;
  /** Notify parent when active thread context changes */
  onThreadChange?: (threadId?: string) => void;
  /**
   * "full" = fills all available space with full conversation + composer
   * "compact" = just the input bar at bottom, conversation expands as overlay
   */
  mode?: 'full' | 'compact';
  /** Pre-select the chat mode (standard, deep-research, or nano-banana) */
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
  /** Project intelligence stats for enriched greeting */
  projectIntelligence?: {
    documentCount: number;
    signalCount: number;
    readinessScore: number | null;
    memoryAtomCount: number;
    /** Enriched from useProjectIntelligence + useNextBestActions */
    recommendations?: Array<{ id: string; title: string; severity: string; category: string }>;
    nextActions?: Array<{ id: string; title: string; priority: string; reason: string }>;
    riskFactors?: Array<{ description: string; likelihood: string; impact: string }>;
    openQuestions?: Array<{ question: string; priority: string; context: string }>;
  };
}
