/**
 * useComments — React hook for document comment CRUD operations.
 *
 * Manages loading, creating, updating, deleting, and replying to comments
 * via the /api/comments server routes, keeping local state in sync.
 *
 * Uses optimistic updates: local state is updated immediately for
 * responsiveness, then reconciled with the server response.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CommentThread } from '../components/editor/extensions/CommentMark';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Convert a server comment row into a client-side CommentThread */
function serverToThread(sc: any): CommentThread {
  return {
    id: String(sc.id),
    text: sc.content || '',
    authorId: String(sc.authorId),
    authorName: sc.authorName || 'Unknown',
    createdAt: sc.createdAt,
    resolved: sc.status === 'resolved',
    highlightedText: sc.attachments?.highlightedText || '',
    replies: (sc.replies || []).map((r: any) => ({
      id: String(r.id),
      text: r.content || '',
      authorId: String(r.authorId),
      authorName: r.authorName || 'Unknown',
      createdAt: r.createdAt,
    })),
  };
}

interface UseCommentsReturn {
  comments: CommentThread[];
  setComments: React.Dispatch<React.SetStateAction<CommentThread[]>>;
  loading: boolean;
  loadComments: (documentId: number) => Promise<void>;
  /**
   * Create a comment on the server and return the persisted thread.
   * @param clientId — the temporary client-side ID so we can replace the
   *   optimistic entry with the server-assigned one.
   */
  createComment: (
    documentId: number,
    clientId: string,
    data: {
      content: string;
      highlightedText?: string;
      sectionReference?: string;
      commentType?: string;
    }
  ) => Promise<CommentThread | null>;
  updateComment: (
    commentId: string,
    data: {
      content?: string;
      status?: 'open' | 'resolved' | 'rejected' | 'incorporated';
      resolutionNote?: string;
    }
  ) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  addReply: (commentId: string, content: string) => Promise<void>;
}

export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadComments = useCallback(async (documentId: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/comments/documents/${documentId}/comments`, {
        headers: getAuthHeaders(),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const threads: CommentThread[] = (data.comments || []).map(serverToThread);
      setComments(threads);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[useComments] Failed to load comments, keeping local state:', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createComment = useCallback(
    async (
      documentId: number,
      clientId: string,
      data: {
        content: string;
        highlightedText?: string;
        sectionReference?: string;
        commentType?: string;
      }
    ): Promise<CommentThread | null> => {
      try {
        const res = await fetch(`/api/comments/documents/${documentId}/comments`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            content: data.content,
            highlightedText: data.highlightedText,
            sectionReference: data.sectionReference,
            commentType: data.commentType || 'general',
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const { comment } = await res.json();
        const thread = serverToThread(comment);

        // Replace the optimistic entry (matched by clientId) with the real server entry
        setComments(prev =>
          prev.map(c => (c.id === clientId ? { ...thread, highlightedText: c.highlightedText || thread.highlightedText } : c))
        );

        return thread;
      } catch (err: any) {
        console.warn('[useComments] Failed to persist comment:', err.message);
        return null;
      }
    },
    []
  );

  const updateComment = useCallback(
    async (
      commentId: string,
      data: {
        content?: string;
        status?: 'open' | 'resolved' | 'rejected' | 'incorporated';
        resolutionNote?: string;
      }
    ) => {
      try {
        const res = await fetch(`/api/comments/comments/${commentId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.warn('[useComments] Update failed:', errBody.error || `HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.warn('[useComments] Failed to update comment:', err.message);
      }
    },
    []
  );

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/comments/${commentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('[useComments] Delete failed:', errBody.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.warn('[useComments] Failed to delete comment:', err.message);
    }
  }, []);

  const addReply = useCallback(async (commentId: string, content: string) => {
    try {
      const res = await fetch(`/api/comments/comments/${commentId}/replies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('[useComments] Reply failed:', errBody.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.warn('[useComments] Failed to add reply:', err.message);
    }
  }, []);

  return {
    comments,
    setComments,
    loading,
    loadComments,
    createComment,
    updateComment,
    deleteComment,
    addReply,
  };
}
