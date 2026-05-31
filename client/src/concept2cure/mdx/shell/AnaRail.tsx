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
import { useChatUpload, CHAT_UPLOAD_ACCEPT } from '../../hooks/useChatUpload';

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
  const suggestions = MDX_SUGGESTIONS[activeNav] || MDX_SUGGESTIONS.overview;
  const modelName = ANA_MODES.find(m => m.id === mode)?.model ?? '';
  const upload = useChatUpload({ projectId });
  const fileRef = React.useRef<HTMLInputElement>(null);

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
            <div className="ana-id-model">Claude {modelName}</div>
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
              if (messages.length === 0 || window.confirm('Start a fresh AnA thread? Current messages will be cleared.')) {
                onNewThread();
              }
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
            title={`${m.desc} · Claude ${m.model}`}
          >
            <span className="lbl">{m.label}</span>
            <span className="sub">{m.model}</span>
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
                ? `AnA · ${ANA_MODES.find(x => x.id === m.mode)?.model || modelName}`
                : 'You'}{' '}
              · {m.when}
            </div>
            <div className="body">{m.body}</div>
          </div>
        ))}
      </div>

      <div className="ana-rail-foot">
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
                  color: a.status === 'error' ? 'var(--c2c-danger, #b3261e)' : 'inherit',
                }}
              >
                <span style={{ opacity: a.status === 'uploading' ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
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
          Routes via AI gateway · Claude {modelName}
        </div>
      </div>
    </aside>
  );
}
