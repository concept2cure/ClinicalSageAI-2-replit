/**
 * PDEV AnA dock — right column. Context block pinned to the active
 * program + active activity, surface-specific suggestion chips, draft
 * composer.
 *
 * Phase 7.0 + 7.1 wires the dock visually only — the composer's send
 * action invokes the parent's onAskAna callback, which the App layer
 * routes to the existing AnA gateway. Streaming chat history surfaces
 * in the AnA conversation history (Phase 8); this dock just collects
 * the prompt with PDEV context attached.
 *
 * File upload: the paperclip uploads to /api/chat/upload, which OCRs the
 * document and writes its text to project memory so AnA can retrieve it.
 *
 * Port of design-system/ui_kits/pdev/Shell.jsx > PdevAnaDock.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import { PDEV_SUGGESTIONS } from '../data/enums';
import { useChatUpload, CHAT_UPLOAD_ACCEPT, attachmentReadLabel, SR_ONLY_STYLE } from '../../hooks/useChatUpload';
import type { PdevProgramView, PdevActivityView } from '../data/types';

/** Minimal transcript message for the dock. Mapped from useAnaChat in
 *  PdevApp; mirrors the MDX AnaRail `ana-msg` shape. */
export interface PdevAnaDockMessage {
  role: 'user' | 'ana';
  body: string;
  /** Relative time chip (e.g. "just now"). */
  when: string;
  /** True while tokens are still arriving — renders a streaming caret. */
  streaming?: boolean;
}

interface AnaDockProps {
  open: boolean;
  setOpen: (next: boolean) => void;
  program: PdevProgramView['program'] | null;
  /** Effective readiness for the program (latest snapshot overall). */
  readinessScore: number | null;
  /** Top blocker derived from the program view; null when none. */
  topBlocker: string | null;
  activeNav: string;
  /** When a single activity is selected in a workstream / detail view,
   *  the dock pins it as context for AnA. */
  activity: PdevActivityView | null;
  /** Send a draft prompt to AnA. The dock only collects the text; the
   *  app layer wires it to the AnA gateway. */
  onSend: (text: string) => void;
  /** Streaming flag from the AnA gateway round-trip. When true the
   *  composer locks and the footer status flips to "AnA is thinking…"
   *  so the user has immediate feedback that the prompt was accepted. */
  isStreaming?: boolean;
  /** Conversation transcript for this dock session. When empty, the
   *  suggestion chips show instead. Provisional inline treatment pending
   *  a canonical viewport design in ui_kits/pdev. */
  messages?: PdevAnaDockMessage[];
  /** Numeric project id for scoping uploads into project memory. The PDEV
   *  program id is not a project id; without this the file still uploads,
   *  just unscoped to a project. */
  projectId?: string;
}

export function PdevAnaDock({
  open,
  setOpen,
  program,
  readinessScore,
  topBlocker,
  activeNav,
  activity,
  onSend,
  isStreaming = false,
  messages = [],
  projectId,
}: AnaDockProps) {
  const [draft, setDraft] = React.useState('');
  const suggestions = PDEV_SUGGESTIONS[activeNav] ?? PDEV_SUGGESTIONS.overview;
  const hasTranscript = messages.length > 0;
  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const upload = useChatUpload({ projectId });
  const readyCount = upload.attachments.filter((a) => a.status === 'ready').length;

  // Keep the transcript pinned to the latest message as tokens stream in.
  React.useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!open) {
    return (
      <aside className="pdev-ana-seam">
        <button
          className="pdev-ana-seam-btn"
          onClick={() => setOpen(true)}
          title="Open AnA · ⌘\\"
          type="button"
        >
          <span className="pdev-ana-mark">✻</span>
          <span className="pdev-ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  const handleSend = () => {
    const trimmed = draft.trim();
    const ready = upload.attachments.filter((a) => a.status === 'ready');
    if (!trimmed && ready.length === 0) return;
    // Uploaded docs are OCR'd into project memory server-side; reference them
    // inline when the message is otherwise bare so AnA has a prompt to act on.
    const names = ready.map((a) => a.name).join(', ');
    const text = trimmed || (names ? `Review the attached: ${names}` : '');
    if (!text) return;
    onSend(text);
    setDraft('');
    upload.clear();
  };

  return (
    <aside className="pdev-ana">
      <div className="pdev-ana-hdr">
        <div className="pdev-ana-id">
          <span className="pdev-ana-mark">✻</span>
          <div className="pdev-ana-id-text">
            <div className="pdev-ana-id-name">AnA 1.0 RI</div>
            <div className="pdev-ana-id-model">Claude Opus 4.5</div>
          </div>
        </div>
        <button
          className="pdev-tb-btn"
          onClick={() => setOpen(false)}
          title="Collapse · ⌘\\"
          type="button"
          aria-label="Collapse AnA dock"
        >
          <PdevIcon name="panelRight" />
        </button>
      </div>

      {program && (
        <div className="pdev-ana-context">
          <div className="lbl">Context</div>
          <div className="val">
            {program.code} · {program.productName.split(' · ')[0]}
          </div>
          <div className="sub">
            {readinessScore !== null && (
              <>Readiness {Math.round(readinessScore)}%</>
            )}
            {readinessScore !== null && program.targetSubmissionDate && ' · '}
            {program.targetSubmissionDate &&
              `target IND ${program.targetSubmissionDate.slice(0, 10)}`}
          </div>
          {activity && (
            <div className="pdev-ana-context-activity">
              <span className="ico">
                <PdevIcon name="zap" />
              </span>
              <span>{activity.registry.title}</span>
            </div>
          )}
          {topBlocker && (
            <div className="pdev-ana-context-blocker">
              <span className="ico">
                <PdevIcon name="alertCircle" />
              </span>
              <span>{topBlocker}</span>
            </div>
          )}
        </div>
      )}

      {!hasTranscript && (
        <>
          <div className="pdev-ana-section-label">Suggested for this surface</div>
          {suggestions.slice(0, 3).map((s, i) => (
            <button
              key={i}
              className="pdev-ana-suggestion"
              onClick={() => setDraft(s)}
              type="button"
            >
              <span className="ico">
                <PdevIcon name="sparkles" />
              </span>
              <span>{s}</span>
            </button>
          ))}
        </>
      )}

      {hasTranscript ? (
        <div className="pdev-ana-transcript" ref={transcriptRef}>
          {messages.map((m, i) => (
            <div key={i} className={`pdev-ana-msg ${m.role}`}>
              <div className="pdev-ana-msg-who">{m.role === 'ana' ? 'AnA' : 'You'} · {m.when}</div>
              <div className="pdev-ana-msg-body">
                {m.body}
                {m.streaming && <span className="pdev-ana-caret" aria-hidden="true" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pdev-ana-spacer" />
      )}

      <div className="pdev-ana-foot">
        <div style={SR_ONLY_STYLE} aria-live="polite" role="status">
          {upload.statusMessage}
        </div>
        {upload.attachments.length > 0 && (
          <div
            className="pdev-ana-attachments"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}
          >
            {upload.attachments.map((a) => (
              <span
                key={a.id}
                title={a.error || a.name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: 200,
                  padding: '4px 8px',
                  fontSize: 12,
                  lineHeight: 1.2,
                  borderRadius: 6,
                  border: '1px solid var(--c2c-border, rgba(0,0,0,0.12))',
                  color: a.status === 'error' ? 'var(--c2c-danger, #b3261e)' : 'inherit',
                }}
              >
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span
                    style={{
                      opacity: a.status === 'uploading' ? 0.6 : 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
                  </span>
                  {a.status === 'ready' && attachmentReadLabel(a.extractionMethod, a.extractionWords) && (
                    <span style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--c2c-ink-subtle, #888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {attachmentReadLabel(a.extractionMethod, a.extractionWords)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="pdev-ana-attachment-remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => upload.removeAttachment(a.id)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6 }}
                >
                  <PdevIcon name="close" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="pdev-ana-composer">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={CHAT_UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              upload.addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className="pdev-ana-attach"
            onClick={() => fileRef.current?.click()}
            title="Attach files"
            type="button"
            aria-label="Attach files"
            disabled={isStreaming}
          >
            <PdevIcon name="paperclip" />
          </button>
          <textarea
            rows={2}
            placeholder={isStreaming ? 'AnA is thinking…' : 'Ask AnA about this program…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            aria-label="Ask AnA"
            disabled={isStreaming}
          />
          <button
            className="pdev-ana-send"
            disabled={(!draft.trim() && readyCount === 0) || isStreaming || upload.uploading}
            onClick={handleSend}
            type="button"
            aria-label="Send"
          >
            <PdevIcon name="arrowUp" />
          </button>
        </div>
        <div className="pdev-ana-foot-meta">
          {isStreaming
            ? 'Streaming · response will appear in Conversations'
            : 'Routes via AnA gateway · Opus 4.5'}
        </div>
      </div>
    </aside>
  );
}
