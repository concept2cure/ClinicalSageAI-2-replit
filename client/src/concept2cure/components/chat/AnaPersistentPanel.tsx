/**
 * @fileoverview AnA — Bottom-docked AI chat bar
 * @module concept2cure/components/chat/AnaPersistentPanel
 * @version 3.0.0
 *
 * A persistent, context-aware AI chat bar docked at the bottom of every page.
 * Always visible. Context-aware per screen. Can expand upward to show conversation.
 *
 * Design: Claude.ai input bar at bottom, conversation expands up.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ChevronUp,
  X,
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
}

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
  };
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
  projects: 'Home',
};

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({ contextProfile }) => {
  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';

  // Auto-scroll when new messages
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isExpanded]);

  // Auto-expand when first message is sent
  useEffect(() => {
    if (messages.length > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

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
    setIsExpanded(true);
    setIsThinking(true);

    try {
      const response = await fetch('/api/lumen-cortex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            screen: contextProfile?.screenName,
            project: contextProfile?.activeProject,
            projectId: contextProfile?.projectId,
            productType: contextProfile?.productType,
            userRole: contextProfile?.userRole,
          },
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.response || data.message || 'I can help with that. Could you share more details?',
        timestamp: new Date(),
      }]);
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

  return (
    <div className="flex-shrink-0 border-t border-zinc-200 bg-white relative z-30">
      {/* ── Expanded conversation area ── */}
      <AnimatePresence>
        {isExpanded && messages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden border-t border-zinc-100"
          >
            <div className="max-h-[40vh] overflow-y-auto zen-scroll" style={{ scrollbarWidth: 'thin' }}>
              {/* Header with collapse + clear */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-white/95 backdrop-blur-sm border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-zinc-700">AnA</span>
                  {contextProfile?.activeProject && (
                    <span className="text-[10px] text-zinc-400">&middot; {contextProfile.activeProject}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={() => { setMessages([]); setIsExpanded(false); }}
                      className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Clear conversation"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                    title="Collapse"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
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
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        isUser ? 'bg-zinc-700 text-white' : 'bg-violet-600'
                      )}>
                        {isUser ? (
                          <span className="text-[9px] font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span>
                        ) : (
                          <Sparkles className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-zinc-800">{isUser ? 'You' : 'AnA'}</span>
                        {isUser ? (
                          <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>
                        ) : (
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
                        )}
                        {!isUser && (
                          <div className={cn(
                            'flex items-center gap-0.5 mt-1 transition-opacity duration-150',
                            showActions === msg.id ? 'opacity-100' : 'opacity-0'
                          )}>
                            <button onClick={() => handleCopy(msg.id, msg.content)} className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Copy">
                              {copiedId === msg.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <button className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Good"><ThumbsUp className="w-3 h-3" /></button>
                            <button className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Bad"><ThumbsDown className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Thinking indicator */}
              {isThinking && (
                <div className="px-4 py-3 bg-white">
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-zinc-800">AnA</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                        </div>
                        <span className="text-xs text-violet-600 font-medium">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom input bar — always visible ── */}
      <div className="px-4 py-2.5 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            'flex items-end gap-2 px-3.5 py-2.5 bg-zinc-50 border rounded-2xl transition-all duration-200',
            isFocused
              ? 'border-blue-300 ring-4 ring-blue-50 bg-white shadow-sm'
              : 'border-zinc-200 hover:border-zinc-300'
          )}>
            {/* Context indicator */}
            <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
              <Sparkles className="w-4 h-4 text-violet-500" />
              {screenLabel && (
                <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">{screenLabel}</span>
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
              placeholder="Ask AnA anything about this workspace..."
              rows={1}
              className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-sm leading-6 min-h-[24px] max-h-[120px]"
            />

            {/* Expand/collapse toggle */}
            {messages.length > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex-shrink-0 p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"
                title={isExpanded ? 'Collapse conversation' : 'Show conversation'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            )}

            {/* Send */}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isThinking}
              className={cn(
                'flex-shrink-0 p-2 rounded-full transition-all duration-200',
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
