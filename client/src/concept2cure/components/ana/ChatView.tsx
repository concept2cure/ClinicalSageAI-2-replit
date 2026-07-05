/**
 * ChatView — faithful port of the bundle's ChatView.
 *
 * Scrolling thread of Message rows + a sticky composer footer.
 * docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx
 * lines 125–157.
 *
 * Scroll behavior matches Anthropic's UX: auto-scroll while the user is
 * near the bottom, but stop following when they scroll up to read older
 * content. A "jump to latest" button appears when new tokens arrive while
 * the user is scrolled away.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { I } from './icons';
import { Composer, type ComposerReadyAttachment } from './Composer';
import type { EffortLevel } from './ModelEffortPicker';
import type { SafetyNarrativeSubmit } from './SafetyNarrativeAffordance';
import { Message, type ExecutedActionChip, type ToolCallView } from './Message';
import { IntelligenceQuestionWidget } from './IntelligenceQuestionWidget';
import { WarGameReport } from './WarGameReport';
import { AnaReportCanvas } from './AnaReportCanvas';
import type { MessageAttachment } from './useAnaChat';
import type { PendingSignoff } from './useGovernedAction';
import styles from './styles.module.css';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Files attached to this (user) turn — rendered as chips above the bubble. */
  attachments?: MessageAttachment[];
  html?: string;
  streaming?: boolean;
  /** Progress label shown before the first token arrives. */
  statusPhase?: string;
  latencyMs?: number;
  fallback?: boolean;
  stopped?: boolean;
  executedActions?: ExecutedActionChip[];
  /** Detected intent lens (e.g. "audit", "risk"). Rendered as a meta chip. */
  detectedLens?: string;
  /** Specific regulatory document type detected (e.g. "Clinical Overview"). Rendered as "Drafting: X" chip. */
  detectedDocumentType?: string;
  /** Server-suggested follow-up document actions (raw type strings). */
  suggestedActions?: string[];
  /** Extended-thinking reasoning content (collapsible section). */
  thinking?: string;
  /** Evidence grounding summary. */
  evidence?: {
    validated: boolean;
    sourceCount: number;
    groundedClaims: number;
    weakClaims: number;
    missingSupport: number;
    riskSummary?: string;
    flaggedClaims?: { kind: 'ungrounded' | 'overclaim' | 'contradiction'; text: string }[];
  };
  /** Context layers ANA drew on this turn (enrichment source names). */
  groundingSources?: string[];
  /** Degraded-mode warnings to surface as a chip. */
  warnings?: string[];
  /** Tools AnA invoked this turn, shown as transparency/audit status rows. */
  toolCalls?: ToolCallView[];
  /** Governed actions blocked pending a Part 11 sign-off. */
  pendingSignoffs?: PendingSignoff[];
  /** When this turn was sent (ms epoch) — relative timestamp source. */
  sentAt?: number;
  /** Intelligence questioning flow — current question event. */
  intelligenceQuestion?: import('../../../../../shared/types/intelligence-questions.js').IntelligenceQuestionEvent;
  /** Flow state for submitting answers back. */
  intelligenceFlowState?: import('../../../../../shared/types/intelligence-questions.js').FlowState;
  /** Intelligence flow completion event. */
  intelligenceFlowComplete?: import('../../../../../shared/types/intelligence-questions.js').IntelligenceFlowCompleteEvent;
  /** War Game report — FDA auditor simulation results. */
  warGameReport?: import('./useAnaChat').AnaChatMessage['warGameReport'];
  /** Reporting Canvas — governed report render / best-practices suggestions. */
  reportCanvas?: import('./useAnaChat').AnaChatMessage['reportCanvas'];
}

export interface ChatViewProps {
  messages: ChatMessageView[];
  onSend: (text: string, attachments?: MessageAttachment[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  onCopy?: (messageId: string, text: string) => void;
  onRetry?: (messageId: string) => void;
  onFeedback?: (messageId: string, positive: boolean) => void;
  onActionClick?: (messageId: string, action: ExecutedActionChip) => void;
  onEditRegenerate?: (messageId: string, newText: string) => void;
  /** Called when a server-suggested follow-up action chip is tapped. */
  onSuggestedAction?: (actionType: string) => void;
  /** Client-side label map for DocumentActionType strings. */
  suggestedActionLabels?: Record<string, string>;
  /** Scopes composer uploads to a project so extracted text lands in its memory. */
  projectId?: string;
  /** Tools pinned for the next turn, forwarded to the composer's tool picker. */
  selectedTools?: string[];
  onSelectedToolsChange?: (tools: string[]) => void;
  /** Response effort + advanced model override, forwarded to the composer's picker. */
  effort?: EffortLevel;
  onEffortChange?: (effort: EffortLevel) => void;
  modelOverride?: string | null;
  onModelOverrideChange?: (modelId: string | null) => void;
  /** Guided Safety Narrative submit (E5). Forwarded to the composer's affordance. */
  onSafetyNarrative?: (payload: SafetyNarrativeSubmit) => void;
  /** Called when the user submits an intelligence question answer. */
  onIntelligenceAnswer?: (flowState: any, nodeId: string, answers: Record<string, unknown>) => void;
  /** Called when the user clicks a suggested action after flow completion. */
  onIntelligenceAction?: (actionType: string) => void;
  /** Called when the user clicks "Remediate" on a war game finding. */
  onWarGameRemediate?: (findingId: string, findingTitle: string) => void;
}

export function ChatView({
  messages,
  onSend,
  onStop,
  isStreaming,
  onCopy,
  onRetry,
  onFeedback,
  onActionClick,
  onEditRegenerate,
  onSuggestedAction,
  suggestedActionLabels,
  projectId,
  selectedTools,
  onSelectedToolsChange,
  effort,
  onEffortChange,
  modelOverride,
  onModelOverrideChange,
  onSafetyNarrative,
  onIntelligenceAnswer,
  onIntelligenceAction,
  onWarGameRemediate,
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  // Attachments the composer hands up at send time, consumed by `send`.
  const pendingAttachmentsRef = useRef<MessageAttachment[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  // User scroll → if they're within ~80px of the bottom, follow new tokens.
  // If they scroll up, release the stick and surface a "jump to latest" pill.
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    setStickToBottom(nearBottom);
    if (nearBottom) setHasNewBelow(false);
  }, []);

  // New content arrives → either follow (stick) or surface the pill.
  useEffect(() => {
    if (stickToBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
      setHasNewBelow(true);
    }
  }, [messages.length, messages[messages.length - 1]?.text, stickToBottom]);

  const jumpToLatest = useCallback(() => {
    setStickToBottom(true);
    setHasNewBelow(false);
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  const send = () => {
    const out = draft.trim();
    if (!out) return;
    const attachments = pendingAttachmentsRef.current;
    pendingAttachmentsRef.current = [];
    onSend(out, attachments.length > 0 ? attachments : undefined);
    setDraft('');
    // Sending a new message implies user wants to follow it.
    setStickToBottom(true);
    setHasNewBelow(false);
  };

  return (
    <div className={styles.chat}>
      <div className={styles.chatScroll} ref={scrollerRef} onScroll={handleScroll}>
        <div className={styles.chatThread}>
          {messages.map(m => (
            <div key={m.id}>
              <Message
                role={m.role}
                text={m.text}
                attachments={m.attachments}
                html={m.html}
                streaming={m.streaming}
                statusPhase={m.statusPhase}
                latencyMs={m.latencyMs}
                fallback={m.fallback}
                stopped={m.stopped}
                executedActions={m.executedActions}
                detectedLens={m.detectedLens}
                detectedDocumentType={m.detectedDocumentType}
                suggestedActions={m.suggestedActions}
                suggestedActionLabels={suggestedActionLabels}
                thinking={m.thinking}
                evidence={m.evidence}
                groundingSources={m.groundingSources}
                warnings={m.warnings}
                toolCalls={m.toolCalls}
                pendingSignoffs={m.pendingSignoffs}
                sentAt={m.sentAt}
                onSuggestedAction={onSuggestedAction}
                onCopy={onCopy ? () => onCopy(m.id, m.text) : undefined}
                onRetry={onRetry ? () => onRetry(m.id) : undefined}
                onFeedback={onFeedback ? pos => onFeedback(m.id, pos) : undefined}
                onActionClick={
                  onActionClick ? action => onActionClick(m.id, action) : undefined
                }
                onEditRegenerate={
                  onEditRegenerate && m.role === 'user'
                    ? nt => onEditRegenerate(m.id, nt)
                    : undefined
                }
              />
              {(m.intelligenceQuestion || m.intelligenceFlowComplete) && (
                <IntelligenceQuestionWidget
                  question={m.intelligenceQuestion}
                  flowState={m.intelligenceFlowState}
                  completion={m.intelligenceFlowComplete}
                  onAnswer={onIntelligenceAnswer}
                  onAction={onIntelligenceAction}
                  isStreaming={isStreaming}
                />
              )}
              {m.warGameReport && (
                <WarGameReport
                  report={m.warGameReport}
                  onDismiss={() => {/* war game report remains visible until dismissed */}}
                  onRemediate={(findingId) => {
                    const finding = m.warGameReport?.findings.find(f => f.id === findingId);
                    onWarGameRemediate?.(findingId, finding?.title || findingId);
                  }}
                />
              )}
              {m.reportCanvas && (
                <AnaReportCanvas canvas={m.reportCanvas} onAction={(prompt) => onSend(prompt)} />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className={styles.chatFooter}>
        {hasNewBelow && !stickToBottom && (
          <button
            type="button"
            className={styles.jumpLatest}
            onClick={jumpToLatest}
            title="Jump to latest"
            aria-label="Jump to latest message"
          >
            <I.down size={14} />
            New messages
          </button>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onAttachmentsSend={(atts: ComposerReadyAttachment[]) => {
            pendingAttachmentsRef.current = atts;
          }}
          onStop={onStop}
          isStreaming={isStreaming}
          placeholder="Reply to AnA…"
          projectId={projectId}
          selectedTools={selectedTools}
          onSelectedToolsChange={onSelectedToolsChange}
          effort={effort}
          onEffortChange={onEffortChange}
          modelOverride={modelOverride}
          onModelOverrideChange={onModelOverrideChange}
          onSafetyNarrative={onSafetyNarrative}
        />
      </div>
    </div>
  );
}
