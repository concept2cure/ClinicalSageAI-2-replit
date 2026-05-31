import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './Composer.module.css';
import { Tooltip } from './Tooltip';

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ribleHint?: string;
  /** Scopes uploads to a project so extracted text lands in that project's memory. */
  projectId?: string;
}

/** A file attached in the composer, tracked through its upload lifecycle. */
interface ComposerAttachment {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  fileId?: string;
  extractionMethod?: string;
  error?: string;
}

const ICONS = {
  attach: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  spinner: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'ana-spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  ),
  close: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
};

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.docx,.doc';

export function Composer({ onSend, disabled, placeholder, ribleHint, projectId }: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  const uploadFile = useCallback(
    async (file: File) => {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [...prev, { id: localId, name: file.name, status: 'uploading' }]);
      try {
        const form = new FormData();
        form.append('file', file);
        if (projectId) form.append('projectId', projectId);
        const res = await fetch('/api/chat/upload', {
          method: 'POST',
          body: form,
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, status: 'ready', fileId: data.fileId, extractionMethod: data.extractionMethod }
              : a,
          ),
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

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    // Uploaded documents are OCR'd and written to project memory server-side, so
    // AnA retrieves their content. Reference them inline when the message is bare.
    const ready = attachments.filter((a) => a.status === 'ready');
    let text = trimmed;
    if (ready.length > 0) {
      const names = ready.map((a) => a.name).join(', ');
      text = trimmed ? `${trimmed}\n\n(Attached: ${names})` : `Review the attached: ${names}`;
    }
    if (!text) return;
    onSend(text);
    setValue('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploading = attachments.some((a) => a.status === 'uploading');

  return (
    <div
      className={styles.composer}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      style={
        dragging
          ? { outline: '1.5px dashed var(--c2c-accent, #d97757)', outlineOffset: '2px', borderRadius: '8px' }
          : undefined
      }
    >
      <style>{'@keyframes ana-spin { to { transform: rotate(360deg); } }'}</style>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {attachments.map((a) => (
            <span
              key={a.id}
              title={a.error || a.extractionMethod || a.name}
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
              {a.status === 'uploading' && ICONS.spinner}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                style={{
                  display: 'inline-flex',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  color: 'inherit',
                  opacity: 0.6,
                }}
              >
                {ICONS.close}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.inputRow}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Tooltip content="Attach files">
          <button
            className={styles.composerIcon}
            title="Attach files"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            type="button"
          >
            {ICONS.attach}
          </button>
        </Tooltip>
        <textarea
          ref={taRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Ask anything. AnA acts across your project.'}
          rows={1}
          disabled={disabled}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={disabled || uploading || (!value.trim() && attachments.length === 0)}
        >
          {ICONS.send}
        </button>
      </div>
      {ribleHint && <div className={styles.ribleHint}>{ribleHint}</div>}
    </div>
  );
}
