/**
 * useChatUpload — shared file-upload behaviour for every AnA chat composer.
 *
 * One implementation behind the main Ana composer, the MDX AnaRail, and the
 * PDEV AnaDock so upload behaviour stays identical across surfaces. Files POST to
 * /api/chat/upload, which OCRs the document and writes its text to project memory
 * (artifact + embedded atom) so AnA can retrieve the content.
 */

import { useCallback, useState } from 'react';

export interface ChatAttachment {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  fileId?: string;
  error?: string;
}

export interface UseChatUploadOptions {
  /** Scopes the upload to a project so extracted text lands in that project's memory. */
  projectId?: string | number | null;
}

export interface UseChatUpload {
  attachments: ChatAttachment[];
  uploading: boolean;
  /** Upload one or many files (from an <input> or a drop). */
  addFiles: (files: FileList | File[] | null) => void;
  removeAttachment: (id: string) => void;
  clear: () => void;
}

/** File types the chat upload accepts (matches server-side extraction support). */
export const CHAT_UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.docx,.doc';

export function useChatUpload(options: UseChatUploadOptions = {}): UseChatUpload {
  const { projectId } = options;
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const uploadOne = useCallback(
    async (file: File) => {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [...prev, { id: localId, name: file.name, status: 'uploading' }]);
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

  const clear = useCallback(() => setAttachments([]), []);

  return {
    attachments,
    uploading: attachments.some((a) => a.status === 'uploading'),
    addFiles,
    removeAttachment,
    clear,
  };
}
