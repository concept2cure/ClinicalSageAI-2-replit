/**
 * @fileoverview AnA — THE single unified AI chat (Claude.ai style)
 * @module concept2cure/components/chat/AnaPersistentPanel
 * @version 4.0.0
 *
 * ONE chat. ONE input. ONE conversation. Exactly like Claude.
 * The conversation fills the available space above the input bar.
 * Input bar is always at the bottom. Context-aware per workspace.
 *
 * This is the ONLY chat surface in the application.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import {
  Sparkles,
  ArrowUp,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Zap,
  MessageSquare,
  Image as ImageIcon,
  Download,
} from 'lucide-react';

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (content: string): string => {
  try {
    return marked.parse(content) as string;
  } catch {
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Base64 images from Nano Banana */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Downloadable PPTX from Nano Banana */
  pptx?: { base64: string; filename: string; mimeType: string };
}

interface SuggestedAction {
  id: string;
  label: string;
  intent?: string;
  description?: string;
}

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    /** Currently active document title (from editor) */
    activeDocumentTitle?: string;
    /** Brief excerpt of active document content (first ~300 chars, HTML stripped) */
    activeDocumentExcerpt?: string;
    /** CTD section of active document */
    activeDocumentCtdSection?: string;
  };
  /** Suggested actions shown as quick-start chips when conversation is empty */
  suggestedActions?: SuggestedAction[];
  /** Greeting text shown when no messages */
  greeting?: string;
  /** Initial message to auto-send on mount */
  initialMessage?: string | null;
  /** Callback when user triggers a suggested action */
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
  }) => void;
  /** Navigate to a layout mode or path */
  onNavigate?: (path: string) => void;
  /**
   * "full" = fills all available space, shows greeting + suggested actions (Claude.ai style)
   * "compact" = just the input bar at bottom, conversation expands as overlay
   */
  mode?: 'full' | 'compact';
  /** Pre-select the chat mode (standard, deep-research, or nano-banana) */
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
}

// ─── Context labels ──────────────────────────────────────────────────────────

const SCREEN_LABELS: Record<string, string> = {
  'regulatory-workspace': 'Regulatory Workspace',
  'ind-workspace': 'IND Workspace',
  author: 'Author',
  'collaboration-hub': 'Collaboration',
  'intelligence-hub': 'Intelligence',
  'review-readiness': 'Review & Readiness',
  'command-center': 'Command Center',
  biostatistics: 'Biostatistics',
  'agent-hub': 'Agent Hub',
  snowglobe: 'SnowGlobe',
  'document-sherpa': 'Document Sherpa',
  'review-pulse': 'Review Pulse',
  'legal-center': 'Legal Center',
  'training-center': 'Training Center',
  'knowledge-base': 'Knowledge Base',
  cmc: 'CMC Platform',
  'deep-research': 'Deep Research',
  'document-builder': 'Document Builder',
  projects: 'Home',
};

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({
  contextProfile,
  suggestedActions,
  greeting,
  initialMessage,
  onActionRun,
  onNavigate,
  mode = 'full',
  defaultChatMode = 'standard',
}) => {
  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research' | 'nano-banana'>(defaultChatMode);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageSentRef = useRef(false);

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';

  // Close mode dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
    };
    if (showModeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModeDropdown]);

  // AnA personality — rotating thinking messages
  const [thinkingMsg, setThinkingMsg] = useState('');
  useEffect(() => {
    if (!isThinking) return;
    const ANA_THINKING_MESSAGES = [
      'Analyzing your request...',
      'Reviewing regulatory guidance...',
      'Cross-referencing documents...',
      'Checking FDA requirements...',
      'Researching ICH guidelines...',
      'Reviewing compliance standards...',
      'Preparing your response...',
      'Searching regulatory databases...',
    ];
    setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
    const interval = setInterval(() => {
      setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
    }, 3000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const defaultGreeting = useMemo(() => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if (contextProfile?.activeDocumentTitle) {
      return `${timeGreeting}. Working on "${contextProfile.activeDocumentTitle}"${contextProfile.activeDocumentCtdSection ? ` (CTD ${contextProfile.activeDocumentCtdSection})` : ''}. How can I help?`;
    }
    if (contextProfile?.activeProject) {
      return `${timeGreeting}! Ready to make progress on ${contextProfile.activeProject}. What shall we tackle?`;
    }
    return `${timeGreeting}! I'm AnA, your regulatory co-pilot. What would you like to work on?`;
  }, [greeting, contextProfile?.activeProject]);

  // Auto-scroll when new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Handle initial message (auto-send once)
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      // Slight delay to let component mount
      setTimeout(() => handleSend(initialMessage), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isThinking) return;

    const userMsg: AnaMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      let data: any;

      if (chatMode === 'nano-banana') {
        // Route to Nano Banana (Gemini image gen) endpoint
        const response = await fetch('/api/nano-banana/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationHistory: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        data = await response.json();

        // Handle PPTX auto-download
        if (data.pptx) {
          const blob = new Blob(
            [Uint8Array.from(atob(data.pptx.base64), c => c.charCodeAt(0))],
            { type: data.pptx.mimeType }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.pptx.filename;
          a.click();
          URL.revokeObjectURL(url);
        }

        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.response || 'Here are your results.',
          timestamp: new Date(),
          images: data.images,
          pptx: data.pptx,
        }]);
      } else {
        // Standard / Deep Research → Lumen Cortex
        const response = await fetch('/api/lumen-cortex/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            chatMode,
            context: {
              screen: contextProfile?.screenName,
              project: contextProfile?.activeProject,
              projectId: contextProfile?.projectId,
              productType: contextProfile?.productType,
              userRole: contextProfile?.userRole,
              activeDocument: contextProfile?.activeDocumentTitle || undefined,
              activeDocumentExcerpt: contextProfile?.activeDocumentExcerpt || undefined,
              activeDocumentCtdSection: contextProfile?.activeDocumentCtdSection || undefined,
            },
            conversationHistory: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        data = await response.json();

        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.response || data.message || 'I can help with that. Could you share more details?',
          timestamp: new Date(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `I understand you'd like help with that. Let me know what specific aspect you'd like to explore and I'll provide guidance.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, contextProfile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestedAction = (action: SuggestedAction) => {
    if (action.intent && onActionRun) {
      onActionRun({
        id: action.id,
        intent: action.intent,
        label: action.label,
        status: 'running',
        ts: Date.now(),
      });
    }
    handleSend(action.label);
  };

  const hasMessages = messages.length > 0;
  const isCompact = mode === 'compact';

  // ── Compact mode: just input bar + expandable overlay ──
  if (isCompact) {
    return (
      <div className="flex-shrink-0 border-t border-zinc-200 bg-white relative z-30">
        {/* Expanded conversation overlay (slides up from bottom) */}
        {hasMessages && (
          <div className="max-h-[50vh] overflow-y-auto zen-scroll border-t border-zinc-200" style={{ scrollbarWidth: 'thin' }}>
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
              return (
                <div key={msg.id} className={cn('group px-4 py-3', isUser ? 'bg-zinc-50/60' : 'bg-white')}>
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', isUser ? 'bg-zinc-800 text-white' : 'bg-gradient-to-br from-violet-500 to-violet-700')}>
                      {isUser ? <span className="text-xs font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span> : <Sparkles className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-zinc-800">{isUser ? 'You' : 'AnA'}</span>
                      {isUser ? (
                        <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm prose-zinc max-w-none mt-0.5 prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-1.5 prose-strong:text-zinc-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div className="px-4 py-3 bg-white">
                <div className="flex gap-2.5 max-w-3xl mx-auto">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center flex-shrink-0 mt-0.5"><Sparkles className="w-3.5 h-3.5 text-white" /></div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-800">AnA</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input bar */}
        <div className="px-4 py-2.5 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className={cn(
              'flex items-end gap-2 px-3.5 py-2.5 bg-zinc-50 border rounded-2xl transition-colors duration-150',
              isFocused ? 'border-zinc-300 ring-2 ring-zinc-100 bg-white shadow-sm' : 'border-zinc-200 hover:border-zinc-300'
            )}>
              <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                <Sparkles className="w-4 h-4 text-violet-500" />
                {screenLabel && <span className="text-xs text-zinc-400 font-medium hidden sm:inline">{screenLabel}</span>}
              </div>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} placeholder="Message AnA..." rows={1} className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-sm leading-6 min-h-[24px] max-h-[120px]" />
              {hasMessages && (
                <button onClick={() => setMessages([])} className="flex-shrink-0 p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg transition-colors" title="New thread">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => handleSend()} disabled={!input.trim() || isThinking} className={cn('flex-shrink-0 p-2 rounded-full transition-colors duration-150', input.trim() && !isThinking ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed')} aria-label="Send message">
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Full mode: fills available space like Claude.ai ──
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Conversation area — fills available space ── */}
      <div className="flex-1 overflow-y-auto zen-scroll" style={{ scrollbarWidth: 'thin' }}>
        {!hasMessages && !isThinking ? (
          /* ── Empty state: greeting + suggested actions ── */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-2xl w-full text-center">
              {/* Greeting */}
              <div className="mb-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-violet-500/20">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-zinc-900">{defaultGreeting}</h2>
                {screenLabel && (
                  <p className="text-sm text-zinc-500 mt-2">{screenLabel}</p>
                )}
              </div>

              {/* Suggested actions */}
              {suggestedActions && suggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                  {suggestedActions.slice(0, 4).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleSuggestedAction(action)}
                      className="text-left px-5 py-4 rounded-xl border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all group"
                    >
                      <p className="text-sm font-medium text-zinc-800 group-hover:text-blue-900">{action.label}</p>
                      {action.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{action.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Messages ── */
          <div className="pb-2">
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'group px-4 py-3',
                    isUser ? 'bg-zinc-50/60' : 'bg-white'
                  )}
                  onMouseEnter={() => !isUser && setShowActions(msg.id)}
                  onMouseLeave={() => setShowActions(null)}
                >
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm',
                      isUser ? 'bg-zinc-800 text-white' : 'bg-gradient-to-br from-violet-500 to-violet-700'
                    )}>
                      {isUser ? (
                        <span className="text-xs font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span>
                      ) : (
                        <Sparkles className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-zinc-800">{isUser ? 'You' : 'AnA'}</span>
                      {isUser ? (
                        <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>
                      ) : (
                        <>
                          <div
                            className="prose prose-sm prose-zinc max-w-none mt-0.5
                              prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-1.5
                              prose-strong:text-zinc-900
                              prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                              prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-3 prose-pre:text-xs
                              prose-blockquote:border-l-violet-400 prose-blockquote:text-zinc-600
                              prose-ul:text-zinc-700 prose-ol:text-zinc-700
                              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                              [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                          />
                          {/* Nano Banana generated images */}
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.images.map((img, idx) => (
                                <img
                                  key={idx}
                                  src={`data:${img.mimeType};base64,${img.base64}`}
                                  alt={`Generated image ${idx + 1}`}
                                  className="rounded-lg border border-zinc-200 max-w-sm shadow-sm"
                                />
                              ))}
                            </div>
                          )}
                          {/* Nano Banana PPTX download button */}
                          {msg.pptx && (
                            <button
                              onClick={() => {
                                const blob = new Blob(
                                  [Uint8Array.from(atob(msg.pptx!.base64), c => c.charCodeAt(0))],
                                  { type: msg.pptx!.mimeType }
                                );
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = msg.pptx!.filename;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {msg.pptx.filename}
                            </button>
                          )}
                        </>
                      )}
                      {!isUser && (
                        <div className={cn(
                          'flex items-center gap-0.5 mt-1 transition-opacity duration-150',
                          showActions === msg.id ? 'opacity-100' : 'opacity-0'
                        )}>
                          <button onClick={() => handleCopy(msg.id, msg.content)} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Copy">
                            {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Good"><ThumbsUp className="w-3.5 h-3.5" /></button>
                          <button className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Bad"><ThumbsDown className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="px-4 py-4 bg-white">
                <div className="flex gap-3 max-w-3xl mx-auto">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-800">AnA</span>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                      </div>
                      <span className="text-sm text-violet-600 font-medium">{thinkingMsg || 'Thinking...'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom input bar — always visible ── */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto">
          {/* Clear conversation button */}
          {hasMessages && (
            <div className="flex justify-center mb-2">
              <button
                onClick={() => setMessages([])}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New thread
              </button>
            </div>
          )}

          <div className={cn(
            'flex items-end gap-2 px-3.5 py-2.5 bg-zinc-50 border rounded-2xl transition-colors duration-150',
            isFocused
              ? 'border-zinc-300 ring-2 ring-zinc-100 bg-white shadow-sm'
              : 'border-zinc-200 hover:border-zinc-300'
          )}>
            {/* Mode selector — Claude.ai model-picker style */}
            <div className="relative flex-shrink-0 self-center" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModeDropdown(prev => !prev)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                  chatMode === 'deep-research'
                    ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : chatMode === 'nano-banana'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
                )}
              >
                {chatMode === 'deep-research' ? (
                  <Zap className="w-3.5 h-3.5" />
                ) : chatMode === 'nano-banana' ? (
                  <ImageIcon className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {chatMode === 'deep-research' ? 'Deep Research' : chatMode === 'nano-banana' ? 'Nano Banana' : 'AnA'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showModeDropdown && (
                <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-white rounded-xl border border-zinc-200 shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setChatMode('standard'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors',
                      chatMode === 'standard' && 'bg-zinc-50'
                    )}
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 text-zinc-500 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">AnA</div>
                      <div className="text-xs text-zinc-500 leading-tight">Fast regulatory co-pilot for everyday questions</div>
                    </div>
                    {chatMode === 'standard' && <Check className="w-4 h-4 text-blue-600 ml-auto mt-0.5 flex-shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChatMode('deep-research'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors',
                      chatMode === 'deep-research' && 'bg-violet-50'
                    )}
                  >
                    <Zap className="w-4 h-4 mt-0.5 text-violet-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">Deep Research</div>
                      <div className="text-xs text-zinc-500 leading-tight">Multi-source search across ClinicalTrials.gov, PubMed, FDA &amp; more</div>
                    </div>
                    {chatMode === 'deep-research' && <Check className="w-4 h-4 text-violet-600 ml-auto mt-0.5 flex-shrink-0" />}
                  </button>
                  <div className="mx-2 my-0.5 border-t border-zinc-200" />
                  <button
                    type="button"
                    onClick={() => { setChatMode('nano-banana'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors',
                      chatMode === 'nano-banana' && 'bg-amber-50'
                    )}
                  >
                    <ImageIcon className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">Nano Banana</div>
                      <div className="text-xs text-zinc-500 leading-tight">AI image generation, presentations &amp; visual design via Gemini</div>
                    </div>
                    {chatMode === 'nano-banana' && <Check className="w-4 h-4 text-amber-600 ml-auto mt-0.5 flex-shrink-0" />}
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={chatMode === 'deep-research' ? 'Ask a deep research question...' : chatMode === 'nano-banana' ? 'Describe an image, infographic, or presentation...' : 'Message AnA...'}
              rows={1}
              className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-sm leading-6 min-h-[24px] max-h-[120px]"
            />

            {/* Send */}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isThinking}
              className={cn(
                'flex-shrink-0 p-2 rounded-full transition-colors duration-150',
                input.trim() && !isThinking
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnaPersistentPanel;
