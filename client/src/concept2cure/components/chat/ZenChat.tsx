/**
 * @fileoverview Zen Chat Hub
 * @module concept2cure/components/chat/ZenChat
 * @version 3.0.0
 *
 * @description
 * Claude.ai / ChatGPT style conversational interface.
 * Clean, focused, breathing room for thinking.
 *
 * Now connected to Lumen Cortex backend for real AI responses.
 *
 * Design Philosophy:
 * - Content-first: Messages are the hero
 * - Minimal chrome: UI fades away during conversation
 * - Thoughtful animation: Smooth, never jarring
 * - Accessible: Keyboard navigable, screen reader friendly
 *
 * @compliance
 * - FDA 21 CFR Part 11: All messages logged with timestamps
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  Paperclip,
  Sparkles,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Check,
  FileText,
  ChevronDown,
  ArrowUp,
  StopCircle,
  AlertCircle,
  WifiOff,
  ExternalLink,
  Save,
  Download,
  PenTool,
  Loader2,
} from 'lucide-react';
import { useCortexChat, useCortexHealth } from '../../hooks/useCortex';
import { useDocumentActions } from '../../hooks/useDocumentActions';
import type { CortexArtifact } from '../../services/cortexService';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isStreaming?: boolean;
  artifacts?: CortexArtifact[];
  error?: string;
}

interface Attachment {
  id: string;
  name: string;
  type: 'document' | 'image' | 'data';
  size: number;
}

interface ZenChatProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  threadId?: string;
  /** Auto-send this message on mount (e.g., from IND Workspace "Draft with AI") */
  initialMessage?: string | null;
  onNewArtifact?: (artifact: CortexArtifact) => void;
  onThreadChange?: (threadId: string) => void;
  /** Personalized greeting from user intelligence */
  greeting?: { text: string; subtitle?: string } | null;
  /** Last work session summary for continuity */
  lastWork?: { contextTitle: string; contextType: string } | null;
  /** AI-recommended next task */
  nextTask?: { taskTitle: string; taskDescription?: string } | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1.5 py-1">
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse delay-100" />
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse delay-200" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE COMPONENT - Clean, readable, actionable
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT ACTION BUTTONS - Save to Vault, Export DOCX, Open in Editor
// ═══════════════════════════════════════════════════════════════════════════════

interface ArtifactActionsProps {
  artifact: CortexArtifact;
  onSave: (artifact: CortexArtifact) => void;
  onExport: (artifact: CortexArtifact) => void;
  onOpenEditor: (artifact: CortexArtifact) => void;
  savingId: string | null;
  savedIds: Set<string>;
}

const ArtifactActions: React.FC<ArtifactActionsProps> = ({
  artifact,
  onSave,
  onExport,
  onOpenEditor,
  savingId,
  savedIds,
}) => {
  const isSaving = savingId === artifact.id;
  const isSaved = savedIds.has(artifact.id);

  return (
    <div className="mt-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-zinc-800 truncate">
          {artifact.title}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave(artifact)}
          disabled={isSaving || isSaved}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            isSaved
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
          )}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSaved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaved ? 'Saved' : 'Save to Vault'}
        </button>
        <button
          onClick={() => onExport(artifact)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export DOCX
        </button>
        <button
          onClick={() => onOpenEditor(artifact)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <PenTool className="w-3.5 h-3.5" />
          Open in Editor
        </button>
      </div>
    </div>
  );
};

interface MessageBubbleProps {
  message: Message;
  onCopy: () => void;
  onRegenerate?: () => void;
  onFeedback?: (positive: boolean) => void;
  onNavigate?: (href: string) => void;
  onSaveArtifact?: (artifact: CortexArtifact) => void;
  onExportArtifact?: (artifact: CortexArtifact) => void;
  onOpenEditorArtifact?: (artifact: CortexArtifact) => void;
  savingArtifactId?: string | null;
  savedArtifactIds?: Set<string>;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onRegenerate,
  onFeedback,
  onNavigate,
  onSaveArtifact,
  onExportArtifact,
  onOpenEditorArtifact,
  savingArtifactId,
  savedArtifactIds,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const actionLinks = useMemo(() => {
    const links: Array<{ href: string; label: string }> = [];
    const markdownRegex = /\[([^\]]+)\]\(((https?:\/\/[^\s)]+)|(\/[^\s)]+))\)/g;
    let match;
    while ((match = markdownRegex.exec(message.content)) !== null) {
      links.push({ href: match[2], label: match[1] });
    }

    const urlRegex = /(https?:\/\/[^\s)]+)/g;
    const urls = message.content.match(urlRegex) || [];
    urls.forEach(href => {
      if (!links.some(l => l.href === href)) {
        const label = href.replace(/^https?:\/\//, '').split('/')[0];
        links.push({ href, label });
      }
    });

    const internalRegex =
      /(^|[\s(])\/(concept2cure|csr|vault|analytics|dashboard|coauthor|admin)[^\s)]*/g;
    const internalMatches = message.content.match(internalRegex) || [];
    internalMatches
      .map(raw => raw.trim())
      .forEach(raw => {
        const href = raw.startsWith('/') ? raw : raw.slice(1);
        if (!links.some(l => l.href === href)) {
          links.push({ href, label: `Open ${href}` });
        }
      });

    return links;
  }, [message.content]);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'group px-4 sm:px-6 py-7 border-b border-zinc-100 last:border-b-0',
        'transition-all duration-200 animate-in fade-in slide-in-from-bottom-2',
        !isUser && 'bg-white'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-4">
          {/* Avatar */}
          <div
            className={cn(
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm',
              isUser ? 'bg-zinc-900' : 'bg-gradient-to-br from-violet-500 to-violet-600'
            )}
          >
            {isUser ? (
              <span className="text-xs font-semibold text-white">U</span>
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-zinc-900">
                {isUser ? 'You' : 'Lumen'}
              </span>
            </div>

            {/* Message content */}
            <div className="prose prose-zinc prose-sm max-w-none">
              {message.isStreaming ? (
                <div className="flex items-center gap-2">
                  <TypingIndicator />
                </div>
              ) : (
                <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              )}
            </div>

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.attachments.map(attachment => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-lg text-sm text-zinc-600"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[150px]">{attachment.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Artifact document actions - Save to Vault, Export, Edit */}
            {!message.isStreaming &&
              !isUser &&
              message.artifacts &&
              message.artifacts.length > 0 &&
              onSaveArtifact && (
                <div className="mt-3 space-y-2">
                  {message.artifacts.map(artifact => (
                    <ArtifactActions
                      key={artifact.id}
                      artifact={artifact}
                      onSave={onSaveArtifact}
                      onExport={onExportArtifact || (() => {})}
                      onOpenEditor={onOpenEditorArtifact || (() => {})}
                      savingId={savingArtifactId || null}
                      savedIds={savedArtifactIds || new Set()}
                    />
                  ))}
                </div>
              )}

            {/* Actions - appear on hover */}
            {!message.isStreaming && actionLinks.length > 0 && !isUser && (
              <div className="mt-3 flex flex-wrap gap-2">
                {actionLinks.map(link => (
                  <button
                    key={link.href}
                    onClick={() => onNavigate?.(link.href)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {link.label}
                  </button>
                ))}
              </div>
            )}

            {!message.isStreaming && (
              <div
                className={cn(
                  'flex items-center gap-1 mt-3 transition-opacity duration-150',
                  showActions ? 'opacity-100' : 'opacity-0'
                )}
              >
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                  title="Copy"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                {!isUser && (
                  <>
                    <button
                      onClick={() => onFeedback?.(true)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Good response"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onFeedback?.(false)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Bad response"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onRegenerate}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Regenerate"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                )}

                <button
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                  title="More"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN - Personalized, like Claude.ai
// ═══════════════════════════════════════════════════════════════════════════════

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
  greeting?: { text: string; subtitle?: string } | null;
  lastWork?: { contextTitle: string; contextType: string } | null;
  nextTask?: { taskTitle: string; taskDescription?: string } | null;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSuggestionClick,
  greeting,
  lastWork,
  nextTask,
}) => {
  const suggestions = [
    // If we have AI-recommended next task, show it first
    ...(nextTask
      ? [
          {
            title: nextTask.taskTitle,
            description: nextTask.taskDescription || 'AI-recommended next step',
            highlight: true,
          },
        ]
      : []),
    // If we have last work context, offer to continue
    ...(lastWork
      ? [
          {
            title: `Continue: ${lastWork.contextTitle}`,
            description: `Pick up where you left off with ${lastWork.contextType.replace(/_/g, ' ')}`,
            highlight: false,
          },
        ]
      : []),
    {
      title: 'Start a 510(k) submission',
      description: 'Guide me through the predicate device selection',
      highlight: false,
    },
    {
      title: 'Draft an IND protocol',
      description: 'Help me design a Phase 1 clinical trial',
      highlight: false,
    },
    {
      title: 'Analyze regulatory pathway',
      description: 'Compare 510(k) vs PMA for my device',
      highlight: false,
    },
    {
      title: 'Generate submission documents',
      description: 'Create an indications for use statement',
      highlight: false,
    },
  ].slice(0, 5); // Show max 5 suggestions

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
      {/* Logo & personalized greeting */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-md shadow-violet-500/20">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 mb-2">
          {greeting?.text || 'How can I help today?'}
        </h1>
        <p className="text-sm text-zinc-500 max-w-md">
          {greeting?.subtitle
            ? `${greeting.subtitle} · Lumen Cortex is ready`
            : "I'm Lumen, your regulatory intelligence assistant."}
        </p>
      </div>

      {/* Suggestions */}
      <div className="flex flex-col gap-2 max-w-2xl w-full">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.title)}
            className={cn(
              'group p-4 text-left rounded-xl border bg-white transition-all duration-150',
              suggestion.highlight
                ? 'border-violet-300 bg-violet-50/50 hover:border-violet-400 hover:bg-violet-50'
                : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
            )}
          >
            <div
              className={cn(
                'text-sm font-medium group-hover:text-zinc-950',
                suggestion.highlight ? 'text-violet-900' : 'text-zinc-900'
              )}
            >
              {suggestion.title}
            </div>
            <div
              className={cn(
                'text-xs mt-1',
                suggestion.highlight ? 'text-violet-600' : 'text-zinc-500'
              )}
            >
              {suggestion.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT AREA - Claude.ai style rounded input
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isGenerating?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  placeholder = 'Message Lumen...',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  const canSend = value.trim().length > 0 && !isGenerating;

  return (
    <div className="border-t border-zinc-100 bg-white px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            'flex items-end gap-2 px-4 py-3 bg-white border rounded-2xl transition-all duration-200',
            isFocused
              ? 'border-blue-300 ring-4 ring-blue-50 shadow-sm'
              : 'border-zinc-200 hover:border-zinc-300'
          )}
        >
          {/* Attachment button */}
          <button
            className="flex-shrink-0 p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-base leading-6 min-h-[24px] max-h-[200px]"
          />

          {/* Send/Stop button */}
          {isGenerating ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 p-2 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors"
              title="Stop generating"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                'flex-shrink-0 p-2 rounded-full transition-all duration-200',
                canSend
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800 hover:scale-105'
                  : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              )}
              title="Send message"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-zinc-400 mt-2">
          Lumen can make mistakes. Verify important regulatory information.
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCROLL TO BOTTOM BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

interface ScrollButtonProps {
  visible: boolean;
  onClick: () => void;
}

const ScrollToBottomButton: React.FC<ScrollButtonProps> = ({ visible, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-white border border-zinc-200 rounded-full shadow-lg flex items-center gap-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-all duration-200',
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
    )}
  >
    <ChevronDown className="w-4 h-4" />
    <span>Scroll to bottom</span>
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenChat: React.FC<ZenChatProps> = ({
  projectId,
  projectName: _projectName,
  submissionType,
  threadId: initialThreadId,
  initialMessage,
  onNewArtifact,
  onThreadChange,
  greeting,
  lastWork,
  nextTask,
}) => {
  const [, setLocation] = useLocation();

  // Document actions for persisting artifacts
  const {
    saveArtifact,
    isSaving,
    exportDocx,
    openInEditor,
  } = useDocumentActions();

  // Track saving state per artifact
  const [savingArtifactId, setSavingArtifactId] = useState<string | null>(null);
  const [savedArtifactIds, setSavedArtifactIds] = useState<Set<string>>(new Set());

  // Cortex integration
  const {
    messages: cortexMessages,
    threadId,
    isLoading,
    isStreaming,
    error: chatError,
    streamMessage,
    cancelStream,
  } = useCortexChat({
    projectId,
    submissionType,
    threadId: initialThreadId,
    onArtifact: onNewArtifact,
  });

  // Health check
  const { data: health } = useCortexHealth({ refetchInterval: 60000 });
  const isConnected = health?.status === 'healthy';

  // Local state
  const [input, setInput] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Convert Cortex messages to local format
  const messages: Message[] = cortexMessages.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.timestamp,
    isStreaming: false,
    artifacts: m.metadata?.artifacts,
  }));

  // Add streaming indicator if active
  const displayMessages =
    isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant'
      ? messages.map((m, i) => (i === messages.length - 1 ? { ...m, isStreaming: true } : m))
      : messages;

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Notify parent of thread changes
  useEffect(() => {
    if (threadId && onThreadChange) {
      onThreadChange(threadId);
    }
  }, [threadId, onThreadChange]);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Check scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom && messages.length > 0);
  }, [messages.length]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, scrollToBottom]);

  // Send message - use real API
  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return;

    const messageText = input.trim();
    setInput('');

    try {
      // Use streaming for better UX
      streamMessage(messageText);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Stop generating
  const handleStop = () => {
    cancelStream();
  };

  // Copy message
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleNavigate = (href: string) => {
    if (href.startsWith('http')) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    setLocation(href);
  };

  // Handle artifact actions
  const handleSaveArtifact = useCallback(async (artifact: CortexArtifact) => {
    if (!projectId) return;
    setSavingArtifactId(artifact.id);
    try {
      await saveArtifact({
        projectId,
        title: artifact.title,
        content: artifact.content,
        type: artifact.format || 'markdown',
        category: 'document',
      });
      setSavedArtifactIds(prev => new Set(prev).add(artifact.id));
    } catch (err) {
      console.error('Failed to save artifact:', err);
    } finally {
      setSavingArtifactId(null);
    }
  }, [projectId, saveArtifact]);

  const handleExportArtifact = useCallback(async (artifact: CortexArtifact) => {
    try {
      await exportDocx(artifact.title, artifact.content);
    } catch (err) {
      console.error('Failed to export DOCX:', err);
    }
  }, [exportDocx]);

  const handleOpenEditorArtifact = useCallback((artifact: CortexArtifact) => {
    // If the artifact was saved and has an ID, open it in the editor
    openInEditor(artifact.id);
  }, [openInEditor]);

  // Handle suggestion click
  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  // Auto-send initial message (e.g., from IND Workspace → Draft with AI)
  const initialMessageSentRef = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && !isLoading && !isStreaming) {
      initialMessageSentRef.current = true;
      streamMessage(initialMessage);
    }
  }, [initialMessage, isLoading, isStreaming, streamMessage]);

  // Show welcome screen if no messages
  const showWelcome = displayMessages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#FAFAF9]">
      {/* Connection status indicator */}
      {!isConnected && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>Connecting to Lumen Cortex...</span>
        </div>
      )}

      {/* Error banner */}
      {chatError && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{chatError.message}</span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto zen-scroll"
      >
        {showWelcome ? (
          <WelcomeScreen
            onSuggestionClick={handleSuggestionClick}
            greeting={greeting}
            lastWork={lastWork}
            nextTask={nextTask}
          />
        ) : (
          <div className="py-4">
            {displayMessages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                onCopy={() => handleCopy(message.content)}
                onRegenerate={message.role === 'assistant' ? () => {} : undefined}
                onFeedback={positive =>
                  console.log('Feedback:', positive ? 'positive' : 'negative')
                }
                onNavigate={handleNavigate}
                onSaveArtifact={handleSaveArtifact}
                onExportArtifact={handleExportArtifact}
                onOpenEditorArtifact={handleOpenEditorArtifact}
                savingArtifactId={savingArtifactId}
                savedArtifactIds={savedArtifactIds}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <ScrollToBottomButton visible={showScrollButton} onClick={() => scrollToBottom()} />

      {/* Input area */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        isGenerating={isLoading || isStreaming}
        placeholder={isConnected ? 'Message Lumen...' : 'Connecting...'}
      />
    </div>
  );
};

export default ZenChat;
