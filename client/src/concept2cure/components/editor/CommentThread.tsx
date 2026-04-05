import React, { useState, useMemo, useRef } from "react";
import {
  MessageSquare,
  Reply,
  Check,
  CheckCircle,
  X,
  Filter,
  User,
  Clock,
  CornerDownRight,
  AtSign,
  Send,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface CommentThread {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolved: boolean;
  highlightedText?: string;
  replies: Array<{
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    createdAt: string;
  }>;
}

interface CommentThreadPanelProps {
  comments: CommentThread[];
  currentUserId?: string;
  onResolve: (commentId: string) => void;
  onReopen: (commentId: string) => void;
  onReply: (commentId: string, text: string) => void;
  onDelete: (commentId: string) => void;
  onNavigateToComment: (commentId: string) => void;
  onClose?: () => void;
  /** Called when user applies an AI rewrite — passes the rewritten text for the comment */
  onApplyAIRewrite?: (commentId: string, rewrittenText: string) => void;
}

type FilterMode = "all" | "open" | "resolved" | "mine";

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

const AUTHOR_COLORS = [
  "bg-stone-600",
  "bg-stone-900",
  "bg-stone-500",
  "bg-stone-900",
  "bg-stone-900",
  "bg-stone-900",
  "bg-stone-900",
  "bg-stone-900",
];

function getAuthorColor(authorId: string): string {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) {
    hash = (hash * 31 + authorId.charCodeAt(i)) | 0;
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

function AuthorAvatar({
  name,
  authorId,
  size = "sm",
}: {
  name: string;
  authorId: string;
  size?: "sm" | "md";
}) {
  const letter = name.charAt(0).toUpperCase();
  const color = getAuthorColor(authorId);
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full text-white font-medium shrink-0",
        color,
        size === "sm" ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"
      )}
    >
      {letter}
    </div>
  );
}

function ReplyInput({
  commentId,
  onReply,
}: {
  commentId: string;
  onReply: (commentId: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onReply(commentId, trimmed);
    setText("");
    setExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setExpanded(false);
      setText("");
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 pl-8"
      >
        <Reply className="h-3 w-3" />
        Reply
      </button>
    );
  }

  return (
    <div className="mt-2 pl-8 space-y-2">
      <div className="relative">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply... Use @name to mention"
          rows={2}
          className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 pr-8 resize-none focus-visible:ring-2 outline-none focus:ring-ring placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="absolute bottom-2 right-2 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors duration-150"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <AtSign className="h-3 w-3" />
          @mention supported
        </span>
        <button
          onClick={() => {
            setExpanded(false);
            setText("");
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** AI Rewrite Preview — shown after "Address with AI" is clicked */
function AIRewritePreview({
  rewrittenText,
  explanation,
  onApply,
  onDismiss,
}: {
  rewrittenText: string;
  explanation: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mt-2 ml-8 rounded-md border border-stone-200 bg-stone-100/40 p-3 space-y-2 transition-all duration-200"
      role="region"
      aria-label="AI rewrite suggestion"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-stone-500" />
        <span className="text-[11px] font-semibold text-stone-700">AI Suggestion</span>
      </div>
      <p className="text-[10px] text-stone-500 italic">{explanation}</p>
      <div className="rounded border border-stone-200 bg-white p-2 text-xs text-stone-700 leading-relaxed max-h-40 overflow-y-auto">
        {rewrittenText.length > 600 ? rewrittenText.substring(0, 600) + '...' : rewrittenText}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={onApply}
          className="px-3 py-1 text-[11px] font-medium text-white bg-stone-700 rounded-md hover:bg-stone-800 transition-colors duration-150 flex items-center gap-1"
          aria-label="Apply AI rewrite"
        >
          <Check className="h-3 w-3" />
          Apply
        </Button>
        <Button
          variant="ghost"
          onClick={onDismiss}
          className="px-3 py-1 text-[11px] font-medium text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors duration-150"
          aria-label="Dismiss AI rewrite"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  currentUserId,
  onResolve,
  onReopen,
  onReply,
  onDelete,
  onNavigateToComment,
  onApplyAIRewrite,
}: {
  comment: CommentThread;
  currentUserId?: string;
  onResolve: (commentId: string) => void;
  onReopen: (commentId: string) => void;
  onReply: (commentId: string, text: string) => void;
  onDelete: (commentId: string) => void;
  onNavigateToComment: (commentId: string) => void;
  onApplyAIRewrite?: (commentId: string, rewrittenText: string) => void;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRewrite, setAiRewrite] = useState<{ text: string; explanation: string } | null>(null);

  const handleAddressWithAI = async () => {
    setAiLoading(true);
    setAiRewrite(null);
    try {
      const res = await apiRequest('POST', `/api/comments/comments/${comment.id}/address-with-ai`, {});
      if (res.ok) {
        const data = await res.json();
        setAiRewrite({
          text: data.rewrittenText || '',
          explanation: data.explanation || 'Section rewritten to address feedback.',
        });
      } else {
        // Silently fail — the user can try again
        console.warn('[CommentThread] AI address failed');
      }
    } catch {
      console.warn('[CommentThread] AI service unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyRewrite = () => {
    if (aiRewrite && onApplyAIRewrite) {
      onApplyAIRewrite(comment.id, aiRewrite.text);
      onResolve(comment.id);
    }
    setAiRewrite(null);
  };

  return (
    <div
      className={cn(
        "group rounded-lg border border-border p-3 transition-all hover:shadow-sm",
        comment.resolved
          ? "opacity-60 bg-muted/30"
          : "bg-card hover:border-primary/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "h-2 w-2 rounded-full shrink-0 mt-0.5",
              comment.resolved ? "bg-stone-400" : "bg-stone-400"
            )}
          />
          <AuthorAvatar
            name={comment.authorName}
            authorId={comment.authorId}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {comment.authorName}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeTime(comment.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {comment.resolved ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReopen(comment.id);
              }}
              title="Reopen"
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddressWithAI();
                }}
                disabled={aiLoading}
                title="Address with AI"
                aria-label="Address comment with AI"
                className="p-1 rounded hover:bg-stone-100 text-muted-foreground hover:text-stone-600 transition-colors duration-150 disabled:opacity-50"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve(comment.id);
                }}
                title="Resolve"
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-stone-900 transition-colors duration-150"
              >
                <CheckCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(comment.id);
            }}
            title="Delete"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors duration-150"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Highlighted text excerpt */}
      {comment.highlightedText && (
        <button
          onClick={() => onNavigateToComment(comment.id)}
          className="mt-2 ml-8 block text-left w-[calc(100%-2rem)]"
        >
          <div className="border-l-2 border-primary/40 pl-2 py-0.5 bg-primary/5 rounded-r text-xs text-muted-foreground italic truncate hover:text-foreground transition-colors duration-150">
            &ldquo;{comment.highlightedText}&rdquo;
          </div>
        </button>
      )}

      {/* Comment text */}
      <p
        className="mt-2 ml-8 text-sm text-foreground cursor-pointer"
        onClick={() => onNavigateToComment(comment.id)}
      >
        {comment.text}
      </p>

      {/* Resolved badge */}
      {comment.resolved && (
        <div className="mt-2 ml-8 flex items-center gap-1 text-[10px] text-stone-900 font-medium">
          <Check className="h-3 w-3" />
          Resolved
        </div>
      )}

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="mt-3 ml-8 space-y-2 border-l border-border pl-3">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
              <AuthorAvatar
                name={reply.authorName}
                authorId={reply.authorId}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">
                    {reply.authorName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(reply.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-foreground mt-0.5">{reply.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Rewrite Loading */}
      {aiLoading && (
        <div className="mt-2 ml-8 flex items-center gap-2 text-xs text-stone-600" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Generating AI suggestion...</span>
        </div>
      )}

      {/* AI Rewrite Preview */}
      {aiRewrite && (
        <AIRewritePreview
          rewrittenText={aiRewrite.text}
          explanation={aiRewrite.explanation}
          onApply={handleApplyRewrite}
          onDismiss={() => setAiRewrite(null)}
        />
      )}

      {/* Reply input */}
      {!comment.resolved && (
        <ReplyInput commentId={comment.id} onReply={onReply} />
      )}
    </div>
  );
}

export function CommentThreadPanel({
  comments,
  currentUserId,
  onResolve,
  onReopen,
  onReply,
  onDelete,
  onNavigateToComment,
  onClose,
  onApplyAIRewrite,
}: CommentThreadPanelProps) {
  const [filter, setFilter] = useState<FilterMode>("open");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const filteredComments = useMemo(() => {
    switch (filter) {
      case "open":
        return comments.filter((c) => !c.resolved);
      case "resolved":
        return comments.filter((c) => c.resolved);
      case "mine":
        return currentUserId
          ? comments.filter((c) => c.authorId === currentUserId)
          : comments;
      case "all":
      default:
        return comments;
    }
  }, [comments, filter, currentUserId]);

  const openCount = comments.filter((c) => !c.resolved).length;

  const filterLabels: Record<FilterMode, string> = {
    all: "All",
    open: "Open",
    resolved: "Resolved",
    mine: "Mine",
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Comments</h3>
          {openCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu((prev) => !prev)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors duration-150",
                showFilterMenu
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Filter className="h-3 w-3" />
              {filterLabels[filter]}
            </button>
            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-32 rounded-md border border-border bg-popover shadow-sm py-1">
                  {(Object.keys(filterLabels) as FilterMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setFilter(mode);
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-1.5 text-xs transition-colors duration-150",
                        filter === mode
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {filterLabels[mode]}
                      {filter === mode && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0">
        {(Object.keys(filterLabels) as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors duration-150",
              filter === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {filterLabels[mode]}
            {mode === "open" && openCount > 0 && (
              <span className="ml-1">({openCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {filteredComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No comments
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === "open"
                ? "All comments have been resolved"
                : filter === "resolved"
                  ? "No resolved comments yet"
                  : filter === "mine"
                    ? "You haven't made any comments"
                    : "Select text in the editor to add a comment"}
            </p>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onResolve={onResolve}
              onReopen={onReopen}
              onReply={onReply}
              onDelete={onDelete}
              onNavigateToComment={onNavigateToComment}
              onApplyAIRewrite={onApplyAIRewrite}
            />
          ))
        )}
      </div>

      {/* Footer summary */}
      <div className="px-4 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" />
          {comments.length} comment{comments.length !== 1 ? "s" : ""} &middot;{" "}
          {openCount} open &middot; {comments.length - openCount} resolved
        </p>
      </div>
    </div>
  );
}

export default CommentThreadPanel;
