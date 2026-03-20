/**
 * useComments — React hook for document comment CRUD operations.
 *
 * Manages loading, creating, updating, deleting, and replying to comments
 * via the /api/comments server routes, keeping local state in sync.
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

// Server comment → client CommentThread
function serverToThread(sc: any): CommentThread {
  return {
    id: String(sc.id),
    text: sc.content,
    authorId: String(sc.authorId),
    authorName: sc.authorName || 'Unknown',
    createdAt: sc.createdAt,
    resolved: sc.status === 'resolved',
    highlightedText: sc.attachments?.highlightedText || '',
    replies: (sc.replies || []).map((r: any) => ({
      id: String(r.id),
      text: r.content,
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
  createComment: (documentId: number, data: {
    content: string;
    highlightedText?: string;
    sectionReference?: string;
    commentType?: string;
  }) => Promise<CommentThread | null>;
  updateComment: (commentId: string, data: {
    content?: string;
    status?: 'open' | 'resolved' | 'rejected' | 'incorporated';
    resolutionNote?: string;
  }) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  addReply: (commentId: string, content: string) => Promise<void>;
}

export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
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
      if (!res.ok) throw new Error('Failed to load comments');
      const data = await res.json();
      const threads: CommentThread[] = (data.comments || []).map(serverToThread);
      setComments(threads);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Failed to load comments from server, keeping local state');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createComment = useCallback(
    async (
      documentId: number,
      data: { content: string; highlightedText?: string; sectionReference?: string; commentType?: string }
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
        if (!res.ok) throw new Error('Failed to create comment');
        const { comment } = await res.json();
        const thread = serverToThread(comment);
        return thread;
      } catch (err) {
        console.warn('Failed to persist comment to server:', err);
        return null;
      }
    },
    []
  );

  const updateComment = useCallback(async (commentId: string, data: {
    content?: string;
    status?: 'open' | 'resolved' | 'rejected' | 'incorporated';
    resolutionNote?: string;
  }) => {
    try {
      const res = await fetch(`/api/comments/comments/${commentId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update comment');
    } catch (err) {
      console.warn('Failed to update comment on server:', err);
    }
  }, []);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/comments/${commentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete comment');
    } catch (err) {
      console.warn('Failed to delete comment on server:', err);
    }
  }, []);

  const addReply = useCallback(async (commentId: string, content: string) => {
    try {
      const res = await fetch(`/api/comments/comments/${commentId}/replies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to add reply');
    } catch (err) {
      console.warn('Failed to add reply on server:', err);
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
