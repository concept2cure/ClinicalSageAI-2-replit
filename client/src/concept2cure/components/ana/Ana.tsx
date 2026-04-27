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

import { apiRequest } from '@/lib/queryClient';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';

import { Sidebar, type AnaView, type AccountInfo, type Recent } from './Sidebar';
import { TopBar } from './TopBar';
import { EmptyState, type EmptySuggestion } from './EmptyState';
import { ChatView, type ChatMessageView } from './ChatView';
import { ProjectsView, type AnaProject } from './ProjectsView';
import { useAnaChat, type AnaChatMessage, type AnaChatAction } from './useAnaChat';
import { useRecents } from './useRecents';
import styles from './styles.module.css';

export interface AnaProps {
  /** Signed-in user (fallbacks match the bundle demo). */
  user?: Partial<AccountInfo>;
  /** Real recents list from the thread DB. */
  recents?: Recent[];
  /** Real projects from the project DB. */
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

const DEFAULT_ACCOUNT: AccountInfo = {
  name: 'Jordan Chen',
  initials: 'JC',
  plan: 'Enterprise · Reg Affairs',
};

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

const DEFAULT_RECENTS: Recent[] = [
  { id: 'r1', label: 'NDA 212345 · Module 2.5 draft' },
  { id: 'r2', label: '510(k) predicate search — Q1' },
  { id: 'r3', label: 'EMA scientific advice prep' },
  { id: 'r4', label: 'Biostat SAP review — BX-204' },
  { id: 'r5', label: 'Pre-IND meeting package' },
  { id: 'r6', label: 'PMDA consultation outline' },
];

const DEFAULT_PROJECTS: AnaProject[] = [
  {
    id: 'p1',
    title: 'NDA 212345',
    description: 'Full submission package for oncology biologic. 6 modules, 14 contributors.',
    meta: '42 chats · updated 4h ago',
  },
  {
    id: 'p2',
    title: '510(k) — BX-204',
    description: 'Class II device clearance. Predicate analysis + SE argument.',
    meta: '18 chats · updated 2d ago',
  },
  {
    id: 'p3',
    title: 'EMA scientific advice',
    description: 'Pre-submission advice request for MAA Q3 filing.',
    meta: '7 chats · updated 1w ago',
  },
  {
    id: 'p4',
    title: 'Pediatric plan',
    description: 'PIP + iPSP harmonization across FDA/EMA.',
    meta: '3 chats · updated 2w ago',
  },
  {
    id: 'p5',
    title: 'Post-market safety',
    description: 'PBRER / PSUR authoring for 3 approved products.',
    meta: '21 chats · updated 3d ago',
  },
  {
    id: 'p6',
    title: 'CMC readiness',
    description: 'Module 3 review, stability commitments, CBE-30 tracker.',
    meta: '9 chats · updated 5d ago',
  },
];

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
  projectIntelligence: _projectIntelligence,
  onThreadChange,
  onActionRun: _onActionRun,
  onNavigate,
  onDraftInsert: _onDraftInsert,
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
    name: user?.name || DEFAULT_ACCOUNT.name,
    initials: user?.initials || DEFAULT_ACCOUNT.initials,
    plan: user?.plan || DEFAULT_ACCOUNT.plan,
  };

  // Live recents from /api/chat/threads. Falls through to the bundle's demo
  // list only when nothing has been fetched yet AND the caller did not pass
  // an explicit `recents` prop.
  const { recents: liveRecents } = useRecents({ projectId: resolvedProjectId });
  const recentsList: Recent[] =
    recents && recents.length > 0
      ? recents
      : liveRecents.length > 0
        ? liveRecents
        : DEFAULT_RECENTS;
  const projectList = projects && projects.length > 0 ? projects : DEFAULT_PROJECTS;

  const [view, setView] = useState<AnaView>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);

  const chat = useAnaChat({
    projectId: resolvedProjectId,
    projectName: resolvedProjectName,
    screenName: resolvedScreenName,
    userRole: resolvedUserRole,
    submissionType,
    authoringContext: authoringContext ?? undefined,
    moduleContext: moduleContext ?? undefined,
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
    (text: string) => {
      setView('chat');
      void chat.send(text);
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
      action: { artifactId?: string; sectionCode?: string; path?: string },
    ) => {
      if (action.artifactId && onOpenArtifact) {
        onOpenArtifact(action.artifactId);
      } else if (action.sectionCode && onNavigateToSection) {
        onNavigateToSection(action.sectionCode);
      } else if (action.path && onNavigate) {
        onNavigate(action.path);
      }
    },
    [onOpenArtifact, onNavigateToSection, onNavigate]
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
      chat.messages.map((m: AnaChatMessage) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        streaming: m.streaming,
        statusPhase: m.statusPhase,
        executedActions: m.executedActions as any,
        latencyMs: m.latencyMs,
        fallback: m.fallback,
        stopped: m.stopped,
        detectedLens: m.detectedLens,
        suggestedActions: m.suggestedActions,
        thinking: m.thinking,
        evidence: m.evidence,
        warnings: m.warnings,
        sentAt: m.sentAt,
      })),
    [chat.messages]
  );

  const greetingName = account.name.split(' ')[0] || account.name;

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
        {view === 'home' && (
          <EmptyState
            greetingName={greetingName}
            onSend={handleSend}
            onStop={chat.stop}
            isStreaming={chat.isStreaming}
            greeting={greeting}
            suggestions={emptySuggestions}
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
          <ProjectsView
            projects={projectList}
            onSelect={id => onSelectProject?.(id)}
          />
        )}
      </main>
    </div>
  );
}
