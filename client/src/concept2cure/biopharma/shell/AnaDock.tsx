/**
 * Biopharma AnA dock — persistent right-side conversation surface
 * (Phase 10.2, docs/legacy/PHASE_10_2_INSTALL.md §3.3).
 *
 * Two states: 32px seam (closed) and 400px dock (open); ⌘\ toggles from
 * the host App and the open state persists to users.preferences.dockOpen.
 * The dock is scope-aware — header label + suggestion chips switch with
 * activeNav. Messages stream through useAnaChat (/api/ana-ri/stream) in
 * the host; this component renders the transcript and collects prompts.
 *
 * Per the standing rule, all UI says "AnA 1.0" — no model names.
 * Server-side per-surface thread persistence (c2c_ana_conversations.domain)
 * is the Phase 10.1 backend; the host pins activeNav into module_context.
 *
 * Port of ui_kits/biopharma/AnaDock.jsx onto the MDX AnaRail conventions.
 *
 * @module client/src/concept2cure/biopharma/shell/AnaDock
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { BIOPHARMA_SUGGESTIONS, HERE_LABEL_BIOPHARMA } from '../data/nav';
import {
  useChatUpload,
  CHAT_UPLOAD_ACCEPT,
  attachmentReadLabel,
  SR_ONLY_STYLE,
} from '../../hooks/useChatUpload';

export interface BiopharmaAnaMessage {
  role: 'user' | 'ana';
  body: string;
  /** Relative time chip (e.g. "just now"). */
  when: string;
  /** True while tokens are still arriving. */
  streaming?: boolean;
}

export interface BiopharmaAnaDockProps {
  open: boolean;
  setOpen: (next: boolean) => void;
  activeNav: string;
  messages: BiopharmaAnaMessage[];
  onSend: (text: string) => void;
  isStreaming?: boolean;
  /** Clear the current thread (host wires to anaChat.reset). */
  onNewThread?: () => void;
  /** Scopes uploads to a project so extracted text lands in project memory. */
  projectId?: string;
}

export function BiopharmaAnaDock({
  open,
  setOpen,
  activeNav,
  messages,
  onSend,
  isStreaming = false,
  onNewThread,
  projectId,
}: BiopharmaAnaDockProps) {
  const [draft, setDraft] = React.useState('');
  const label = HERE_LABEL_BIOPHARMA[activeNav] ?? 'Overview';
  const suggestions = (BIOPHARMA_SUGGESTIONS[activeNav] ?? BIOPHARMA_SUGGESTIONS.overview).slice(0, 3);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const upload = useChatUpload({ projectId });
  const readyCount = upload.attachments.filter(a => a.status === 'ready').length;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  if (!open) {
    return (
      <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
        <button
          className="ana-seam-btn"
          type="button"
          onClick={() => setOpen(true)}
          title="Open AnA · ⌘\\"
        >
          <span className="ana-seam-mark">✻</span>
          <span className="ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  const send = () => {
    const t = draft.trim();
    const ready = upload.attachments.filter(a => a.status === 'ready');
    if (!t && ready.length === 0) return;
    const names = ready.map(a => a.name).join(', ');
    const text = t || (names ? `Review the attached: ${names}` : '');
    if (!text) return;
    onSend(text);
    setDraft('');
    upload.clear();
  };

  return (
    <aside className="ad-dock" aria-label="AnA assistant">
      <div className="ad-head">
        <div className="ad-head-title">
          <span className="ad-head-mark"><BioIcon name="sparkles" /></span>
          <div>
            <div className="ad-head-name">AnA 1.0</div>
            <div className="ad-head-scope">{label}</div>
          </div>
        </div>
        <div className="ad-head-actions">
          <button
            className="ad-head-btn"
            type="button"
            title="New thread"
            disabled={!onNewThread}
            onClick={() => {
              if (!onNewThread) return;
              if (
                messages.length === 0 ||
                window.confirm('Start a fresh AnA thread? Current messages will be cleared.')
              ) {
                onNewThread();
              }
            }}
          >
            <BioIcon name="plus" />
          </button>
          <button className="ad-head-btn" type="button" title="Collapse · ⌘\\" onClick={() => setOpen(false)}>
            <BioIcon name="close" />
          </button>
        </div>
      </div>

      <div className="ad-scroll" ref={scrollRef}>
        <div className="ad-thread">
          {messages.length === 0 && (
            <div className="ad-msg ad-msg-ana">
              <div className="ad-avatar">A</div>
              <div className="ad-msg-body">
                <p>
                  Grounded on {label}. I can draft, cite, validate, or run governed actions on this
                  surface — pick a suggestion below or type a prompt.
                </p>
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="ad-msg ad-msg-user">
                <div className="ad-msg-body">{m.body}</div>
              </div>
            ) : (
              <div key={i} className="ad-msg ad-msg-ana">
                <div className="ad-avatar">A</div>
                <div className="ad-msg-body">
                  <div className="ad-tool">
                    <span className="ad-tool-tick"><BioIcon name="check" /></span>
                    <span><b>Grounded</b> {label} · {m.when}</span>
                  </div>
                  <p>{m.body}</p>
                </div>
              </div>
            ),
          )}
          {isStreaming && (
            <div className="ad-msg ad-msg-ana">
              <div className="ad-avatar">A</div>
              <div className="ad-msg-body">
                <div className="ad-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ad-foot">
        <div style={SR_ONLY_STYLE} aria-live="polite" role="status">
          {upload.statusMessage}
        </div>
        {suggestions.length > 0 && !draft && messages.length === 0 && (
          <div className="ad-suggest">
            {suggestions.map((s, i) => (
              <button key={i} className="ad-suggest-chip" type="button" onClick={() => onSend(s)} title={s}>
                <span className="ad-suggest-spark"><BioIcon name="sparkles" /></span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}
        {upload.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {upload.attachments.map(a => (
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
                  borderRadius: 6,
                  border: '1px solid var(--border, rgba(0,0,0,0.12))',
                  color: a.status === 'error' ? 'var(--error)' : 'inherit',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
                  {a.status === 'ready' && attachmentReadLabel(a.extractionMethod, a.extractionWords) && (
                    <> · {attachmentReadLabel(a.extractionMethod, a.extractionWords)}</>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => upload.removeAttachment(a.id)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6 }}
                >
                  <BioIcon name="close" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ad-composer">
          <textarea
            rows={1}
            placeholder={isStreaming ? 'AnA is thinking…' : `Ask AnA about ${label.toLowerCase()}…`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={isStreaming}
            aria-label="Ask AnA"
          />
          <div className="ad-composer-row">
            <div className="ad-composer-left">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={CHAT_UPLOAD_ACCEPT}
                style={{ display: 'none' }}
                onChange={e => {
                  upload.addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                className="ad-chip"
                type="button"
                title="Attach files — saved to project memory"
                onClick={() => fileRef.current?.click()}
                disabled={isStreaming}
              >
                <BioIcon name="paperclip" />
              </button>
              <span className="ad-chip" style={{ cursor: 'default' }}>AnA 1.0</span>
            </div>
            <div className="ad-composer-right">
              <button
                className="ad-send"
                type="button"
                title="Send · Enter"
                disabled={(!draft.trim() && readyCount === 0) || isStreaming || upload.uploading}
                onClick={send}
                aria-label="Send"
              >
                <BioIcon name="arrowUp" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
