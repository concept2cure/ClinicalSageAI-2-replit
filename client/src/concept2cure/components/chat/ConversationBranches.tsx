/**
 * Concept2Cure - Conversation Branches UI
 * 
 * Claude.ai parity: Fork/branch navigation for conversation history.
 * Allows users to create alternative conversation paths from any point.
 * 
 * @module concept2cure/components/chat/ConversationBranches
 * @version 1.0.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { Conversation, Message } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GitBranch,
  GitMerge,
  GitCommit,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Copy,
  Eye,
  MessageSquare,
  Clock,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationBranch {
  id: string;
  parentId: string | null;
  forkPointMessageId: string | null;
  title: string;
  summary?: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  children: ConversationBranch[];
}

interface ConversationBranchesProps {
  conversation: Conversation;
  branches: ConversationBranch[];
  activeBranchId: string;
  onBranchSelect: (branchId: string) => void;
  onBranchCreate: (forkPointMessageId: string) => void;
  onBranchDelete: (branchId: string) => void;
  className?: string;
}

interface ForkIndicatorProps {
  message: Message;
  branchCount: number;
  onForkClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

// ─────────────────────────────────────────────────────────────────────────────
// FORK INDICATOR (shown in message list)
// ─────────────────────────────────────────────────────────────────────────────

export const ForkIndicator: React.FC<ForkIndicatorProps> = ({
  message,
  branchCount,
  onForkClick,
}) => {
  if (branchCount === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={onForkClick}
            className={cn(
              'absolute -right-3 top-1/2 -translate-y-1/2',
              'flex items-center gap-1 px-1.5 py-0.5 rounded-full',
              'bg-amber-50 border border-amber-200 text-amber-700',
              'text-xs font-medium hover:bg-amber-100 transition-colors duration-150'
            )}
          >
            <GitBranch className="h-3 w-3" />
            {branchCount}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{branchCount} fork{branchCount !== 1 ? 's' : ''} from this point</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH TREE NODE
// ─────────────────────────────────────────────────────────────────────────────

interface BranchNodeProps {
  branch: ConversationBranch;
  depth: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const BranchNode: React.FC<BranchNodeProps> = ({
  branch,
  depth,
  isActive,
  onSelect,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = branch.children.length > 0;

  return (
    <div className="relative">
      {/* Connector line */}
      {depth > 0 && (
        <div
          className="absolute left-3 -top-2 h-4 w-px bg-stone-200"
          style={{ marginLeft: `${(depth - 1) * 16}px` }}
        />
      )}

      {/* Branch item */}
      <div
        className={cn(
          'group relative flex items-start gap-2 p-2 rounded-lg transition-colors cursor-pointer',
          isActive
            ? 'bg-blue-50 ring-1 ring-stone-300'
            : 'hover:bg-stone-50'
        )}
        style={{ marginLeft: `${depth * 16}px` }}
        onClick={onSelect}
      >
        {/* Branch icon */}
        <div className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
          isActive ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-500'
        )}>
          {depth === 0 ? (
            <GitCommit className="h-3.5 w-3.5" />
          ) : (
            <GitBranch className="h-3.5 w-3.5" />
          )}
        </div>

        {/* Branch info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm font-medium truncate',
              isActive ? 'text-blue-900' : 'text-stone-900'
            )}>
              {branch.title}
            </span>
            {isActive && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                Active
              </Badge>
            )}
          </div>
          {branch.summary && (
            <p className="text-xs text-stone-500 truncate mt-0.5">
              {truncateText(branch.summary, 60)}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {branch.messageCount}
            </span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(branch.updatedAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        {depth > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-150',
                  'hover:bg-stone-200 text-stone-400 hover:text-stone-600'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }}>
                <Eye className="h-4 w-4 mr-2" />
                View branch
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete branch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Expand toggle for children */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1 hover:bg-stone-100 rounded"
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 text-stone-400 transition-transform duration-150',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {branch.children.map((child) => (
            <BranchNode
              key={child.id}
              branch={child}
              depth={depth + 1}
              isActive={child.isActive}
              onSelect={() => {}}
              onDelete={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ConversationBranches: React.FC<ConversationBranchesProps> = ({
  conversation,
  branches,
  activeBranchId,
  onBranchSelect,
  onBranchCreate,
  onBranchDelete,
  className,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Build tree structure from flat branch list
  const branchTree = useMemo(() => {
    const branchMap = new Map<string, ConversationBranch>();
    branches.forEach(b => {
      branchMap.set(b.id, { ...b, children: [], isActive: b.id === activeBranchId });
    });

    const roots: ConversationBranch[] = [];
    branches.forEach(b => {
      const branch = branchMap.get(b.id)!;
      if (b.parentId && branchMap.has(b.parentId)) {
        branchMap.get(b.parentId)!.children.push(branch);
      } else {
        roots.push(branch);
      }
    });

    return roots;
  }, [branches, activeBranchId]);

  const totalBranches = branches.length;
  const activeBranch = branches.find(b => b.id === activeBranchId);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors duration-150',
            'text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900',
            totalBranches > 1 && 'text-amber-700 bg-amber-50 hover:bg-amber-100',
            className
          )}
        >
          <GitBranch className="h-4 w-4" />
          <span>
            {totalBranches === 1
              ? 'Main'
              : `${totalBranches} branch${totalBranches !== 1 ? 'es' : ''}`}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-amber-600" />
            Conversation Branches
          </DialogTitle>
          <DialogDescription>
            Explore alternative paths in this conversation. Fork from any point
            to try different approaches.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {/* Active branch indicator */}
          {activeBranch && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg mb-4">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-blue-900">
                  Currently on: {activeBranch.title}
                </span>
                <p className="text-xs text-blue-600 mt-0.5">
                  {activeBranch.messageCount} messages · {formatRelativeTime(activeBranch.updatedAt)}
                </p>
              </div>
            </div>
          )}

          {/* Branch tree */}
          <ScrollArea className="h-[300px] pr-2">
            <div className="space-y-1">
              {branchTree.map((branch) => (
                <BranchNode
                  key={branch.id}
                  branch={branch}
                  depth={0}
                  isActive={branch.id === activeBranchId}
                  onSelect={() => {
                    onBranchSelect(branch.id);
                    setIsDialogOpen(false);
                  }}
                  onDelete={() => onBranchDelete(branch.id)}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Help text */}
          <div className="mt-4 p-3 bg-stone-50 rounded-lg text-xs text-stone-500">
            <p className="font-medium text-stone-700 mb-1">💡 Pro tip</p>
            <p>
              To create a fork, hover over any message and click the branch icon.
              This lets you explore "what if" scenarios without losing your original path.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FORK ACTION BUTTON (for message hover)
// ─────────────────────────────────────────────────────────────────────────────

interface ForkActionButtonProps {
  messageId: string;
  onFork: (messageId: string) => void;
}

export const ForkActionButton: React.FC<ForkActionButtonProps> = ({
  messageId,
  onFork,
}) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFork(messageId)}
            className={cn(
              'p-1.5 rounded-md transition-colors duration-150',
              'text-stone-400 hover:text-amber-600 hover:bg-amber-50'
            )}
          >
            <GitBranch className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Fork conversation from here</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ConversationBranches;
