/**
 * Message — one chat row (user bubble or AnA assistant prose).
 *
 * Faithful to the bundle's layout. User bubbles on the right in `.bubble`
 * (secondary fill, 18px radius); assistant rows with the blue AI avatar and
 * serif prose, hover-revealed actions below (Copy / Retry / Good / Bad).
 *
 * Functional additions, styled inside the bundle's existing patterns:
 *   - Inline metadata chips next to the AI name use the bundle's `.cite`
 *     style: latencyMs → "2.3 s", fallback → "Degraded", stopped → "Stopped".
 *   - executedActions render under the prose as `.suggest-pill` chips
 *     (the same pill shape used for the empty-state suggestions).
 *   - User bubbles get a hover-only pencil that switches the bubble to the
 *     Composer; Save re-submits via onEditRegenerate.
 *
 * No new tokens or selectors — every style used is already in the bundle.
 */
import { useMemo, useState } from 'react';
import { marked, setOptions } from 'marked';

import { I } from './icons';
import { Composer } from './Composer';
import styles from './styles.module.css';

// Configure marked once: GitHub-flavoured markdown, no line-break collapsing.
setOptions({ gfm: true, breaks: false });

export interface ExecutedActionChip {
  label: string;
  actionType?: string;
  artifactId?: string;
  sectionCode?: string;
  executed?: boolean;
  error?: string;
}

export interface MessageProps {
  role: 'user' | 'assistant';
  text: string;
  /** Markdown-rendered HTML. If unset, `text` renders as plain paragraph. */
  html?: string;
  streaming?: boolean;
  /** Progress phase label shown while streaming before the first token. */
  statusPhase?: string;

  // AnA metadata (shown in the AI-name meta row)
  latencyMs?: number;
  fallback?: boolean;
  stopped?: boolean;
  executedActions?: ExecutedActionChip[];

  // Handlers
  onCopy?: () => void;
  onRetry?: () => void;
  onFeedback?: (positive: boolean) => void;
  onActionClick?: (action: ExecutedActionChip) => void;
  onEditRegenerate?: (newText: string) => void;
}

function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function Message({
  role,
  text,
  html,
  streaming,
  statusPhase,
  latencyMs,
  fallback,
  stopped,
  executedActions,
  onCopy,
  onRetry,
  onFeedback,
  onActionClick,
  onEditRegenerate,
}: MessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  // Render markdown to HTML only once the stream is complete — partial
  // markdown mid-stream produces broken tags. While streaming, the plain
  // paragraph split is used instead.
  const renderedHtml = useMemo(() => {
    if (role !== 'assistant' || streaming || !text) return undefined;
    try {
      return marked.parse(text) as string;
    } catch {
      return undefined;
    }
  }, [role, text, streaming]);

  const CopyIco = I.copy;
  const RedoIco = I.redo;
  const ThumbUpIco = I.thumbUp;
  const ThumbDownIco = I.thumbDown;
  const CheckIco = I.check;

  if (role === 'user') {
    if (editing) {
      return (
        <div className={`${styles.msg} ${styles.msgUser}`}>
          <div style={{ width: '100%', maxWidth: 680 }}>
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => {
                if (draft.trim() && onEditRegenerate) {
                  onEditRegenerate(draft.trim());
                }
                setEditing(false);
              }}
              placeholder="Edit your message…"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button
                className={styles.suggestPill}
                onClick={() => {
                  setDraft(text);
                  setEditing(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={`${styles.msg} ${styles.msgUser}`}>
        <div className={styles.bubble}>{text}</div>
        {onEditRegenerate && (
          <button
            className={styles.userEditBtn}
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            title="Edit"
            aria-label="Edit message"
            type="button"
          >
            <I.redo size={12} />
          </button>
        )}
      </div>
    );
  }

  // Assistant
  return (
    <div className={`${styles.msg} ${styles.msgAi}`}>
      <div className={styles.avatarAi}>A</div>
      <div className={styles.aiBody}>
        <div className={styles.aiName}>
          AnA · Reg Intelligence
          {fallback && (
            <span className={styles.cite} style={{ marginLeft: 8 }} title="Running in degraded mode">
              Degraded
            </span>
          )}
          {stopped && (
            <span className={styles.cite} style={{ marginLeft: 8 }}>
              Stopped
            </span>
          )}
          {typeof latencyMs === 'number' && latencyMs > 0 && (
            <span className={styles.cite} style={{ marginLeft: 8 }} title={`${latencyMs} ms`}>
              {formatLatency(latencyMs)}
            </span>
          )}
        </div>

        {renderedHtml ? (
          /* Completed assistant reply — full markdown rendering */
          <div className={styles.aiProse} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : html ? (
          <div className={styles.aiProse} dangerouslySetInnerHTML={{ __html: html }} />
        ) : streaming && text === '' ? (
          /* Show progress phase label before the first token arrives */
          <div className={styles.aiProse}>
            <span className={styles.cite} style={{ fontStyle: 'italic' }}>
              {statusPhase || 'Thinking…'}
            </span>
            <span className={styles.typing} aria-label="AnA is working" style={{ marginLeft: 8 }}>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : (
          /* Streaming — plain paragraph split to avoid partial-markdown artifacts */
          <div className={styles.aiProse}>
            {text.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {streaming && (
              <span className={styles.typing} aria-label="AnA is typing">
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        )}

        {executedActions && executedActions.length > 0 && (
          <div className={styles.suggest} style={{ justifyContent: 'flex-start', marginTop: 4 }}>
            {executedActions.map((action, i) => {
              const Ico = action.error
                ? I.dots
                : action.executed
                  ? CheckIco
                  : I.sparkles;
              const clickable = Boolean(action.artifactId || action.sectionCode);
              return (
                <button
                  key={i}
                  className={styles.suggestPill}
                  onClick={clickable && onActionClick ? () => onActionClick(action) : undefined}
                  disabled={!clickable}
                  type="button"
                  title={action.error || action.label}
                >
                  <span className={styles.ico}>
                    <Ico size={14} />
                  </span>
                  {action.label}
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.aiActions}>
          {onCopy && (
            <button title="Copy" onClick={onCopy} type="button">
              <CopyIco size={14} />
            </button>
          )}
          {onRetry && (
            <button title="Retry" onClick={onRetry} type="button">
              <RedoIco size={14} />
            </button>
          )}
          {onFeedback && (
            <>
              <button title="Good" onClick={() => onFeedback(true)} type="button">
                <ThumbUpIco size={14} />
              </button>
              <button title="Bad" onClick={() => onFeedback(false)} type="button">
                <ThumbDownIco size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
