/**
 * useChatUpload — shared file-upload behaviour for every AnA chat composer.
 *
 * One implementation behind the main Ana composer, the MDX AnaRail, and the
 * PDEV AnaDock so upload behaviour stays identical across surfaces. Files POST to
 * /api/chat/upload, which OCRs the document and writes its text to project memory
 * (artifact + embedded atom) so AnA can retrieve the content.
 */

import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';

export interface ChatAttachment {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  fileId?: string;
  error?: string;
  /** How the server read the file (utf8 / pdf-text / pdf-ocr / image-ocr / docx). */
  extractionMethod?: string | null;
  /** Word count extracted into project memory. */
  extractionWords?: number;
}

/** "read · N words" sub-label for a ready attachment, or null when not read. */
export function attachmentReadLabel(
  method: string | null | undefined,
  words: number | undefined,
): string | null {
  if (!words || words <= 0) return null;
  const w = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
  return method === 'image-ocr' || method === 'pdf-ocr' ? `read via OCR · ${w}` : `read · ${w}`;
}

export interface UseChatUploadOptions {
  /** Scopes the upload to a project so extracted text lands in that project's memory. */
  projectId?: string | number | null;
}

export interface UseChatUpload {
  attachments: ChatAttachment[];
  uploading: boolean;
  /**
   * Latest upload-lifecycle message for an aria-live region (screen readers):
   * "Uploading X…", "X read, N words", "X failed to upload". Empty when idle.
   * Render it in a visually-hidden aria-live="polite" node next to the composer.
   */
  statusMessage: string;
  /** Upload one or many files (from an <input> or a drop). */
  addFiles: (files: FileList | File[] | null) => void;
  removeAttachment: (id: string) => void;
  clear: () => void;
}

/** File types the chat upload accepts (matches server-side extraction support). */
export const CHAT_UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.docx,.doc';

/** Max upload size (bytes). Comfortable for documents and multi-page scans. */
export const CHAT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** Accepted extensions, derived from CHAT_UPLOAD_ACCEPT (the single source). */
const ACCEPTED_EXTENSIONS = CHAT_UPLOAD_ACCEPT.split(',').map((e) => e.trim().toLowerCase());

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Validate a file before upload. Returns an error string to show inline, or null
 * when the file is acceptable — so bad files never hit the network.
 */
export function validateUploadFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Unsupported file type (${ext || 'no extension'})`;
  }
  if (file.size > CHAT_UPLOAD_MAX_BYTES) {
    return `File too large (${humanSize(file.size)} · max ${humanSize(CHAT_UPLOAD_MAX_BYTES)})`;
  }
  if (file.size === 0) {
    return 'File is empty';
  }
  return null;
}

/** Inline visually-hidden style for an aria-live status node (surfaces without a
 *  CSS module / sr-only utility, e.g. the MDX and PDEV rails). */
export const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function useChatUpload(options: UseChatUploadOptions = {}): UseChatUpload {
  const { projectId } = options;
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  const uploadOne = useCallback(
    async (file: File) => {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Client-side gate: reject oversized / unsupported / empty files before the
      // network round-trip, surfaced as an error chip with a clear reason.
      const validationError = validateUploadFile(file);
      if (validationError) {
        setAttachments((prev) => [
          ...prev,
          { id: localId, name: file.name, status: 'error', error: validationError },
        ]);
        setStatusMessage(`${file.name} rejected: ${validationError}`);
        return;
      }

      setAttachments((prev) => [...prev, { id: localId, name: file.name, status: 'uploading' }]);
      setStatusMessage(`Uploading ${file.name}…`);
      try {
        const form = new FormData();
        form.append('file', file);
        if (projectId != null) form.append('projectId', String(projectId));
        const res = await fetch('/api/chat/upload', { method: 'POST', body: form, credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        const method: string | null = data.extractionMethod ?? null;
        const words: number = typeof data.extractionWords === 'number' ? data.extractionWords : 0;
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, status: 'ready', fileId: data.fileId, extractionMethod: method, extractionWords: words }
              : a,
          ),
        );
        const read = attachmentReadLabel(method, words);
        setStatusMessage(read ? `${file.name} ${read}` : `${file.name} uploaded`);
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
              : a,
          ),
        );
        setStatusMessage(`${file.name} failed to upload`);
      }
    },
    [projectId],
  );

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => void uploadOne(file));
    },
    [uploadOne],
  );

  const removeAttachment = useCallback(
    (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id)),
    [],
  );

  const clear = useCallback(() => {
    setAttachments([]);
    setStatusMessage('');
  }, []);

  return {
    attachments,
    uploading: attachments.some((a) => a.status === 'uploading'),
    statusMessage,
    addFiles,
    removeAttachment,
    clear,
  };
}
