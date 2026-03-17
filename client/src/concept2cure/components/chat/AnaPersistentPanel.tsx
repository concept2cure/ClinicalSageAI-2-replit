/**
 * @fileoverview AnA — Persistent AI conversation surface
 * @module concept2cure/components/chat/AnaPersistentPanel
 * @version 2.0.0
 *
 * @description
 * A persistent, context-aware AI conversation panel that lives alongside
 * every workspace surface. Not a chatbot widget — a co-pilot pane.
 *
 * Design follows Zen system principles:
 * - Content-first: messages are the hero, UI recedes
 * - Deference: the panel is a quiet collaborator, not a flashy overlay
 * - Breathing room: generous spacing, unhurried layout
 * - Intentional motion: smooth, purposeful spring animations
 *
 * Matches ZenChat's message styling, input area, thinking indicator,
 * prose rendering, and avatar patterns exactly.
 *
 * @compliance
 * - FDA 21 CFR Part 11: All messages timestamped
 * - WCAG 2.1 AA: Keyboard navigable, screen reader friendly
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import {
  Sparkles,
  X,
  ArrowUp,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  PenLine,
  ShieldCheck,
  Search,
  ClipboardList,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

// Configure marked for clean output
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

// ─── Context-aware suggestion prompts ────────────────────────────────────────
// Mirrors Claude.ai's suggestion card pattern — concise, actionable,
// with a secondary description that adds specificity.

interface Suggestion {
  label: string;
  sub: string;
  prompt: string;
  icon: React.ElementType;
}

const CONTEXT_SUGGESTIONS: Record<string, Suggestion[]> = {
  default: [
    { label: 'Draft a regulatory document', sub: 'Module 2 summaries, cover letters, narratives', prompt: 'Help me draft a new regulatory document for this project', icon: PenLine },
    { label: 'Audit for compliance gaps', sub: 'Cross-reference linkages, missing metadata', prompt: 'Review and audit the current project artifacts for compliance gaps', icon: ShieldCheck },
    { label: 'Search clinical evidence', sub: 'Precedents, literature, prior submissions', prompt: 'Search for relevant clinical evidence and precedents', icon: Search },
    { label: 'Populate submission forms', sub: 'Pre-fill from project context', prompt: 'Help me fill out the required forms for this submission', icon: ClipboardList },
  ],
  'regulatory-workspace': [
    { label: 'Run gap analysis', sub: 'Identify missing evidence and linkages', prompt: 'Run a gap analysis on the current regulatory dossier', icon: Search },
    { label: 'Draft Module 2 summary', sub: 'Clinical overview, nonclinical summary', prompt: 'Help me draft the Module 2 clinical overview summary', icon: PenLine },
    { label: 'Verify FDA/EMA compliance', sub: 'Authority-specific requirement checks', prompt: 'Verify compliance with current FDA/EMA requirements', icon: ShieldCheck },
    { label: 'Audit cross-references', sub: 'Validate linkages in the dossier', prompt: 'Audit cross-reference linkages in the submission package', icon: FileText },
  ],
  'ind-workspace': [
    { label: 'Author IND section', sub: 'Module 2.4, 2.5, 2.6, 2.7', prompt: 'Help me author a section for the IND application', icon: PenLine },
    { label: 'Pre-IND meeting prep', sub: 'Checklist, briefing document, questions', prompt: 'Generate the pre-IND meeting checklist and briefing document', icon: ClipboardList },
    { label: 'Draft safety narrative', sub: 'Nonclinical pharmacology & toxicology', prompt: 'Draft the nonclinical safety narrative for Module 2.4', icon: FileText },
    { label: 'Check IND requirements', sub: 'Current FDA guidance and expectations', prompt: 'What are the current FDA requirements for this IND type?', icon: ShieldCheck },
  ],
  author: [
    { label: 'Co-author this section', sub: 'Continue writing with AnA', prompt: 'Help me write the next section of this document', icon: PenLine },
    { label: 'Review and improve', sub: 'Clarity, completeness, regulatory tone', prompt: 'Review the current draft and suggest improvements', icon: ShieldCheck },
    { label: 'Find citations', sub: 'Literature and regulatory references', prompt: 'Find and add relevant citations to support the current section', icon: Search },
    { label: 'Format for eCTD', sub: 'Structure, numbering, cross-references', prompt: 'Format this document according to eCTD requirements', icon: FileText },
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({ contextProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showActions, setShowActions] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const screenName = contextProfile?.screenName || 'default';
  const suggestions = CONTEXT_SUGGESTIONS[screenName] || CONTEXT_SUGGESTIONS.default;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
        content: `I understand you'd like help with that. I'm currently working in offline mode — let me know what specific aspect you'd like to explore and I'll provide guidance.`,
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

  // ── Trigger ────────────────────────────────────────────────────────────────
  // Quiet, professional. Not a chatbot bubble — a tool access point.

  return (
    <>
      {/* Trigger button — bottom-right, minimal */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 h-10 pl-3.5 pr-4 rounded-full bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            aria-label="Open AnA assistant"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">AnA</span>
            {messages.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            <motion.aside
              className="fixed right-0 top-0 bottom-0 z-40 w-full md:w-[420px] flex flex-col bg-white border-l border-zinc-200 shadow-xl shadow-zinc-900/5"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              role="complementary"
              aria-label="AnA assistant panel"
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-zinc-900">AnA</span>
                    {contextProfile?.activeProject && (
                      <span className="text-xs text-zinc-400 ml-1.5">&middot; {contextProfile.activeProject}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                      title="New conversation"
                      aria-label="Clear conversation"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── Messages ── */}
              <div
                className="flex-1 overflow-y-auto min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                {messages.length === 0 ? (
                  // ── Empty state — mirrors Claude.ai welcome ──
                  <div className="flex flex-col h-full">
                    <div className="flex-1 flex flex-col items-center justify-center px-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20 mb-5">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <h2 className="text-lg font-semibold text-zinc-900 mb-1.5">
                        How can I help?
                      </h2>
                      <p className="text-sm text-zinc-500 text-center leading-relaxed max-w-[300px] mb-8">
                        I can draft documents, audit compliance, populate forms, search evidence, and take actions across your workspace.
                      </p>

                      {/* Suggestion cards — Claude.ai pattern */}
                      <div className="w-full space-y-2">
                        {suggestions.map(s => {
                          const Icon = s.icon;
                          return (
                            <button
                              key={s.label}
                              onClick={() => handleSend(s.prompt)}
                              className="group w-full flex items-start gap-3 p-3 rounded-xl border border-zinc-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 text-left transition-all duration-150"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-900 group-hover:text-blue-800 mb-0.5">
                                  {s.label}
                                </div>
                                <div className="text-xs text-zinc-400">{s.sub}</div>
                              </div>
                              <ArrowUp className="w-4 h-4 text-zinc-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 rotate-45 transition-colors" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  // ── Conversation ──
                  <div>
                    {messages.map(msg => {
                      const isUser = msg.role === 'user';
                      const htmlContent = !isUser ? renderMarkdown(msg.content) : '';

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'group py-5 px-5',
                            isUser ? 'bg-zinc-50/60' : 'bg-white border-b border-zinc-100/80'
                          )}
                          onMouseEnter={() => !isUser && setShowActions(msg.id)}
                          onMouseLeave={() => setShowActions(null)}
                        >
                          <div className="flex gap-3">
                            {/* Avatar */}
                            <div className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm',
                              isUser
                                ? 'bg-zinc-800 text-white'
                                : 'bg-gradient-to-br from-violet-500 to-violet-700'
                            )}>
                              {isUser ? (
                                <span className="text-[10px] font-bold leading-none">
                                  {(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}
                                </span>
                              ) : (
                                <Sparkles className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-zinc-900">
                                {isUser ? 'You' : 'AnA'}
                              </span>

                              {isUser ? (
                                <p className="text-zinc-800 leading-relaxed whitespace-pre-wrap text-sm mt-1">
                                  {msg.content}
                                </p>
                              ) : (
                                <div
                                  className="prose prose-sm prose-zinc max-w-none mt-1
                                    prose-headings:font-semibold prose-headings:text-zinc-900 prose-headings:leading-snug
                                    prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                                    prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-2
                                    prose-strong:text-zinc-900 prose-strong:font-semibold
                                    prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                                    prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:text-xs
                                    prose-blockquote:border-l-violet-400 prose-blockquote:text-zinc-600 prose-blockquote:not-italic
                                    prose-ul:text-zinc-700 prose-ol:text-zinc-700
                                    prose-li:my-0.5
                                    prose-table:text-sm prose-th:bg-zinc-50 prose-th:font-semibold prose-td:border-zinc-200
                                    prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                                    [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                                />
                              )}

                              {/* Action buttons — show on hover, Claude.ai pattern */}
                              {!isUser && (
                                <div className={cn(
                                  'flex items-center gap-0.5 mt-2 transition-opacity duration-150',
                                  showActions === msg.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                )}>
                                  <button
                                    onClick={() => handleCopy(msg.id, msg.content)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                                    title="Copy"
                                  >
                                    {copiedId === msg.id ? (
                                      <Check className="w-3.5 h-3.5 text-green-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Good response">
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Bad response">
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Thinking indicator — matches ZenChat exactly */}
                    {isThinking && (
                      <div className="py-5 px-5 bg-white border-b border-zinc-100/80">
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                            <Sparkles className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-zinc-900">AnA</span>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="relative flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                              </div>
                              <span className="text-sm text-violet-600 font-medium animate-pulse">Thinking...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* ── Input area — matches ZenChat exactly ── */}
              <div className="flex-shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
                <div className={cn(
                  'flex items-end gap-2 px-4 py-3 bg-white border rounded-2xl transition-all duration-200',
                  isFocused
                    ? 'border-blue-300 ring-4 ring-blue-50 shadow-sm'
                    : 'border-zinc-200 hover:border-zinc-300'
                )}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="Message AnA..."
                    rows={1}
                    className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-sm leading-6 min-h-[24px] max-h-[160px]"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isThinking}
                    className={cn(
                      'flex-shrink-0 p-2 rounded-full transition-all duration-200',
                      input.trim() && !isThinking
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800 hover:scale-105'
                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                    )}
                    aria-label="Send message"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-center text-[11px] text-zinc-400 mt-2">
                  AnA can make mistakes. Verify critical regulatory decisions.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AnaPersistentPanel;
