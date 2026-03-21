/**
 * @fileoverview Review Command Center — Structured review workflow hub
 * @module concept2cure/pages/MissionControl/ReviewCommandCenter
 *
 * Pending review queue, comments table, approval workflow lane,
 * overdue review alerts, reviewer bottleneck insights.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  User,
  ChevronDown,
  X,
  ArrowRight,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Send,
  Filter,
  RotateCcw,
  FileText,
} from 'lucide-react';
import {
  useArtifacts,
  useReviews,
  useCreateReview,
  useCollaboration,
  useCreateCollaboration,
  useTransitionArtifact,
} from '../../hooks/useMissionControl';

interface ReviewCommandCenterProps {
  programId: number | null;
  onOpenArtifact?: (artifactId: number) => void;
}

const REVIEW_VERDICT_COLORS: Record<string, { bg: string; text: string }> = {
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'needs-revision': { bg: 'bg-orange-50', text: 'text-orange-700' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700' },
  pending: { bg: 'bg-blue-50', text: 'text-blue-700' },
};

const COLLAB_TYPE_LABELS: Record<string, string> = {
  comment: 'Comment',
  question: 'Question',
  'requested-change': 'Change Request',
  'review-note': 'Review Note',
  'approval-request': 'Approval Request',
  escalation: 'Escalation',
  'decision-record': 'Decision',
  'internal-note': 'Internal Note',
  'sponsor-note': 'Sponsor Note',
  'region-note': 'Region Note',
  'qa-finding': 'QA Finding',
};

export const ReviewCommandCenter: React.FC<ReviewCommandCenterProps> = ({
  programId,
  onOpenArtifact,
}) => {
  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null);
  const [filterVerdict, setFilterVerdict] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('comment');

  const { data: artifacts = [], isLoading } = useArtifacts(programId);
  const { data: reviews = [] } = useReviews(selectedArtifactId);
  const { data: comments = [] } = useCollaboration('artifact', selectedArtifactId);
  const createReview = useCreateReview();
  const createComment = useCreateCollaboration();
  const transitionArtifact = useTransitionArtifact();

  // Artifacts in review or needing revision
  const reviewableArtifacts = useMemo(() => {
    return artifacts.filter((a: any) =>
      ['in-review', 'revision-needed', 'drafting'].includes(a.lifecycleState)
    );
  }, [artifacts]);

  // Stats
  const stats = useMemo(() => {
    const inReview = artifacts.filter((a: any) => a.lifecycleState === 'in-review').length;
    const needsRevision = artifacts.filter((a: any) => a.lifecycleState === 'revision-needed').length;
    const approved = artifacts.filter((a: any) => a.lifecycleState === 'approved').length;
    const total = artifacts.length;
    return { inReview, needsRevision, approved, total };
  }, [artifacts]);

  const selectedArtifact = useMemo(() => {
    return artifacts.find((a: any) => a.id === selectedArtifactId) || null;
  }, [artifacts, selectedArtifactId]);

  const handleSubmitReview = (verdict: string) => {
    if (!selectedArtifactId) return;
    createReview.mutate({
      artifactId: selectedArtifactId,
      reviewer: 'current-user',
      verdict,
      comments: newComment || undefined,
    });
    setNewComment('');
  };

  const handleAddComment = () => {
    if (!selectedArtifactId || !newComment.trim()) return;
    createComment.mutate({
      targetType: 'artifact',
      targetId: selectedArtifactId,
      type: commentType,
      body: newComment.trim(),
      author: 'current-user',
    });
    setNewComment('');
  };

  const handleTransition = (newState: string) => {
    if (!selectedArtifactId) return;
    transitionArtifact.mutate({ id: selectedArtifactId, newState });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f5] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Review Command Center</h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700">
            <Eye className="w-3 h-3" /> {stats.inReview} in review
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 text-orange-700">
            <AlertTriangle className="w-3 h-3" /> {stats.needsRevision} need revision
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> {stats.approved} approved
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Review Queue */}
        <div className="w-80 border-r bg-white overflow-y-auto">
          <div className="p-3 border-b">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Review Queue</h2>
          </div>
          <div className="divide-y">
            {reviewableArtifacts.length === 0 && (
              <div className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-700">All clear</p>
                <p className="text-xs text-zinc-500 mt-1">No artifacts pending review. Check the Dossier View for submission readiness.</p>
              </div>
            )}
            {reviewableArtifacts.map((artifact: any) => {
              const isActive = selectedArtifactId === artifact.id;
              return (
                <button
                  key={artifact.id}
                  onClick={() => setSelectedArtifactId(artifact.id)}
                  className={cn(
                    'w-full text-left p-3 transition-colors duration-150',
                    isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-zinc-50'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{artifact.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-zinc-500">{artifact.code}</span>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full',
                          artifact.lifecycleState === 'in-review' ? 'bg-blue-100 text-blue-700' :
                          artifact.lifecycleState === 'revision-needed' ? 'bg-orange-100 text-orange-700' :
                          'bg-amber-100 text-amber-700'
                        )}>
                          {artifact.lifecycleState}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Review Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedArtifact ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Eye className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Select an artifact to review</p>
                <p className="text-xs text-zinc-400 mt-1">Choose from the queue on the left</p>
              </div>
            </div>
          ) : (
            <>
              {/* Artifact Header */}
              <div className="border-b bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900">{selectedArtifact.title}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-mono text-zinc-500">{selectedArtifact.code}</span>
                      <span className="text-xs text-zinc-400">|</span>
                      <span className="text-xs text-zinc-600">{selectedArtifact.dossierModule || 'Unassigned'}</span>
                      <span className="text-xs text-zinc-400">|</span>
                      <span className="text-xs text-zinc-600 capitalize">{selectedArtifact.artifactType}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedArtifact.lifecycleState === 'in-review' && (
                      <>
                        <button
                          onClick={() => handleSubmitReview('approved')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleSubmitReview('needs-revision')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Request Revision
                        </button>
                      </>
                    )}
                    {selectedArtifact.lifecycleState === 'revision-needed' && (
                      <button
                        onClick={() => handleTransition('in-review')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Re-submit for Review
                      </button>
                    )}
                    {selectedArtifact.lifecycleState === 'drafting' && (
                      <button
                        onClick={() => handleTransition('in-review')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Submit for Review
                      </button>
                    )}
                    {onOpenArtifact && (
                      <button
                        onClick={() => onOpenArtifact(selectedArtifact.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Open
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Review History & Comments */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Review Cycles */}
                {reviews.length > 0 && (
                  <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Review History</h3>
                    <div className="space-y-3">
                      {reviews.map((review: any, idx: number) => {
                        const verdictColors = REVIEW_VERDICT_COLORS[review.verdict] || REVIEW_VERDICT_COLORS.pending;
                        return (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50">
                            <User className="w-4 h-4 mt-0.5 text-zinc-400" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-zinc-900">{review.reviewer}</span>
                                <span className={cn('text-xs px-1.5 py-0.5 rounded-full', verdictColors.bg, verdictColors.text)}>
                                  {review.verdict}
                                </span>
                                <span className="text-xs text-zinc-400 ml-auto">
                                  {review.reviewedAt ? new Date(review.reviewedAt).toLocaleDateString() : '—'}
                                </span>
                              </div>
                              {review.comments && (
                                <p className="text-xs text-zinc-600 mt-1">{review.comments}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Collaboration Thread */}
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Discussion</h3>
                  {comments.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-4">No comments yet</p>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50">
                          <MessageSquare className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-900">{comment.author}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                {COLLAB_TYPE_LABELS[comment.type] || comment.type}
                              </span>
                              <span className="text-xs text-zinc-400 ml-auto">
                                {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-600 mt-1">{comment.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Comment Input */}
              <div className="border-t bg-white px-6 py-3">
                <div className="flex items-center gap-2">
                  <select
                    value={commentType}
                    onChange={e => setCommentType(e.target.value)}
                    className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
                  >
                    <option value="comment">Comment</option>
                    <option value="question">Question</option>
                    <option value="requested-change">Change Request</option>
                    <option value="review-note">Review Note</option>
                    <option value="qa-finding">QA Finding</option>
                    <option value="internal-note">Internal Note</option>
                  </select>
                  <input
                    type="text"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                    placeholder="Add a comment..."
                    className="flex-1 text-sm px-3 py-1.5 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewCommandCenter;
