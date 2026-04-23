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

import { Sidebar, type AnaView, type AccountInfo, type Recent } from './Sidebar';
import { TopBar } from './TopBar';
import { EmptyState } from './EmptyState';
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
}: AnaProps) {
  const account: AccountInfo = {
    name: user?.name || DEFAULT_ACCOUNT.name,
    initials: user?.initials || DEFAULT_ACCOUNT.initials,
    plan: user?.plan || DEFAULT_ACCOUNT.plan,
  };

  // Live recents from /api/chat/threads. Falls through to the bundle's demo
  // list only when nothing has been fetched yet AND the caller did not pass
  // an explicit `recents` prop.
  const { recents: liveRecents } = useRecents({ projectId: activeProjectId });
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
    projectId: activeProjectId,
    projectName: activeProjectName,
    screenName,
    userRole,
    submissionType,
  });

  const handleSend = useCallback(
    (text: string) => {
      setView('chat');
      void chat.send(text);
    },
    [chat]
  );

  // Auto-send a handed-off draft from the home composer. Guarded with a ref
  // so remounts (React strict-mode, router re-mount) can't fire it twice.
  const initialMessageConsumedRef = useRef(false);
  useEffect(() => {
    const seed = typeof initialMessage === 'string' ? initialMessage.trim() : '';
    if (!seed || initialMessageConsumedRef.current || chat.isStreaming) return;
    initialMessageConsumedRef.current = true;
    setView('chat');
    void chat.send(seed);
    onInitialMessageConsumed?.();
  }, [initialMessage, chat, onInitialMessageConsumed]);

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
    (_messageId: string, action: { artifactId?: string; sectionCode?: string }) => {
      if (action.artifactId && onOpenArtifact) {
        onOpenArtifact(action.artifactId);
      } else if (action.sectionCode && onNavigateToSection) {
        onNavigateToSection(action.sectionCode);
      }
    },
    [onOpenArtifact, onNavigateToSection]
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
        <TopBar view={view} />
        {view === 'home' && (
          <EmptyState
            greetingName={greetingName}
            onSend={handleSend}
            onStop={chat.stop}
            isStreaming={chat.isStreaming}
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
