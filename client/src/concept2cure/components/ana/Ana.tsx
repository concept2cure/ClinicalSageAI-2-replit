/**
 * Ana — Phase 2 AnA RI chat shell.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx.
 * The bundle is the design authority; Claude Code is the implementer.
 *
 * Deviations from the bundle (all user-approved; bundle-consistent styling):
 *   - Real streaming via useAnaChat hook against /api/ana-ri/stream (bundle
 *     uses a 600ms timeout + hardcoded HTML for demo).
 *   - Stop button visibility on the composer while streaming.
 *   - Latency chip, degraded-mode badge, stopped badge in message header.
 *   - executedActions rendered as action chips below the assistant reply.
 *   - User messages support inline edit-and-regenerate.
 *   - Account / recents come from real app state, not bundle demo values.
 *
 * No new design tokens or selectors — every style used exists in the bundle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { apiRequest } from '@/lib/queryClient';
import { isFeatureEnabled } from '@/flags/featureFlags';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';

import { Sidebar, type AnaView, type AccountInfo, type Recent } from './Sidebar';
import { TopBar } from './TopBar';
import { EmptyState, type EmptySuggestion } from './EmptyState';
import { ChatView, type ChatMessageView } from './ChatView';
import type { ExecutedActionChip } from './Message';
import { ProjectsView, type AnaProject } from './ProjectsView';
import { DocumentStudioPane, type DocumentStudioDraft } from './DocumentStudioPane';
import { LabelingAuthoringPane, type LabelingDraft } from './LabelingAuthoringPane';
import { type LabelingMode } from './labelingModes';
import type { BriefingBookPremortemResult } from './BriefingBookPanel';
import { composeVerificationFixMessage } from './VerificationPanel';
import { aggregateReadiness, type ReadinessGate, type BlockingItem } from './ectdReadiness';
import {
  SAMPLE_ASSEMBLED_M2_5,
  SAMPLE_ASSEMBLED_M5_3_5,
  SAMPLE_STRUCTURAL_OK,
  SAMPLE_STRUCTURAL_FAIL,
  SAMPLE_CONSISTENCY_CLEAN,
  SAMPLE_CONSISTENCY_BLOCKER,
} from './ectdReadinessFixtures';
import { composeConsistencyFixMessage } from './ConsistencyPanel';
import type { SafetyNarrativeSubmit } from './SafetyNarrativeAffordance';
import { useAnaChat, type AnaChatMessage, type MessageAttachment, type VerificationResult, type ConsistencyResult } from './useAnaChat';
import type { EffortLevel } from './ModelEffortPicker';
import { useVerifiedSeal, type SealMeaning, type VerifiedSeal } from './useVerifiedSeal';
import { useRecents } from './useRecents';
import styles from './styles.module.css';

export interface AnaProps {
  /** Signed-in user. When absent, the account chip shows a neutral "You" — never a fabricated identity. */
  user?: Partial<AccountInfo>;
  /** Real recents list from the thread DB. Empty when none exist. */
  recents?: Recent[];
  /** Real projects from the project DB. Empty when none exist. */
  projects?: AnaProject[];
  /** Active project id so context is scoped for streaming. */
  activeProjectId?: string | null;
  /** Active project name for the context block. */
  activeProjectName?: string | null;
  /** Submission type passed into the route-context. */
  submissionType?: string | null;
  /** User role for role-inference. */
  userRole?: string | null;
  /** Screen name for the server-side context block. */
  screenName?: string | null;
  /**
   * Optional draft message to auto-send on mount. Used by Concept2CureHome
   * to hand off the home-composer draft when the user clicks send from
   * the home page. The caller should nil out the draft via
   * onInitialMessageConsumed once Ana takes it to prevent re-send on
   * remount.
   */
  initialMessage?: string | null;
  /** Fired once when initialMessage has been consumed + sent. */
  onInitialMessageConsumed?: () => void;
  /** Navigate to a specific artifact (from action chip clicks). */
  onOpenArtifact?: (artifactId: string) => void;
  /** Navigate to a specific CTD section. */
  onNavigateToSection?: (sectionCode: string) => void;
  /** Navigate to a specific project card. */
  onSelectProject?: (projectId: string) => void;
  /** Fired when the user creates a new project. */
  onCreateProject?: () => void;

  /* ─────────────────────────────────────────────────────────────
     Host-integration props (replace the legacy AnaPersistentPanel
     contract so existing ZenApp call sites work against Ana without
     capability loss).
     ───────────────────────────────────────────────────────────── */
  /** Override the default "Good morning, {name}" line on the empty state. */
  greeting?: string;
  /** Override the default empty-state suggestion pill list (context-specific chips). */
  suggestedActions?: ReadonlyArray<EmptySuggestion | { id?: string; label: string; intent?: string; iconKey?: EmptySuggestion['iconKey'] }>;
  /** Authoring context forwarded into the stream request (section/artifact awareness). */
  authoringContext?: AuthoringContextPack | null;
  /** Extra per-surface context object forwarded to the stream. */
  moduleContext?: Record<string, unknown>;
  /** Organization id forwarded to the stream (multi-tenant scope). */
  organizationId?: string | number;
  /** Custom instructions forwarded to the stream. */
  customInstructions?: string;
  /** Pinned thread id to hydrate on mount. */
  threadId?: string | null;
  /** Project intelligence stats (readiness, signal count, etc.) forwarded into context. */
  projectIntelligence?: {
    documentCount: number;
    signalCount: number;
    readinessScore: number | null;
    memoryAtomCount: number;
    recommendations?: Array<{ id: string; title: string; severity: string; category: string }>;
    nextActions?: Array<{ id: string; title: string; priority: string; reason: string }>;
    riskFactors?: Array<{ description: string; likelihood: string; impact: string }>;
    openQuestions?: Array<{ question: string; priority: string; context: string }>;
  };
  /** Notify parent when the active thread id changes. */
  onThreadChange?: (threadId?: string) => void;
  /** Notify parent when a suggested action is triggered. */
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
  }) => void;
  /** Navigate handler forwarded from action chip clicks that target a path. */
  onNavigate?: (path: string) => void;
  /** Insert a draft into the governed editor. Called when an action produces inline content. */
  onDraftInsert?: (content: string, title: string, ctdSection?: string) => void;
  /** Request governed promotion of an artifact. */
  onRequestPromotion?: (artifactId: string) => Promise<{ promoted: boolean; message: string }>;
  /** Open the version compare inspector. */
  onOpenCompareInspector?: () => void;
  /** Refresh authoring intelligence after actions complete. */
  onRefreshIntelligence?: () => void;
  /**
   * Kept for API parity with the legacy AnaPersistentPanel — the Claude
   * Design chat shell always renders in full mode; compact mode is not
   * part of the bundle. This prop is accepted but ignored.
   */
  mode?: 'full' | 'compact';
  /**
   * Kept for API parity — chat mode selection is not part of the Claude
   * Design chat shell. Accepted but ignored.
   */
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
  /** Alias for `initialMessage`. If both are set, `initialMessage` wins. */
  externalMessage?: string | null;
  /** Context profile object (legacy shape). If provided, its fields override the flat props. */
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    organizationId?: string | number;
    customInstructions?: string;
    moduleContext?: Record<string, unknown>;
    threadId?: string;
  };
  /** Legacy nav-context label (mapped to screenName). */
  navContext?: string;
}

// Derive avatar initials from a display name. Used when the host does not
// supply explicit initials. Never invents a name — falls back to a neutral
// single glyph so the account chip stays truthful for a new/unknown user.
function deriveInitials(name?: string | null): string {
  const parts = (name || '').split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map(p => p[0]?.toUpperCase() ?? '').join('');
  return initials || 'U';
}

// Trigger a browser download for a blob without leaking the object URL.
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// A filesystem-safe stem from a document title.
function safeFileStem(title: string): string {
  return (title || 'document').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';
}

// Client-side display labels for server DocumentActionType values.
// Server emits the raw type in `orchestration.suggestedActions`; we render
// human labels and use the lowercased verb form to build the follow-up msg.
const SUGGESTED_ACTION_LABELS: Record<string, string> = {
  risk_memo: 'Create a risk memo',
  deficiency_preemption_memo: 'Create a deficiency preemption memo',
  evidence_memo: 'Create an evidence memo',
  strategy_note: 'Draft a strategy note',
  reviewer_question_brief: 'Prepare a reviewer question brief',
  rewritten_section: 'Rewrite the section',
  revised_artifact: 'Revise the artifact',
  attach_to_dossier: 'Attach to the dossier',
};

export function Ana({
  user,
  recents,
  projects,
  activeProjectId,
  activeProjectName,
  submissionType,
  userRole,
  screenName = 'ana-ri',
  initialMessage,
  onInitialMessageConsumed,
  onOpenArtifact,
  onNavigateToSection,
  onSelectProject,
  onCreateProject,
  greeting,
  suggestedActions,
  authoringContext,
  moduleContext,
  organizationId: _organizationId,
  customInstructions: _customInstructions,
  threadId: pinnedThreadId,
  projectIntelligence,
  onThreadChange,
  onActionRun: _onActionRun,
  onNavigate,
  onDraftInsert,
  onRequestPromotion: _onRequestPromotion,
  onOpenCompareInspector: _onOpenCompareInspector,
  onRefreshIntelligence,
  mode: _mode,
  defaultChatMode: _defaultChatMode,
  externalMessage,
  contextProfile,
  navContext,
}: AnaProps) {
  // contextProfile (legacy object shape) overrides the flat props when set.
  const resolvedProjectId = contextProfile?.projectId ?? activeProjectId ?? null;
  const resolvedProjectName = contextProfile?.activeProject ?? activeProjectName ?? null;
  const resolvedScreenName = contextProfile?.screenName ?? navContext ?? screenName;
  const resolvedUserRole = contextProfile?.userRole ?? userRole ?? null;
  const resolvedThreadId = pinnedThreadId ?? contextProfile?.threadId ?? null;

  const account: AccountInfo = {
    name: user?.name || 'You',
    initials: user?.initials || deriveInitials(user?.name),
    plan: user?.plan || '',
  };

  // Live recents from /api/chat/threads. Empty until the thread DB returns
  // rows — no demo fixtures (a new user sees an empty recents list, not
  // fabricated threads).
  const { recents: liveRecents } = useRecents({ projectId: resolvedProjectId });
  const recentsList: Recent[] =
    recents && recents.length > 0 ? recents : liveRecents;
  const projectList = projects ?? [];

  const [view, setView] = useState<AnaView>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);
  // Tools the user pins for the next turn (additive focus). Empty = auto.
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  // Model/effort picker state (flag-gated in the Composer). Effort defaults to
  // 'balanced'; modelOverride null = Auto (server routes by effort).
  const [effort, setEffort] = useState<EffortLevel>('balanced');
  const [modelOverride, setModelOverride] = useState<string | null>(null);

  const chat = useAnaChat({
    projectId: resolvedProjectId,
    projectName: resolvedProjectName,
    screenName: resolvedScreenName,
    userRole: resolvedUserRole,
    submissionType,
    authoringContext: authoringContext ?? undefined,
    moduleContext: moduleContext ?? undefined,
    selectedTools,
    effortLevel: effort,
    modelOverride,
  });

  // Notify host when the active thread id changes (legacy parity with
  // AnaPersistentPanel.onThreadChange). Fires for new threads created by
  // send() and for explicit loadThread() hydrations.
  useEffect(() => {
    if (!onThreadChange) return;
    onThreadChange(chat.threadId ?? undefined);
  }, [chat.threadId, onThreadChange]);

  // Hydrate the pinned thread id if the host supplies one on mount.
  const pinnedThreadHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resolvedThreadId) return;
    if (pinnedThreadHydratedRef.current === resolvedThreadId) return;
    pinnedThreadHydratedRef.current = resolvedThreadId;
    setView('chat');
    void chat.loadThread(resolvedThreadId);
  }, [resolvedThreadId, chat]);

  // When a stream completes, give the host a chance to refresh dependent
  // intelligence data (readiness, signals, etc.).
  const prevStreamingRef = useRef(chat.isStreaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.isStreaming;
    if (wasStreaming && !chat.isStreaming) {
      onRefreshIntelligence?.();
    }
  }, [chat.isStreaming, onRefreshIntelligence]);

  // Normalize legacy suggestedActions into the EmptyState suggestion shape.
  const emptySuggestions = useMemo<ReadonlyArray<EmptySuggestion> | undefined>(() => {
    if (!suggestedActions || suggestedActions.length === 0) return undefined;
    return suggestedActions.map(a => ({
      label: a.label,
      iconKey: 'iconKey' in a ? a.iconKey : undefined,
    }));
  }, [suggestedActions]);

  const handleSend = useCallback(
    (text: string, attachments?: MessageAttachment[]) => {
      setView('chat');
      void chat.send(text, attachments);
    },
    [chat]
  );

  // E5 — guided Safety Narrative submit. Pins the draft→author→verify tool set
  // (additive focus) and sends the composed message through the normal stream
  // path, so the existing tool_use / tool_result / verification handling drives
  // the author→verify QC loop. The three tools are orchestrated, not rebuilt.
  // BUILD-1 INTEGRATION: `payload.cases` carries the case set so that, once
  // Build 1 lands version persistence, each finished QC-clear narrative can be
  // persisted as a version row here. Persistence is intentionally not wired yet.
  const handleSafetyNarrative = useCallback(
    (payload: SafetyNarrativeSubmit) => {
      setSelectedTools(prev => Array.from(new Set([...prev, ...payload.tools])));
      setView('chat');
      void chat.send(payload.message);
    },
    [chat]
  );

  const handleIntelligenceAnswer = useCallback(
    (flowState: any, nodeId: string, answers: Record<string, unknown>) => {
      const payload = JSON.stringify({ flow_state: flowState, node_id: nodeId, answers });
      void chat.send(`[INTELLIGENCE_ANSWER]${payload}`);
    },
    [chat]
  );

  const handleIntelligenceAction = useCallback(
    (actionType: string) => {
      void chat.send(`Please proceed with: ${actionType}`);
    },
    [chat]
  );

  const handleWarGameRemediate = useCallback(
    (findingId: string, findingTitle: string) => {
      void chat.send(
        `Please help me address this war game finding: "${findingTitle}" (finding ID: ${findingId}). ` +
        `What specific changes should I make to resolve this issue and strengthen my submission?`
      );
    },
    [chat]
  );

  // Auto-send a handed-off draft from the home composer. `externalMessage` is
  // the legacy alias (AnaPersistentPanel); `initialMessage` wins if both set.
  // Guarded with a ref so remounts (React strict-mode, router re-mount) can't
  // fire it twice.
  const effectiveInitialMessage = initialMessage ?? externalMessage ?? null;
  const initialMessageConsumedRef = useRef(false);
  useEffect(() => {
    const seed = typeof effectiveInitialMessage === 'string' ? effectiveInitialMessage.trim() : '';
    if (!seed || initialMessageConsumedRef.current || chat.isStreaming) return;
    initialMessageConsumedRef.current = true;
    setView('chat');
    void chat.send(seed);
    onInitialMessageConsumed?.();
  }, [effectiveInitialMessage, chat, onInitialMessageConsumed]);

  const handleNewChat = useCallback(() => {
    chat.reset();
    setActiveRecentId(null);
    setView('home');
  }, [chat]);

  // Clicking a Recents row hydrates that thread's messages and drops into
  // chat view. Streaming gets aborted by loadThread itself.
  const handleSelectRecent = useCallback(
    (threadId: string) => {
      setActiveRecentId(threadId);
      setView('chat');
      void chat.loadThread(threadId);
    },
    [chat]
  );

  const handleCopy = useCallback((_id: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
  }, []);

  // Export the entire chat as a markdown document — the regulatory audit
  // trail use case. Filename includes the date for easy filing.
  const handleExport = useCallback(() => {
    if (chat.messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const lines: string[] = [
      `# AnA · Reg Intelligence — ${activeProjectName || 'Conversation'}`,
      ``,
      `_Exported ${new Date().toLocaleString()}_`,
      ``,
    ];
    for (const m of chat.messages) {
      lines.push(m.role === 'user' ? `## User` : `## AnA`);
      lines.push('');
      lines.push(m.text);
      lines.push('');
      if (m.executedActions && m.executedActions.length > 0) {
        lines.push(
          `_Actions: ${m.executedActions.map(a => a.label).join(', ')}_`
        );
        lines.push('');
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ana-conversation-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [chat.messages, activeProjectName]);

  const handleRetry = useCallback(
    (messageId: string) => {
      // Walk back to the user prompt that produced this assistant reply and
      // re-send it. Drops the failed/stopped reply.
      const idx = chat.messages.findIndex(m => m.id === messageId);
      if (idx < 0) return;
      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (chat.messages[i].role === 'user') {
          userIdx = i;
          break;
        }
      }
      if (userIdx < 0) return;
      const priorText = chat.messages[userIdx].text;
      chat.reset();
      // reset clears the message list; we have to send fresh.
      void chat.send(priorText);
    },
    [chat]
  );

  const handleEditRegenerate = useCallback(
    (_messageId: string, newText: string) => {
      chat.reset();
      void chat.send(newText);
    },
    [chat]
  );

  const handleFeedback = useCallback(
    (messageId: string, positive: boolean) => {
      // Fire-and-forget — if the endpoint is down or the table hasn't been
      // created yet the server logs and returns success; we don't block the UI.
      const threadId = chat.threadId;
      apiRequest('POST', '/api/concept2cure/feedback', {
        messageId,
        positive,
        conversationId: threadId || undefined,
      }).catch(err => {
        console.warn('[Ana] feedback submit failed:', err?.message);
      });
    },
    [chat.threadId]
  );

  const handleActionClick = useCallback(
    (
      _messageId: string,
      action: {
        actionType?: string;
        artifactId?: string;
        sectionCode?: string;
        path?: string;
        draftContent?: string;
        draftTitle?: string;
      },
    ) => {
      if (action.actionType === 'open_in_editor' && action.draftContent && onDraftInsert) {
        onDraftInsert(action.draftContent, action.draftTitle || 'Generated document');
      } else if (action.artifactId && onOpenArtifact) {
        onOpenArtifact(action.artifactId);
      } else if (action.sectionCode && onNavigateToSection) {
        onNavigateToSection(action.sectionCode);
      } else if (action.path && onNavigate) {
        onNavigate(action.path);
      }
    },
    [onOpenArtifact, onNavigateToSection, onNavigate, onDraftInsert]
  );

  // A tap on a suggested action pill sends a follow-up user message that
  // triggers the corresponding document action via the normal stream path
  // (guidance executor picks up the intent and creates the artifact).
  const handleSuggestedAction = useCallback(
    (actionType: string) => {
      const label = SUGGESTED_ACTION_LABELS[actionType] || actionType;
      void chat.send(`Please ${label.toLowerCase()} based on our discussion.`);
    },
    [chat]
  );

  const messagesForView = useMemo<ChatMessageView[]>(
    () =>
      chat.messages.map((m: AnaChatMessage) => {
        // Surface a tool-generated document as an "Open in editor" chip,
        // alongside any server-side executed actions.
        const baseActions = (m.executedActions as ExecutedActionChip[] | undefined) ?? [];
        const draftAction: ExecutedActionChip[] = m.generatedDraft
          ? [{
              label: `Open "${m.generatedDraft.title}" in editor`,
              actionType: 'open_in_editor',
              draftContent: m.generatedDraft.content,
              draftTitle: m.generatedDraft.title,
              executed: true,
            }]
          : [];
        const mergedActions = [...baseActions, ...draftAction];
        return {
        id: m.id,
        role: m.role,
        text: m.text,
        attachments: m.attachments,
        streaming: m.streaming,
        statusPhase: m.statusPhase,
        executedActions: mergedActions.length > 0 ? mergedActions : undefined,
        latencyMs: m.latencyMs,
        fallback: m.fallback,
        stopped: m.stopped,
        detectedLens: m.detectedLens,
        suggestedActions: m.suggestedActions,
        thinking: m.thinking,
        evidence: m.evidence,
        warnings: m.warnings,
        toolCalls: m.toolCalls,
        sentAt: m.sentAt,
        intelligenceQuestion: m.intelligenceQuestion,
        intelligenceFlowState: m.intelligenceFlowState,
        intelligenceFlowComplete: m.intelligenceFlowComplete,
        warGameReport: m.warGameReport,
        };
      }),
    [chat.messages]
  );

  const greetingName = account.name.split(' ')[0] || account.name;

  /* ─────────────────────────────────────────────────────────────
     AnA Document Studio — split-pane preview of the active draft +
     its "verified against your source" trust-panel. Flag-gated.
     ───────────────────────────────────────────────────────────── */
  const studioEnabled = isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO');

  // The active document is the one whose most recent draft is the latest draft
  // in the conversation. Its "versions" are every draft this session that
  // carries the same title, oldest→newest — so successive AnA rewrites become
  // v1, v2, v3 the user can flip between.
  // Durable, cross-session version history fetched from the governed artifact
  // store, keyed by external artifact id. Populated once a draft reports a
  // persisted `artifactId` (server `artifact_version_saved`). Preferred over the
  // in-session grouping below so a reloaded thread shows real version lineage.
  const [persistedVersions, setPersistedVersions] = useState<
    Record<string, { content: string }[]>
  >({});

  const activeDocument = useMemo<{
    id: string;
    title: string;
    documentType?: string;
    artifactId?: string;
    versions: { content: string; verification?: VerificationResult; consistency?: ConsistencyResult; briefingPremortem?: BriefingBookPremortemResult }[];
  } | null>(() => {
    if (!studioEnabled) return null;
    let latestTitle: string | null = null;
    let latestId: string | null = null;
    let latestType: string | undefined;
    let latestArtifactId: string | undefined;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const d = chat.messages[i].generatedDraft;
      if (d) {
        latestTitle = d.title;
        latestId = chat.messages[i].id;
        latestType = d.documentType;
        latestArtifactId = d.artifactId;
        break;
      }
    }
    if (latestTitle == null || latestId == null) return null;

    // Prefer the durable persisted version history when available for this
    // artifact; fall back to the per-session grouping (same-title drafts) so the
    // pane still works before/without persistence.
    const persisted = latestArtifactId ? persistedVersions[latestArtifactId] : undefined;
    if (persisted && persisted.length > 0) {
      // Carry the latest in-session verification onto the newest version so the
      // "verified against your source" panel still shows when applicable.
      const versions: { content: string; verification?: VerificationResult; consistency?: ConsistencyResult; briefingPremortem?: BriefingBookPremortemResult }[] =
        persisted.map(v => ({ content: v.content }));
      let latestVerification: VerificationResult | undefined;
      let latestConsistency: ConsistencyResult | undefined;
      let latestBriefingPremortem: BriefingBookPremortemResult | undefined;
      for (const m of chat.messages) {
        if (m.generatedDraft && m.generatedDraft.title === latestTitle) {
          if (m.verification) latestVerification = m.verification;
          if (m.consistency) latestConsistency = m.consistency;
          if (m.briefingPremortem) latestBriefingPremortem = m.briefingPremortem;
        }
      }
      if (versions.length > 0 && (latestVerification || latestConsistency || latestBriefingPremortem)) {
        versions[versions.length - 1] = {
          ...versions[versions.length - 1],
          verification: latestVerification,
          consistency: latestConsistency,
          briefingPremortem: latestBriefingPremortem,
        };
      }
      return {
        id: latestId,
        title: latestTitle,
        documentType: latestType,
        artifactId: latestArtifactId,
        versions,
      };
    }

    const versions: { content: string; verification?: VerificationResult; consistency?: ConsistencyResult; briefingPremortem?: BriefingBookPremortemResult }[] = [];
    for (const m of chat.messages) {
      if (m.generatedDraft && m.generatedDraft.title === latestTitle) {
        versions.push({
          content: m.generatedDraft.content,
          verification: m.verification,
          // The dossier-consistency sweep that ran on the turn that produced
          // this draft (author_docx_native / surgical_docx_xml_edit → sweep).
          consistency: m.consistency,
          briefingPremortem: m.briefingPremortem,
        });
      }
    }
    return {
      id: latestId,
      title: latestTitle,
      documentType: latestType,
      artifactId: latestArtifactId,
      versions,
    };
  }, [studioEnabled, chat.messages, persistedVersions]);

  // Fetch the durable version history whenever a draft reports a persisted
  // artifactId we haven't loaded yet (or its version count changed). Failures
  // are silent — the in-session grouping remains the fallback.
  useEffect(() => {
    if (!studioEnabled) return;
    const seen = new Set<string>();
    for (const m of chat.messages) {
      const d = m.generatedDraft;
      if (!d?.artifactId || seen.has(d.artifactId)) continue;
      seen.add(d.artifactId);
      const artifactId = d.artifactId;
      const knownCount = persistedVersions[artifactId]?.length ?? 0;
      if (typeof d.version === 'number' && d.version <= knownCount) continue;
      void (async () => {
        try {
          const res = await fetch(
            `/api/conversation-os/artifacts/${encodeURIComponent(artifactId)}/document-versions`,
          );
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.versions)) return;
          const versions = data.versions
            .filter((v: unknown): v is { content: string } =>
              Boolean(v) && typeof (v as { content?: unknown }).content === 'string',
            )
            .map((v: { content: string }) => ({ content: v.content }));
          if (versions.length === 0) return;
          setPersistedVersions(prev => ({ ...prev, [artifactId]: versions }));
        } catch {
          /* silent — fall back to in-session grouping */
        }
      })();
    }
  }, [studioEnabled, chat.messages, persistedVersions]);

  // The pane auto-opens for each new draft; the user can close it, and it
  // re-opens (showing the latest version) when a *different* draft arrives.
  const [studioClosed, setStudioClosed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [versionIndex, setVersionIndex] = useState(0);
  const lastDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = activeDocument?.id ?? null;
    if (id && id !== lastDraftIdRef.current) {
      lastDraftIdRef.current = id;
      setStudioClosed(false);
      setVersionIndex((activeDocument?.versions.length ?? 1) - 1);
    }
  }, [activeDocument?.id, activeDocument?.versions.length]);

  const studioOpen = Boolean(activeDocument) && !studioClosed && view === 'chat';

  // The version currently shown (clamped), and the draft/verification for it.
  // Memoized so they stay referentially stable across renders (the resolve
  // callback depends on them).
  const safeVersionIndex = activeDocument
    ? Math.max(0, Math.min(versionIndex, activeDocument.versions.length - 1))
    : 0;
  const shownDraft = useMemo<DocumentStudioDraft | null>(
    () =>
      activeDocument
        ? {
            title: activeDocument.title,
            documentType: activeDocument.documentType,
            content: activeDocument.versions[safeVersionIndex]?.content ?? '',
          }
        : null,
    [activeDocument, safeVersionIndex],
  );
  const shownVerification = useMemo(
    () => activeDocument?.versions[safeVersionIndex]?.verification,
    [activeDocument, safeVersionIndex],
  );
  const shownConsistency = useMemo(
    () => activeDocument?.versions[safeVersionIndex]?.consistency,
    [activeDocument, safeVersionIndex],
  );

  /* ─────────────────────────────────────────────────────────────
     E9 — Build-from-template labeling authoring. When the active draft is a
     product label (USPI/PLR or SmPC/QRD), the right pane becomes the labeling
     authoring surface: a US↔EU mode toggle, the mandatory section guard, the
     deterministic currency gate (review_label_currency), and source
     verification (required_strings = mandatory section headers). The currency
     verdict is never inferred client-side — it is the server's finding set.
     ───────────────────────────────────────────────────────────── */
  const detectedLabelingMode = useMemo<LabelingMode | null>(() => {
    const t = (activeDocument?.documentType || '').toLowerCase();
    if (/uspi|\bplr\b|us pi|prescribing information/.test(t)) return 'us';
    if (/smpc|\bspc\b|\bqrd\b|summary of product characteristics/.test(t)) return 'eu';
    return null;
  }, [activeDocument?.documentType]);
  const [labelingModeOverride, setLabelingModeOverride] = useState<LabelingMode | null>(null);
  const labelingMode: LabelingMode = labelingModeOverride ?? detectedLabelingMode ?? 'us';
  const isLabelingDraft = detectedLabelingMode != null;

  /* ─────────────────────────────────────────────────────────────
     E11 — IND narrative-module (CTD Module 2.5 / 2.7) verified authoring.
     When the active draft is a CTD Module 2 clinical summary, the Studio offers
     the IND-module affordance: author from the structured source, then verify
     with required_strings that include every source figure, so a transcription
     error is caught before the user signs + seals the persisted version.
     ───────────────────────────────────────────────────────────── */
  const detectedIndModule = useMemo<string | null>(() => {
    const t = `${activeDocument?.documentType || ''} ${activeDocument?.title || ''}`.toLowerCase();
    if (/\b2\.7\b|clinical summary/.test(t)) return '2.7';
    if (/\b2\.5\b|clinical overview/.test(t)) return '2.5';
    return null;
  }, [activeDocument?.documentType, activeDocument?.title]);

  // BUILD-1 INTEGRATION: the deterministic currency verdict from
  // review_label_currency (and the seal/export → version-row persistence) wire
  // in here. Until then the gate is undefined (panel simply not shown), so the
  // honesty contract still blocks export of sample/unverified drafts.
  // INTEGRATION: live currencyVerdict join.
  const labelingCurrencyVerdict = undefined;

  const shownLabelingDraft = useMemo<LabelingDraft | null>(
    () =>
      shownDraft
        ? {
            title: shownDraft.title,
            content: shownDraft.content,
            // Honesty contract: absent a live data join, drafts are sample and
            // therefore non-exportable. Set 'live' only when joined to live label
            // data (INTEGRATION).
            dataSource: 'sample',
          }
        : null,
    [shownDraft],
  );

  const shownBriefingPremortem = useMemo(
    () => activeDocument?.versions[safeVersionIndex]?.briefingPremortem,
    [activeDocument, safeVersionIndex],
  );

  // Download the rendered draft as a Word file. Calls the server DOCX render
  // route; on any failure, falls back to an honest Markdown download so the
  // action never silently no-ops. (See ANA_DOCUMENT_STUDIO_UI_SPEC for the
  // render contract the host backend fulfils.)
  const handleDownloadDocx = useCallback(async (draft: DocumentStudioDraft) => {
    setDownloading(true);
    try {
      const res = await fetch('/api/docx-factory/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, markdown: draft.content, format: 'docx' }),
      });
      if (!res.ok) throw new Error(`render failed: ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, `${safeFileStem(draft.title)}.docx`);
    } catch (err) {
      console.warn('[Ana] DOCX render unavailable; downloading source as Markdown:', (err as Error)?.message);
      downloadBlob(new Blob([draft.content], { type: 'text/markdown' }), `${safeFileStem(draft.title)}.md`);
    } finally {
      setDownloading(false);
    }
  }, []);

  // Close the verification loop: when a document failed verification, send AnA
  // a targeted fix request citing exactly what diverged, then it re-verifies.
  const handleResolveVerification = useCallback(() => {
    if (!shownDraft || !shownVerification || shownVerification.ok) return;
    void chat.send(composeVerificationFixMessage(shownDraft.title, shownVerification));
  }, [chat, shownDraft, shownVerification]);

  /* ─────────────────────────────────────────────────────────────
     E10 — One-turn eCTD Module 2/5 assembly + readiness gate.
     The single audited action assembles the selected module from the
     project's artifacts (assemble_ectd_module_from_artifacts) and runs the
     structural (validate_docx) + consistency (check_dossier_consistency)
     readiness checks over the assembled output, then aggregates them into a
     blocking gate. The gate must be green BEFORE the seal / PDUFA-clock step.
     ───────────────────────────────────────────────────────────── */
  const [readinessGate, setReadinessGate] = useState<ReadinessGate | undefined>();
  const [assembling, setAssembling] = useState(false);

  const handleAssembleModule = useCallback(
    async (moduleNumber: string) => {
      setAssembling(true);
      try {
        // INTEGRATION: replace the fixtures below with the live tool envelopes.
        // The real flow runs three already-built tools, in order, over the SSE
        // orchestration layer and maps their JSON results into the client
        // shapes (assemble_ectd_module_from_artifacts → AssembledModuleResult,
        // validate_docx → StructuralReadiness, check_dossier_consistency →
        // ConsistencyReadiness). This component only ORCHESTRATES + AGGREGATES;
        // it must not change how those tools work (eCTD/CSR guardrail).
        //
        //   const assembled = mapAssembled(await runTool('assemble_ectd_module_from_artifacts',
        //     { project_id: resolvedProjectId, module_number: moduleNumber }));
        //   const structural = mapStructural(await runTool('validate_docx',
        //     { input_docx_path: assembled.output.path }));
        //   const consistency = mapConsistency(await runTool('check_dossier_consistency',
        //     { project_id: resolvedProjectId, ctd_section: moduleNumber, draft_content: assembled.text }));
        const assembled =
          moduleNumber === '5.3.5' ? SAMPLE_ASSEMBLED_M5_3_5 : SAMPLE_ASSEMBLED_M2_5;
        // Sample fixtures intentionally vary so reviewers see both gate states;
        // the honesty contract still refuses to seal them (sample: true).
        const structural = moduleNumber === '5.3.5' ? SAMPLE_STRUCTURAL_FAIL : SAMPLE_STRUCTURAL_OK;
        const consistency =
          moduleNumber === '5.3.5' ? SAMPLE_CONSISTENCY_BLOCKER : SAMPLE_CONSISTENCY_CLEAN;
        const gate = aggregateReadiness({ assembled, structural, consistency });
        // BUILD-1 INTEGRATION: once Build 1 lands, persist the assembled module
        // + this readiness verdict as a new version row (assembled_module_version)
        // here — the gate verdict (gate.gate, gate.blockingItems, gate.sealable)
        // is the audit payload the version carries into the 21 CFR Part 11 trail.
        setReadinessGate(gate);
      } finally {
        setAssembling(false);
      }
    },
    [],
  );

  const handleReadinessSubmit = useCallback(() => {
    // The gate's seal button is disabled unless sealable, so this is only ever
    // reached for a green, non-sample gate. Defense-in-depth: re-check here so a
    // programmatic call can never bypass the honesty contract.
    if (!readinessGate?.sealable) return;
    // INTEGRATION: invoke the PDUFA-clock submission step here once Build 1
    // exposes the sealed-submission action. Until then this is a no-op guard.
  }, [readinessGate]);

  const handleFollowReadinessLink = useCallback((item: BlockingItem) => {
    // INTEGRATION: route to the deep link target. For a CTD section, scroll the
    // relevant artifact into view / open it; for an output path, open the
    // assembled module. Logged for now so the affordance is observable.
    console.info('[Ana] readiness deep-link followed:', item.deepLink?.target);
  }, []);

  // Reset the gate when the active document changes — a gate certifies the
  // module it was run for, never a different draft.
  useEffect(() => {
    setReadinessGate(undefined);
  }, [activeDocument?.id]);

  // Close the consistency loop: when the draft diverges from the dossier, send
  // AnA a targeted reconciliation request citing the conflicting values and
  // their source artifacts, then it re-runs the sweep. Suppressed for clean
  // verdicts and for sample-derived (non-sealable) drafts.
  const handleResolveConsistency = useCallback(() => {
    if (!shownDraft || !shownConsistency) return;
    if (shownConsistency.verdict === 'clean' || shownConsistency.isSample) return;
    void chat.send(composeConsistencyFixMessage(shownDraft.title, shownConsistency));
  }, [chat, shownDraft, shownConsistency]);

  // E1 — Part 11 verified-and-sealed export. When a version verifies clean, the
  // VerificationPanel offers "Sign and seal verified version". We persist the
  // SealedRecord server-side, then keep the applied seal per version index so
  // the SealBadge stays put when the user flips between versions. Only wired
  // when the studio flag is on.
  const { seal: sealVerified } = useVerifiedSeal();
  const [appliedSeals, setAppliedSeals] = useState<Record<number, VerifiedSeal>>({});
  const shownSeal = appliedSeals[safeVersionIndex] ?? null;
  const handleSeal = useCallback(
    async (input: {
      printedName: string;
      meaning: SealMeaning;
      reasonForChange: string;
      password: string;
      mfaToken?: string;
    }): Promise<VerifiedSeal | null> => {
      if (!shownDraft || !shownVerification?.ok) return null;
      // Build-1 seal binding (E11): when Build 1 has persisted this document, the
      // active document carries its EXTERNAL artifact id and the version history
      // is the durable, oldest→newest list — so the version SHOWN at
      // `safeVersionIndex` is persisted version number `safeVersionIndex + 1`.
      // Thread both so the server seals the EXISTING persisted row, not a
      // fallback. (When no persisted artifactId exists yet — an in-session-only
      // draft — these stay undefined and the server falls back as before.)
      const persistedArtifactId = activeDocument?.artifactId;
      const existingVersionNumber = persistedArtifactId ? safeVersionIndex + 1 : undefined;
      const result = await sealVerified({
        title: shownDraft.title,
        content: shownDraft.content,
        verification: { ok: shownVerification.ok, message: shownVerification.message },
        projectId: resolvedProjectId ?? undefined,
        signerRole: resolvedUserRole ?? undefined,
        artifactExternalId: persistedArtifactId,
        existingVersionNumber,
        ...input,
      });
      if (result) {
        const idx = safeVersionIndex;
        setAppliedSeals(prev => ({ ...prev, [idx]: result }));
      }
      return result;
    },
    [sealVerified, shownDraft, shownVerification, resolvedProjectId, resolvedUserRole, safeVersionIndex, activeDocument?.artifactId],
  );

  // The view content (home / chat / projects / artifacts). Rendered directly
  // when the studio is closed, or inside the left Panel when it is open — so
  // the chat layout is identical in both modes.
  const viewContent = (
    <>
      {view === 'home' && (
        <EmptyState
          greetingName={greetingName}
          onSend={handleSend}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          greeting={greeting}
          suggestions={emptySuggestions}
          projectId={resolvedProjectId ?? undefined}
          selectedTools={selectedTools}
          onSelectedToolsChange={setSelectedTools}
          effort={effort}
          onEffortChange={setEffort}
          modelOverride={modelOverride}
          onModelOverrideChange={setModelOverride}
          projectIntelligence={projectIntelligence}
          onSafetyNarrative={handleSafetyNarrative}
        />
      )}
      {view === 'chat' && (
        <ChatView
          messages={messagesForView}
          onSend={handleSend}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          onCopy={handleCopy}
          onRetry={handleRetry}
          onFeedback={handleFeedback}
          onActionClick={handleActionClick}
          onEditRegenerate={handleEditRegenerate}
          onSuggestedAction={handleSuggestedAction}
          suggestedActionLabels={SUGGESTED_ACTION_LABELS}
          projectId={resolvedProjectId ?? undefined}
          selectedTools={selectedTools}
          onSelectedToolsChange={setSelectedTools}
          effort={effort}
          onEffortChange={setEffort}
          modelOverride={modelOverride}
          onModelOverrideChange={setModelOverride}
          onSafetyNarrative={handleSafetyNarrative}
          onIntelligenceAnswer={handleIntelligenceAnswer}
          onIntelligenceAction={handleIntelligenceAction}
          onWarGameRemediate={handleWarGameRemediate}
        />
      )}
      {view === 'projects' && (
        <ProjectsView
          projects={projectList}
          onSelect={id => {
            onSelectProject?.(id);
          }}
          onNew={onCreateProject}
        />
      )}
      {view === 'artifacts' && (
        <ProjectsView projects={projectList} onSelect={id => onSelectProject?.(id)} />
      )}
    </>
  );

  return (
    <div className={styles.shell} data-collapsed={collapsed ? 'true' : 'false'}>
      <Sidebar
        view={view}
        setView={setView}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        recents={recentsList}
        account={account}
        onNewChat={handleNewChat}
        onSelectRecent={handleSelectRecent}
        activeRecentId={activeRecentId}
      />
      <main className={styles.main}>
        <TopBar
          view={view}
          canExport={view === 'chat' && chat.messages.length > 0}
          onExport={handleExport}
        />
        {studioOpen && shownDraft && activeDocument ? (
          <PanelGroup
            direction="horizontal"
            className={styles.studioLayout}
            autoSaveId="ana-document-studio"
          >
            <Panel defaultSize={54} minSize={32} className={styles.studioChat}>
              {viewContent}
            </Panel>
            <PanelResizeHandle className={styles.studioResize} aria-label="Resize document preview" />
            <Panel defaultSize={46} minSize={28}>
              {isLabelingDraft && shownLabelingDraft ? (
                <LabelingAuthoringPane
                  mode={labelingMode}
                  onModeChange={setLabelingModeOverride}
                  draft={shownLabelingDraft}
                  currencyVerdict={labelingCurrencyVerdict}
                  verification={shownVerification}
                  onResolveVerification={handleResolveVerification}
                />
              ) : (
                <DocumentStudioPane
                  draft={shownDraft}
                  verification={shownVerification}
                  consistency={shownConsistency}
                  briefingPremortem={shownBriefingPremortem}
                  versionCount={activeDocument.versions.length}
                  activeVersionIndex={safeVersionIndex}
                  onSelectVersion={setVersionIndex}
                  onDownloadDocx={handleDownloadDocx}
                  onClose={() => setStudioClosed(true)}
                  onResolveVerification={handleResolveVerification}
                  onResolveConsistency={handleResolveConsistency}
                  downloading={downloading}
                  ectdEnabled={studioEnabled}
                  readinessGate={readinessGate}
                  onAssembleModule={handleAssembleModule}
                  onReadinessSubmit={handleReadinessSubmit}
                  onFollowReadinessLink={handleFollowReadinessLink}
                  assembling={assembling}
                  onSeal={handleSeal}
                  signer={{ name: account.name, role: resolvedUserRole ?? undefined }}
                  seal={shownSeal}
                  indModule={
                    studioEnabled && detectedIndModule
                      ? {
                          module: detectedIndModule,
                          productName: activeProjectName || 'the product',
                          indication: 'the proposed indication',
                          // Honesty contract: absent a live source join, treat as
                          // sample (draft-only, never sealable). A live join sets 'live'.
                          provenance: 'sample',
                          onAuthor: (message: string) => handleSend(message),
                        }
                      : undefined
                  }
                />
              )}
            </Panel>
          </PanelGroup>
        ) : (
          viewContent
        )}
      </main>
    </div>
  );
}
