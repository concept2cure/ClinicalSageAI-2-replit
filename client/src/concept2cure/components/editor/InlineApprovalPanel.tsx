/**
 * Inline Approval Panel — Sentence/selection-level approval requests
 *
 * Shows a floating panel when text is selected, allowing users to:
 *   - Request approval on highlighted text
 *   - Request review / comment
 *   - View existing annotations on the selection
 *   - Reply to and resolve annotations
 *
 * Annotations are stored per-document with text range references,
 * enabling sentence-level and paragraph-level approval workflows.
 *
 * @module concept2cure/components/editor/InlineApprovalPanel
 * @compliance FDA 21 CFR Part 11 — all annotations are audit-logged
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Send,
  User,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InlineAnnotation {
  id: number;
  documentId: number;
  annotationType: 'approval_request' | 'review_request' | 'comment' | 'question' | 'suggestion';
  selectedText: string;
  rangeFrom: number;
  rangeTo: number;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdBy: string;
  createdByRole?: string;
  assignedTo?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  replies: Array<{
    id: number;
    content: string;
    createdBy: string;
    createdAt: string;
  }>;
}

interface InlineApprovalPanelProps {
  documentId: number;
  selectedText: string;
  selectionRange: { from: number; to: number } | null;
  onClose: () => void;
  onAnnotationCreated?: (annotation: InlineAnnotation) => void;
}

const ANNOTATION_TYPES = [
  { key: 'approval_request', label: 'Request Approval', icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'review_request', label: 'Request Review', icon: Eye, color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'comment', label: 'Comment', icon: MessageSquare, color: 'text-zinc-600', bg: 'bg-zinc-50' },
  { key: 'question', label: 'Question', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'suggestion', label: 'Suggestion', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
] as const;

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  approved: { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Rejected', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  resolved: { label: 'Resolved', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

// ── Component ────────────────────────────────────────────────────────────────

const InlineApprovalPanel: React.FC<InlineApprovalPanelProps> = ({
  documentId,
  selectedText,
  selectionRange,
  onClose,
  onAnnotationCreated,
}) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'create'>('create');
  const [annotationType, setAnnotationType] = useState<string>('approval_request');
  const [content, setContent] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch existing annotations for this document
  const { data: annotations = [] } = useQuery<InlineAnnotation[]>({
    queryKey: ['inline-annotations', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/inline-annotations/${documentId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: documentId > 0,
  });

  // Filter annotations that overlap with current selection
  const overlappingAnnotations = useMemo(() => {
    if (!selectionRange) return [];
    return annotations.filter(a =>
      (a.rangeFrom <= selectionRange.to && a.rangeTo >= selectionRange.from)
    );
  }, [annotations, selectionRange]);

  // Create annotation mutation
  const createAnnotation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/inline-annotations/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create annotation');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inline-annotations', documentId] });
      onAnnotationCreated?.(data);
      setContent('');
      setAssignedTo('');
      onClose();
    },
  });

  // Reply to annotation
  const replyToAnnotation = useMutation({
    mutationFn: async ({ annotationId, reply }: { annotationId: number; reply: string }) => {
      const res = await fetch(`/api/inline-annotations/${documentId}/${annotationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply }),
      });
      if (!res.ok) throw new Error('Failed to reply');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inline-annotations', documentId] });
      setReplyContent('');
      setReplyingTo(null);
    },
  });

  // Resolve/decide annotation
  const decideAnnotation = useMutation({
    mutationFn: async ({ annotationId, decision, note }: { annotationId: number; decision: string; note?: string }) => {
      const res = await fetch(`/api/inline-annotations/${documentId}/${annotationId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) throw new Error('Failed to decide');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inline-annotations', documentId] });
    },
  });

  const handleCreate = () => {
    if (!content.trim() || !selectionRange) return;
    createAnnotation.mutate({
      annotationType,
      selectedText,
      rangeFrom: selectionRange.from,
      rangeTo: selectionRange.to,
      content: content.trim(),
      assignedTo: assignedTo.trim() || undefined,
      priority,
    });
  };

  return (
    <div className="w-80 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-zinc-50/50">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-zinc-800">Inline Annotation</span>
        </div>
        <div className="flex items-center gap-1">
          {overlappingAnnotations.length > 0 && (
            <button
              onClick={() => setMode(mode === 'view' ? 'create' : 'view')}
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                mode === 'view' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100',
              )}
            >
              {mode === 'view' ? 'New' : `View (${overlappingAnnotations.length})`}
            </button>
          )}
          <button onClick={onClose} className="p-0.5 text-zinc-400 hover:text-zinc-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Selected text preview */}
      <div className="px-4 py-2 bg-amber-50/50 border-b border-amber-100">
        <p className="text-[10px] text-amber-600 font-medium mb-0.5">Selected Text</p>
        <p className="text-xs text-zinc-700 line-clamp-2 italic">
          &ldquo;{selectedText.slice(0, 150)}{selectedText.length > 150 ? '...' : ''}&rdquo;
        </p>
      </div>

      {/* ── Create mode ── */}
      {mode === 'create' && (
        <div className="p-4 space-y-3">
          {/* Annotation type selector */}
          <div>
            <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Type</p>
            <div className="flex flex-wrap gap-1">
              {ANNOTATION_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setAnnotationType(t.key)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                    annotationType === t.key
                      ? `${t.bg} ${t.color} ring-1 ring-current/20`
                      : 'text-zinc-500 hover:bg-zinc-100',
                  )}
                >
                  <t.icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comment / request content */}
          <div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={
                annotationType === 'approval_request'
                  ? 'Describe what needs approval...'
                  : annotationType === 'review_request'
                    ? 'What should the reviewer focus on?'
                    : 'Add your comment...'
              }
              rows={3}
              className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* Assign to (for approval/review requests) */}
          {(annotationType === 'approval_request' || annotationType === 'review_request') && (
            <div>
              <input
                type="text"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="Assign to (name or email)..."
                className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Priority */}
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-medium text-zinc-500">Priority:</p>
            {(['low', 'normal', 'high', 'critical'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium rounded transition-colors capitalize',
                  priority === p ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={!content.trim() || createAnnotation.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {annotationType === 'approval_request' ? 'Request Approval' :
             annotationType === 'review_request' ? 'Request Review' : 'Add Annotation'}
          </button>
        </div>
      )}

      {/* ── View mode ── */}
      {mode === 'view' && (
        <div className="max-h-72 overflow-y-auto divide-y">
          {overlappingAnnotations.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-zinc-400">No annotations on this selection</p>
            </div>
          ) : (
            overlappingAnnotations.map(ann => {
              const statusConf = STATUS_CONFIG[ann.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedId === ann.id;

              return (
                <div key={ann.id} className="p-3 space-y-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium', statusConf.bg, statusConf.color)}>
                        {statusConf.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-800">{ann.content}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">
                          {ann.createdBy} &middot; {new Date(ann.createdAt).toLocaleDateString()}
                          {ann.assignedTo && <> &middot; Assigned to: <span className="font-medium">{ann.assignedTo}</span></>}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 pl-2">
                      {/* Replies */}
                      {ann.replies.length > 0 && (
                        <div className="space-y-1.5">
                          {ann.replies.map(reply => (
                            <div key={reply.id} className="bg-zinc-50 rounded-lg p-2">
                              <p className="text-[11px] text-zinc-700">{reply.content}</p>
                              <p className="text-[9px] text-zinc-400 mt-0.5">
                                {reply.createdBy} &middot; {new Date(reply.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input */}
                      {replyingTo === ann.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={replyContent}
                            onChange={e => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            rows={2}
                            className="w-full text-xs px-2 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => replyToAnnotation.mutate({ annotationId: ann.id, reply: replyContent })}
                              disabled={!replyContent.trim()}
                              className="px-2 py-1 text-[10px] font-medium bg-blue-600 text-white rounded-md disabled:opacity-50"
                            >
                              Reply
                            </button>
                            <button
                              onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                              className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setReplyingTo(ann.id)}
                            className="px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 rounded-md"
                          >
                            Reply
                          </button>
                          {ann.status === 'pending' && (
                            <>
                              <button
                                onClick={() => decideAnnotation.mutate({ annotationId: ann.id, decision: 'approved' })}
                                className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-md flex items-center gap-0.5"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => decideAnnotation.mutate({ annotationId: ann.id, decision: 'rejected' })}
                                className="px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded-md flex items-center gap-0.5"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                          {(ann.status === 'pending' || ann.annotationType === 'comment' || ann.annotationType === 'question') && ann.status !== 'resolved' && (
                            <button
                              onClick={() => decideAnnotation.mutate({ annotationId: ann.id, decision: 'resolved' })}
                              className="px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded-md"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default InlineApprovalPanel;
