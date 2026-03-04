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
} from 'lucide-react';
import { useCortexChat, useCortexHealth } from '../../hooks/useCortex';
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

interface MessageBubbleProps {
  message: Message;
  onCopy: () => void;
  onRegenerate?: () => void;
  onFeedback?: (positive: boolean) => void;
  onNavigate?: (href: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onRegenerate,
  onFeedback,
  onNavigate,
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
// WELCOME SCREEN - Role-aware, value-forward
// ═══════════════════════════════════════════════════════════════════════════════

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
  greeting?: { text: string; subtitle?: string } | null;
  lastWork?: { contextTitle: string; contextType: string } | null;
  nextTask?: { taskTitle: string; taskDescription?: string } | null;
}

const DEVICE_PROMPTS = [
  {
    label: '510(k) Submission',
    prompt:
      'I need to prepare a 510(k) submission. Help me identify a predicate device, structure the substantial equivalence argument, and list the required sections.',
    sub: 'Predicate selection · SE argument · document checklist',
  },
  {
    label: 'PMA Strategy',
    prompt:
      'Walk me through the PMA pathway for a Class III device. What clinical evidence do I need, and what are the key milestones?',
    sub: 'Clinical evidence · IDE requirements · panel review',
  },
  {
    label: 'Design Controls (21 CFR 820)',
    prompt:
      'Help me set up a design controls framework for my medical device under 21 CFR 820.30. Generate the design history file outline.',
    sub: 'DHF · design inputs/outputs · V&V plan',
  },
  {
    label: 'De Novo Request',
    prompt:
      'My device has no predicate. Walk me through the De Novo classification request process and help me draft the request package.',
    sub: 'Novel device pathway · classification criteria',
  },
];

const BIOTECH_PROMPTS = [
  {
    label: 'IND Application',
    prompt:
      'Help me prepare an IND application for a Phase 1 oncology trial. Generate the CTD-formatted outline and identify the critical chemistry, manufacturing and controls sections.',
    sub: 'CTD format · CMC · preclinical summary · protocol',
  },
  {
    label: 'Clinical Trial Protocol',
    prompt:
      'Draft a Phase 1 dose-escalation protocol for a small molecule oncology drug. Include eligibility criteria, endpoints, and safety monitoring plan.',
    sub: 'Dose escalation · endpoints · DSMB plan',
  },
  {
    label: 'NDA / BLA Readiness',
    prompt:
      'We are approaching NDA submission. What are the FDA priority review criteria, and how do I structure the integrated summary of efficacy and safety?',
    sub: 'Module 5 · ISE · ISS · labeling strategy',
  },
  {
    label: 'FDA Meeting Request',
    prompt:
      'Help me draft a Type B pre-IND meeting request with FDA. What questions should I include and how should I structure the briefing document?',
    sub: 'Pre-IND · Type B · briefing document format',
  },
];

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSuggestionClick,
  greeting,
  lastWork,
  nextTask,
}) => {
  const [activeTab, setActiveTab] = useState<'device' | 'biotech'>('device');

  const prompts = activeTab === 'device' ? DEVICE_PROMPTS : BIOTECH_PROMPTS;

  return (
    <div className="flex flex-col items-center w-full px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">
            {greeting?.text || 'Good morning — ready to work?'}
          </h1>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto leading-relaxed">
            Lumen is your AI co-author for FDA regulatory submissions, clinical trial design, and
            compliance strategy. Tell me what you're working on and I'll generate documents,
            identify gaps, and guide every step.
          </p>
        </div>

        {/* What it does — 3 power pillars */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            {
              icon: '📄',
              title: 'Draft Documents',
              body: 'Generate submission-ready regulatory documents — INDs, 510(k)s, protocols, CMC sections, labeling.',
            },
            {
              icon: '🔍',
              title: 'Analyze & Advise',
              body: 'Get instant answers on FDA regulations, pathway selection, predicate strategy, and clinical evidence gaps.',
            },
            {
              icon: '✅',
              title: 'Check Compliance',
              body: 'Validate your submissions against 21 CFR, ICH guidelines, and current FDA guidance documents.',
            },
          ].map(p => (
            <div key={p.title} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-xl mb-2">{p.icon}</div>
              <div className="text-sm font-semibold text-zinc-800 mb-1">{p.title}</div>
              <div className="text-xs text-zinc-500 leading-relaxed">{p.body}</div>
            </div>
          ))}
        </div>

        {/* Continuing work */}
        {(nextTask || lastWork) && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
              Pick up where you left off
            </div>
            {nextTask && (
              <button
                onClick={() => onSuggestionClick(nextTask.taskTitle)}
                className="block w-full text-left text-sm font-medium text-blue-900 hover:text-blue-700 transition-colors"
              >
                → {nextTask.taskTitle}
              </button>
            )}
            {lastWork && (
              <button
                onClick={() => onSuggestionClick(`Continue: ${lastWork.contextTitle}`)}
                className="block w-full text-left text-xs text-blue-600 mt-1 hover:text-blue-800 transition-colors"
              >
                Continue: {lastWork.contextTitle}
              </button>
            )}
          </div>
        )}

        {/* Role tabs */}
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-4">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-2">
              I work in:
            </span>
            {(['device', 'biotech'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  activeTab === tab
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                )}
              >
                {tab === 'device' ? '🩺 Medical Device & Diagnostics' : '🧬 Biotech & Clinical'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {prompts.map((p, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(p.prompt)}
                className="group flex items-start gap-4 p-4 rounded-xl border border-zinc-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 text-left transition-all duration-150"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 group-hover:text-blue-800 mb-0.5">
                    {p.label}
                  </div>
                  <div className="text-xs text-zinc-400">{p.sub}</div>
                </div>
                <ArrowUp className="w-4 h-4 text-zinc-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 rotate-45" />
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400">
          Or type any question about FDA regulations, your submission, or your clinical program
          below ↓
        </p>
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
            autoFocus
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

  // Handle suggestion click — auto-send immediately (Claude.ai behavior)
  const handleSuggestionClick = (text: string) => {
    if (!isLoading && !isStreaming) {
      streamMessage(text);
    } else {
      setInput(text);
    }
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
    <div className="flex flex-col flex-1 min-h-0 bg-[#FAFAF9]">
      {/* Connection status indicator - only show if confirmed unhealthy after load */}
      {health && !isConnected && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>AI running in offline mode — responses continue normally</span>
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
        className="flex-1 min-h-0 overflow-y-auto zen-scroll"
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
        placeholder="Message Lumen..."
      />
    </div>
  );
};

export default ZenChat;
