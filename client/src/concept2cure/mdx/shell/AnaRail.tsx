/**
 * AnA rail (right edge). Default: 32px seam. Click → 400px panel.
 * ⌘\ toggles. Ported from Shell.jsx > AnaRail.
 *
 * Per the design-system non-negotiables: the AnA `✻` (U+273B) sparkle is the
 * only emoji-class glyph allowed in the UI.
 */

import * as React from 'react';
import { I } from '../icons';
import { ANA_MODES, MDX_SUGGESTIONS, type AnaMode } from '../data/nav';
import type { Program } from '../data/programs';
import { useChatUpload, CHAT_UPLOAD_ACCEPT, attachmentReadLabel, SR_ONLY_STYLE } from '../../hooks/useChatUpload';

export interface AnaMessage {
  role: 'ana' | 'user';
  body: string;
  when: string;
  mode: AnaMode['id'];
}

export interface AnaRailProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeNav: string;
  program: Program | null;
  mode: AnaMode['id'];
  setMode: (m: AnaMode['id']) => void;
  messages: AnaMessage[];
  onSend: (text: string) => void;
  /** Clear the current thread (host wires to anaChat.reset). */
  onNewThread?: () => void;
  /** Open thread history (host wires to its history surface). */
  onShowHistory?: () => void;
  /** Scopes uploads to a project so extracted text lands in that project's memory. */
  projectId?: string;
}

export function AnaRail({
  open,
  setOpen,
  activeNav,
  program,
  mode,
  setMode,
  messages,
  onSend,
  onNewThread,
  onShowHistory,
  projectId,
}: AnaRailProps) {
  const [draft, setDraft] = React.useState('');
  const [confirmNewThread, setConfirmNewThread] = React.useState(false);
  const suggestions = MDX_SUGGESTIONS[activeNav] || MDX_SUGGESTIONS.overview;
  // Standing rule: all UI says "AnA 1.0" — no raw model names. Surface the AnA
  // *mode* (Standard / Deep research / …), never the underlying model.
  const modeLabel = ANA_MODES.find(m => m.id === mode)?.label ?? '';
  const upload = useChatUpload({ projectId });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  const confirmTitleId = React.useId();

  // Focus the destructive button when the confirm dialog opens; Esc closes.
  // Replaces window.confirm(), which is unstyled, unlocalized, and cannot be
  // audit-hooked. Same pattern as biopharma/shell/AnaDock's "new thread" gate.
  React.useEffect(() => {
    if (!confirmNewThread) return;
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirmNewThread(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [confirmNewThread]);

  const send = () => {
    const t = draft.trim();
    const ready = upload.attachments.filter(a => a.status === 'ready');
    if (!t && ready.length === 0) return;
    // Uploaded docs are OCR'd into project memory server-side; reference them
    // inline when the message is otherwise bare so AnA has a prompt to act on.
    const names = ready.map(a => a.name).join(', ');
    const text = t || (names ? `Review the attached: ${names}` : '');
    if (!text) return;
    onSend(text);
    setDraft('');
    upload.clear();
  };

  if (!open) {
    return (
      <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
        <button
          className="ana-seam-btn"
          onClick={() => setOpen(true)}
          title="Open AnA · ⌘\\"
        >
          <span className="ana-seam-mark">✻</span>
          <span className="ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ana-rail" aria-label="AnA assistant">
      <div className="ana-rail-hdr">
        <div className="ana-id">
          <span className="ana-id-mark">✻</span>
          <div className="ana-id-text">
            <div className="ana-id-name">AnA 1.0 RI</div>
            <div className="ana-id-model">{modeLabel}</div>
          </div>
        </div>
        <div className="ana-rail-actions">
          <button
            className="tb-btn"
            title="History"
            onClick={onShowHistory}
            disabled={!onShowHistory}
          >
            {I.clock}
          </button>
          <button
            className="tb-btn"
            title="New thread"
            onClick={() => {
              if (!onNewThread) return;
              if (messages.length === 0) {
                onNewThread();
                return;
              }
              setConfirmNewThread(true);
            }}
            disabled={!onNewThread}
          >
            {I.plus}
          </button>
          <button
            className="tb-btn"
            onClick={() => setOpen(false)}
            title="Collapse · ⌘\\"
          >
            {I.panelRight ?? I.panelLeft}
          </button>
        </div>
      </div>

      <div className="ana-mode-row">
        {ANA_MODES.map(m => (
          <button
            key={m.id}
            className={`ana-mode-btn${mode === m.id ? ' on' : ''}`}
            onClick={() => setMode(m.id)}
            title={m.desc}
          >
            <span className="lbl">{m.label}</span>
            <span className="sub">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="ana-rail-body">
        {program && (
          <div className="ana-context">
            <div className="lbl">Context</div>
            <div className="val">
              {program.code} · {program.title}
            </div>
            <div className="sub">
              {program.stage} · {program.readiness}% ready
            </div>
          </div>
        )}

        <div className="ana-section-label">Suggested for this surface</div>
        {suggestions.map((s, i) => (
          <button key={i} className="ana-suggestion" onClick={() => onSend(s)}>
            <span className="ico">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}

        <div className="ana-section-label" style={{ marginTop: 8 }}>
          Thread
        </div>
        {messages.length === 0 && (
          <div className="ana-empty">
            No messages yet. Use ⌘K for quick asks, or type below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ana-msg ${m.role}`}>
            <div className="who">
              {m.role === 'ana'
                ? `AnA · ${ANA_MODES.find(x => x.id === m.mode)?.label || modeLabel}`
                : 'You'}{' '}
              · {m.when}
            </div>
            <div className="body">{m.body}</div>
          </div>
        ))}
      </div>

      <div className="ana-rail-foot">
        <div style={SR_ONLY_STYLE} aria-live="polite" role="status">
          {upload.statusMessage}
        </div>
        {upload.attachments.length > 0 && (
          <div className="ana-attachments" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
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
                  lineHeight: 1.2,
                  borderRadius: 6,
                  border: '1px solid var(--c2c-border, rgba(0,0,0,0.12))',
                  color: a.status === 'error' ? 'var(--error)' : 'inherit',
                }}
              >
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ opacity: a.status === 'uploading' ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
                  </span>
                  {a.status === 'ready' && attachmentReadLabel(a.extractionMethod, a.extractionWords) && (
                    <span style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--c2c-ink-subtle, #888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {attachmentReadLabel(a.extractionMethod, a.extractionWords)}
                    </span>
                  )}
                  {a.status === 'error' && a.error && (
                    <span style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--error)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.error}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="ana-attachment-remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => upload.removeAttachment(a.id)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6 }}
                >
                  {I.close}
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ana-composer">
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
            className="ana-attach"
            title="Attach files"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            {I.attach}
          </button>
          <textarea
            rows={1}
            placeholder="Ask AnA about this workspace…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="ana-send"
            disabled={(!draft.trim() && upload.attachments.filter(a => a.status === 'ready').length === 0) || upload.uploading}
            title="Send"
            onClick={send}
          >
            {I.arrowUp}
          </button>
        </div>
        <div className="ana-foot-meta">
          Routes via AI gateway · {modeLabel}
        </div>
      </div>

      {confirmNewThread && (
        <div
          className="ana-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmTitleId}
          onMouseDown={e => {
            if (e.target === e.currentTarget) setConfirmNewThread(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 12, 8, 0.55)',
            zIndex: 200,
          }}
        >
          <div
            className="ana-confirm"
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 320,
              maxWidth: 'calc(100% - 32px)',
              padding: 20,
              borderRadius: 10,
              background: 'var(--surface, var(--card, #fff))',
              color: 'var(--foreground, #1c1c1c)',
              border: '1px solid var(--border, rgba(0,0,0,0.12))',
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div id={confirmTitleId} style={{ fontWeight: 600, fontSize: 14 }}>
              Start a fresh AnA thread?
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.8 }}>
              Current messages in this rail will be cleared. The prior thread is
              preserved in AnA history.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="tb-btn"
                onClick={() => setConfirmNewThread(false)}
              >
                Cancel
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className="tb-btn"
                style={{
                  padding: '6px 14px',
                  background: 'var(--accent-200, #a54a2a)',
                  color: '#fff',
                  border: '1px solid var(--accent-200, #a54a2a)',
                }}
                onClick={() => {
                  setConfirmNewThread(false);
                  onNewThread?.();
                }}
              >
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
