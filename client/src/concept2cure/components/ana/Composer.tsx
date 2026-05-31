/**
 * Composer — faithful port of the bundle's Composer + stop-state affordance.
 *
 * Bundle shape:
 *   [textarea]
 *   ├── [attach] [tools] [AnA 1.0 RI ▾]    [send ▲]
 *
 * Functional additions (user-approved; bundle-consistent styling):
 *   - While streaming, the send button flips to a stop button. Same 32×32
 *     circle, same accent fill, same :hover — the only difference is the
 *     icon and title. No new visual element.
 *   - Textarea auto-grows with content up to 8 lines, then scrolls — the
 *     same Anthropic UX of a comfortable multi-line composer.
 *   - Attach (paperclip) is wired: click-to-browse + drag/drop upload to
 *     /api/chat/upload, which OCRs the file and writes its text to project
 *     memory so AnA can retrieve it. Attachment chips show upload state.
 *
 * Ported from docs/design/concept2cure-design-system/project/ui_kits/
 * ana_ri/App.jsx (lines 71–91).
 */
import { useEffect, useRef, useState, useCallback } from 'react';

import { I } from './icons';
import styles from './styles.module.css';

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
  /** Scopes uploads to a project so extracted text lands in that project's memory. */
  projectId?: string;
}

/** A file attached in the composer, tracked through its upload lifecycle. */
interface ComposerAttachment {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  fileId?: string;
  error?: string;
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.docx,.doc';

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  placeholder = 'How can AnA help you today?',
  projectId,
}: ComposerProps) {
  const AttachIco = I.attach;
  const ToolsIco = I.tools;
  const DownIco = I.down;
  const ArrowUpIco = I.arrowUp;
  const StopIco = I.stop;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  // Auto-grow: reset to single-line height, then expand to scrollHeight,
  // capped at ~8 lines. After the cap the browser shows a scrollbar.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = 22; // matches CSS line-height
    const max = lineHeight * 8;
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);

  const uploadFile = useCallback(
    async (file: File) => {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [...prev, { id: localId, name: file.name, status: 'uploading' }]);
      try {
        const form = new FormData();
        form.append('file', file);
        if (projectId) form.append('projectId', projectId);
        const res = await fetch('/api/chat/upload', { method: 'POST', body: form, credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        setAttachments((prev) =>
          prev.map((a) => (a.id === localId ? { ...a, status: 'ready', fileId: data.fileId } : a)),
        );
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
              : a,
          ),
        );
      }
    },
    [projectId],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => void uploadFile(file));
    },
    [uploadFile],
  );

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const sendDisabled = !value.trim() && !isStreaming;

  return (
    <div
      className={styles.composer}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      style={dragging ? { outline: '1.5px dashed var(--c2c-accent, #d97757)', outlineOffset: '2px' } : undefined}
    >
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 4px 8px' }}>
          {attachments.map((a) => (
            <span
              key={a.id}
              title={a.error || a.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                maxWidth: '220px',
                padding: '4px 8px',
                fontSize: '12px',
                lineHeight: 1.2,
                borderRadius: '6px',
                border: '1px solid var(--c2c-border, rgba(0,0,0,0.12))',
                background: 'var(--c2c-surface-2, rgba(0,0,0,0.03))',
                color: a.status === 'error' ? 'var(--c2c-danger, #b3261e)' : 'inherit',
              }}
            >
              <span style={{ opacity: a.status === 'uploading' ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6, fontSize: '14px', lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isStreaming) onSend();
          } else if (e.key === 'Escape' && isStreaming && onStop) {
            // Escape during streaming = stop generation (Anthropic shortcut)
            e.preventDefault();
            onStop();
          }
        }}
        rows={1}
      />
      <div className={styles.composerActions}>
        <div className={styles.left}>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={e => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className={styles.composerIcon}
            title="Attach files"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            <AttachIco size={16} />
          </button>
          <button className={styles.composerIcon} title="Tools" type="button">
            <ToolsIco size={16} />
          </button>
          <button className={styles.composerChip} type="button">
            AnA 1.0 RI
            <DownIco size={12} />
          </button>
        </div>
        <button
          className={styles.composerSend}
          onClick={() => {
            if (isStreaming) {
              onStop?.();
            } else {
              onSend();
            }
          }}
          disabled={sendDisabled}
          title={isStreaming ? 'Stop' : 'Send'}
          aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          type="button"
        >
          {isStreaming ? (
            <StopIco size={12} fill="currentColor" />
          ) : (
            <ArrowUpIco size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
