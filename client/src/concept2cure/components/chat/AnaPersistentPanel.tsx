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
  /** Pre-select the chat mode (standard or deep-research) */
  defaultChatMode?: 'standard' | 'deep-research';
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
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research'>(defaultChatMode);
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
    const STANDARD_THINKING = [
      'Reviewing your regulatory landscape...',
      'Cross-referencing guidance documents...',
      'Checking the latest FDA updates...',
      'Let me dig into the CTD modules for you...',
      'Analyzing your submission strategy...',
      'Running compliance checks...',
      'Connecting the regulatory dots...',
      'Almost there — dotting the i\'s on 21 CFR Part 11...',
      'Warming up the ELSA engines... no, not that one ❄️',
      'Consulting my regulatory crystal ball...',
      'Searching through 65 ICH guidelines...',
      'Making sure everything is submission-ready...',
      'Checking predicate devices and precedents...',
      'Let it flow, let it flow... through the review process 🏔️',
      'Building your regulatory snowglobe of insights...',
    ];
    const DEEP_RESEARCH_THINKING = [
      'Querying ClinicalTrials.gov for matching studies...',
      'Searching PubMed for relevant literature...',
      'Checking FDA approval histories...',
      'Scanning EMA assessment reports...',
      'Aggregating results across data sources...',
      'Cross-referencing regulatory precedents...',
      'Building the competitive landscape...',
      'Claude is synthesizing findings into a briefing...',
      'Analyzing evidence coverage gaps...',
      'Ranking results by regulatory relevance...',
    ];
    const ANA_THINKING_MESSAGES = chatMode === 'deep-research' ? DEEP_RESEARCH_THINKING : STANDARD_THINKING;
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

    // Deep Research mode — launch a job and stream progress
    if (chatMode === 'deep-research') {
      try {
        // Launch job
        const launchRes = await fetch('/api/deep-research/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: { indication: text, keywords: text.split(/\s+/).filter(w => w.length > 3) },
            connectorIds: ['clinical_trials_gov', 'pubmed', 'fda_drugs', 'ema_epar'],
            depth: 'standard',
            projectId: contextProfile?.projectId || null,
          }),
        });

        if (!launchRes.ok) {
          const err = await launchRes.json().catch(() => ({ error: 'Failed to launch research job' }));
          throw new Error(err.error || `HTTP ${launchRes.status}`);
        }

        const job = await launchRes.json();
        const jobId = job.id;

        // Add progress message that we'll update
        const progressMsgId = `dr-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: progressMsgId,
          role: 'assistant',
          content: `**Deep Research initiated** — searching ClinicalTrials.gov, PubMed, FDA, EMA...\n\nProgress: 0%`,
          timestamp: new Date(),
        }]);

        // Stream progress via SSE
        const eventSource = new EventSource(`/api/deep-research/jobs/${jobId}/stream`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.error) {
              eventSource.close();
              setMessages(prev => prev.map(m =>
                m.id === progressMsgId
                  ? { ...m, content: `**Deep Research failed:** ${data.error}` }
                  : m
              ));
              setIsThinking(false);
              return;
            }

            const statusLabel = data.status === 'synthesizing' ? 'Synthesizing findings with Claude...' : 'Searching data sources...';
            setMessages(prev => prev.map(m =>
              m.id === progressMsgId
                ? { ...m, content: `**Deep Research in progress** — ${statusLabel}\n\nProgress: ${data.progress}%` }
                : m
            ));

            if (data.status === 'complete' || data.status === 'failed') {
              eventSource.close();

              // Fetch final results
              fetch(`/api/deep-research/jobs/${jobId}`)
                .then(r => r.json())
                .then(finalJob => {
                  const synthesis = finalJob.synthesis || 'Research complete. No synthesis available.';
                  const totalResults = finalJob.results?.totalResults || 0;
                  setMessages(prev => prev.map(m =>
                    m.id === progressMsgId
                      ? { ...m, content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}` }
                      : m
                  ));
                })
                .catch(() => {
                  setMessages(prev => prev.map(m =>
                    m.id === progressMsgId
                      ? { ...m, content: `**Deep Research complete** — results are available in the research dashboard.` }
                      : m
                  ));
                })
                .finally(() => setIsThinking(false));
              return;
            }
          } catch {
            // Parse error — ignore
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          // SSE disconnected — poll for final state
          fetch(`/api/deep-research/jobs/${jobId}`)
            .then(r => r.json())
            .then(finalJob => {
              if (finalJob.status === 'complete') {
                const synthesis = finalJob.synthesis || 'Research complete.';
                const totalResults = finalJob.results?.totalResults || 0;
                setMessages(prev => prev.map(m =>
                  m.id === progressMsgId
                    ? { ...m, content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}` }
                    : m
                ));
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === progressMsgId
                    ? { ...m, content: `**Deep Research** — Job #${jobId} is still running. Check the research dashboard for results.` }
                    : m
                ));
              }
            })
            .catch(() => {})
            .finally(() => setIsThinking(false));
        };

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `**Deep Research could not be launched:** ${errorMsg}\n\nThis may be due to quota limits or missing permissions. Try again or switch to standard mode.`,
          timestamp: new Date(),
        }]);
        setIsThinking(false);
      }
      return;
    }

    // Standard chat mode
    try {
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
  }, [input, isThinking, messages, contextProfile, chatMode]);

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
          <div className="max-h-[50vh] overflow-y-auto zen-scroll border-t border-zinc-100" style={{ scrollbarWidth: 'thin' }}>
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
              return (
                <div key={msg.id} className={cn('group px-4 py-3', isUser ? 'bg-zinc-50/60' : 'bg-white')}>
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', isUser ? 'bg-zinc-700 text-white' : 'bg-violet-600')}>
                      {isUser ? <span className="text-[9px] font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span> : <Sparkles className="w-3 h-3 text-white" />}
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
                  <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5"><Sparkles className="w-3 h-3 text-white" /></div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-800">AnA</span>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
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
                {screenLabel && <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">{screenLabel}</span>}
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
              <div className="mb-8">
                <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-900">{defaultGreeting}</h2>
                {screenLabel && (
                  <p className="text-sm text-zinc-400 mt-1">{screenLabel}</p>
                )}
              </div>

              {/* Suggested actions */}
              {suggestedActions && suggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                  {suggestedActions.slice(0, 4).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleSuggestedAction(action)}
                      className="text-left px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors group"
                    >
                      <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{action.label}</p>
                      {action.description && (
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{action.description}</p>
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
                      <span className="text-xs text-violet-600 font-medium">{thinkingMsg || 'Thinking...'}</span>
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
      <div className="flex-shrink-0 px-4 py-3 border-t border-zinc-100 bg-white">
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
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
                )}
              >
                {chatMode === 'deep-research' ? (
                  <Zap className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {chatMode === 'deep-research' ? 'Deep Research' : 'AnA'}
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
                      <div className="text-[11px] text-zinc-400 leading-tight">Fast regulatory co-pilot for everyday questions</div>
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
                      <div className="text-[11px] text-zinc-400 leading-tight">Multi-source search across ClinicalTrials.gov, PubMed, FDA &amp; more</div>
                    </div>
                    {chatMode === 'deep-research' && <Check className="w-4 h-4 text-violet-600 ml-auto mt-0.5 flex-shrink-0" />}
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
              placeholder={chatMode === 'deep-research' ? 'Ask a deep research question...' : 'Message AnA...'}
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
