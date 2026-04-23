/**
 * ChatView — faithful port of the bundle's ChatView.
 *
 * Scrolling thread of Message rows + a sticky composer footer.
 * docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx
 * lines 125–157.
 */
import { useEffect, useRef, useState } from 'react';

import { Composer } from './Composer';
import { Message, type ExecutedActionChip } from './Message';
import styles from './styles.module.css';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
  /** Server-suggested follow-up document actions (raw type strings). */
  suggestedActions?: string[];
}

export interface ChatViewProps {
  messages: ChatMessageView[];
  onSend: (text: string) => void;
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
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.text]);

  const send = () => {
    const out = draft.trim();
    if (!out) return;
    onSend(out);
    setDraft('');
  };

  return (
    <div className={styles.chat}>
      <div className={styles.chatScroll}>
        <div className={styles.chatThread}>
          {messages.map(m => (
            <Message
              key={m.id}
              role={m.role}
              text={m.text}
              html={m.html}
              streaming={m.streaming}
              statusPhase={m.statusPhase}
              latencyMs={m.latencyMs}
              fallback={m.fallback}
              stopped={m.stopped}
              executedActions={m.executedActions}
              detectedLens={m.detectedLens}
              suggestedActions={m.suggestedActions}
              suggestedActionLabels={suggestedActionLabels}
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
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className={styles.chatFooter}>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={onStop}
          isStreaming={isStreaming}
          placeholder="Reply to AnA…"
        />
      </div>
    </div>
  );
}
