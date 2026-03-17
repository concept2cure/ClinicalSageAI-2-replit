/**
 * @fileoverview AnA Persistent Conversation Panel
 * @module concept2cure/components/chat/AnaPersistentPanel
 *
 * A persistent, collapsible AI conversation panel that lives on every page.
 * Users can ask AnA to populate forms, draft documents, audit content,
 * and take actions across the entire platform.
 *
 * Slides in from the right edge. Always accessible via a floating button.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Brain,
  X,
  Send,
  Paperclip,
  Sparkles,
  ChevronDown,
  Minimize2,
  Maximize2,
  Copy,
  Check,
  RotateCcw,
  FileText,
  ClipboardList,
  PenLine,
  ShieldCheck,
  Search,
  Loader2,
  MessageSquare,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
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

// ─── Quick action suggestions based on context ──────────────────────────────

const CONTEXT_SUGGESTIONS: Record<string, Array<{ label: string; prompt: string; icon: React.ElementType }>> = {
  default: [
    { label: 'Draft a document', prompt: 'Help me draft a new regulatory document for this project', icon: PenLine },
    { label: 'Audit current work', prompt: 'Review and audit the current project artifacts for compliance gaps', icon: ShieldCheck },
    { label: 'Search evidence', prompt: 'Search for relevant clinical evidence and precedents', icon: Search },
    { label: 'Populate a form', prompt: 'Help me fill out the required forms for this submission', icon: ClipboardList },
  ],
  'regulatory-workspace': [
    { label: 'Generate gap analysis', prompt: 'Run a gap analysis on the current regulatory dossier', icon: Search },
    { label: 'Draft Module 2 summary', prompt: 'Help me draft the Module 2 clinical overview summary', icon: PenLine },
    { label: 'Check compliance', prompt: 'Verify compliance with current FDA/EMA requirements', icon: ShieldCheck },
    { label: 'Review evidence links', prompt: 'Audit cross-reference linkages in the submission package', icon: FileText },
  ],
  'ind-workspace': [
    { label: 'Draft IND section', prompt: 'Help me author a section for the IND application', icon: PenLine },
    { label: 'Pre-IND checklist', prompt: 'Generate the pre-IND meeting checklist', icon: ClipboardList },
    { label: 'Safety narrative', prompt: 'Draft the nonclinical safety narrative for Module 2.4', icon: FileText },
    { label: 'FDA requirements', prompt: 'What are the current FDA requirements for this IND type?', icon: ShieldCheck },
  ],
  author: [
    { label: 'Co-author section', prompt: 'Help me write the next section of this document', icon: PenLine },
    { label: 'Review & improve', prompt: 'Review the current draft and suggest improvements', icon: ShieldCheck },
    { label: 'Add citations', prompt: 'Find and add relevant citations to support the current section', icon: Search },
    { label: 'Format for submission', prompt: 'Format this document according to eCTD requirements', icon: FileText },
  ],
};

// ─── Panel component ─────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({ contextProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const screenName = contextProfile?.screenName || 'default';
  const suggestions = CONTEXT_SUGGESTIONS[screenName] || CONTEXT_SUGGESTIONS.default;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMsg: AnaMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Call Lumen Cortex API
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

      const assistantMsg: AnaMessage = {
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        content: data.response || data.message || 'I can help you with that. Could you provide more details about what you need?',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const fallbackMsg: AnaMessage = {
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        content: `I understand you'd like help with: "${text}". I'm currently working in offline mode, but I can still assist with guidance. What specific aspect would you like to explore?`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, contextProfile]);

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

  const handleClearChat = () => {
    setMessages([]);
  };

  // ── Floating trigger button ────────────────────────────────────────────────
  const TriggerButton = (
    <motion.button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-20 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-200"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      <Brain className="w-4 h-4" />
      <span className="text-sm font-medium">Ask AnA</span>
      {messages.length > 0 && (
        <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
      )}
    </motion.button>
  );

  // ── Panel ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating button - visible when panel is closed */}
      <AnimatePresence>
        {!isOpen && TriggerButton}
      </AnimatePresence>

      {/* Slide-over panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/20 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              className={cn(
                'fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-zinc-200 shadow-2xl shadow-zinc-900/10',
                isExpanded ? 'w-full md:w-[600px]' : 'w-full md:w-[400px]'
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-blue-50/30 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                    <Brain className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 leading-tight">AnA</h2>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      {contextProfile?.activeProject
                        ? `Working on ${contextProfile.activeProject}`
                        : 'Your AI regulatory assistant'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={handleClearChat}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                      title="Clear conversation"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors hidden md:flex"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Context bar */}
              {contextProfile?.screenName && (
                <div className="px-4 py-1.5 bg-blue-50/50 border-b border-blue-100/50 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  <p className="text-[11px] text-blue-600 truncate">
                    Context: <span className="font-medium">{contextProfile.screenName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    {contextProfile.activeProject && (
                      <> &middot; {contextProfile.activeProject}</>
                    )}
                  </p>
                </div>
              )}

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
                {messages.length === 0 ? (
                  /* Empty state with suggestions */
                  <div className="flex flex-col items-center justify-center h-full px-6 py-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center mb-4">
                      <Brain className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 mb-1">How can I help?</h3>
                    <p className="text-sm text-zinc-500 text-center mb-6 max-w-[280px]">
                      I can draft documents, populate forms, audit content, search evidence, and more.
                    </p>

                    <div className="w-full space-y-2">
                      {suggestions.map(suggestion => {
                        const Icon = suggestion.icon;
                        return (
                          <button
                            key={suggestion.label}
                            onClick={() => handleSend(suggestion.prompt)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-zinc-200 hover:border-blue-300 hover:bg-blue-50/50 text-left transition-all duration-150 group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                              <Icon className="w-4 h-4 text-zinc-500 group-hover:text-blue-600 transition-colors" />
                            </div>
                            <span className="text-sm text-zinc-700 group-hover:text-zinc-900 transition-colors">{suggestion.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Message list */
                  <div className="px-4 py-4 space-y-4">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex gap-2.5',
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Brain className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
                          )}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-1 mt-2 -mb-0.5">
                              <button
                                onClick={() => handleCopy(msg.id, msg.content)}
                                className="p-1 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                                title="Copy"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-3 h-3 text-white" />
                        </div>
                        <div className="bg-zinc-100 rounded-2xl rounded-bl-md px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="flex-shrink-0 border-t border-zinc-100 bg-white p-3">
                <div className="flex items-end gap-2 bg-zinc-50 rounded-xl border border-zinc-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask AnA anything..."
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 resize-none outline-none max-h-32 leading-relaxed"
                    style={{ minHeight: '24px' }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                      input.trim() && !isLoading
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5 px-1">
                  AnA can draft, audit, populate forms, and take actions. Press Enter to send.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AnaPersistentPanel;
